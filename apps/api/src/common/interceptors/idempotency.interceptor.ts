import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type AccessTokenPayload } from '@forge/shared';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { Observable, from, of, switchMap, tap } from 'rxjs';

import { REDIS } from '../../redis/redis.module';

export const IDEMPOTENT_KEY = 'http:idempotent';

/**
 * Marks a route as replay-safe.
 *
 * Opt-in rather than global: a GET needs nothing, and applying this to every mutation would
 * cache responses for requests where a second call is legitimately a second action ("add
 * another set", "send another invite").
 *
 * Put it on anything where a duplicate is expensive or wrong: check-ins, payments, invites,
 * anything that sends an SMS.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

/** How long a completed response is replayable. Longer than any client's retry schedule. */
const RETENTION_SECONDS = 24 * 60 * 60;

/** Guards against a replay arriving while the original is still running. */
const IN_FLIGHT_SECONDS = 60;

interface StoredResponse {
  status: number;
  body: unknown;
}

const IN_FLIGHT = '__in_flight__';

/**
 * Makes a marked route safe to call twice.
 *
 * The problem is not theoretical for this product. Gym floors have poor signal, the mobile
 * apps queue writes, and requests get retried — by the platform, by a proxy, by a user
 * tapping again because nothing happened. Without a key the server cannot distinguish a
 * retry from a second intent: for a check-in that is a duplicate row, and for a payment it
 * is a second charge.
 *
 * The mechanism is built now, before anything needs it, because the alternative is adding it
 * during a payments launch under time pressure with money involved.
 *
 * Note this is HTTP-level de-duplication. It complements, and does not replace, a database
 * uniqueness constraint — attendance still carries UNIQUE(studio_id, idempotency_key),
 * because a retry arriving after the 24h window must still not create a second row.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isIdempotent) return next.handle();

    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    const response = context.switchToHttp().getResponse<Response>();

    const header = request.headers['idempotency-key'];
    const clientKey = Array.isArray(header) ? header[0] : header;

    /**
     * A missing key is a client bug, not something to paper over. Silently proceeding would
     * let exactly the duplicate this route is protected against through, so it fails loudly
     * — and @forge/api-client attaches one to every mutating request automatically, so a
     * conforming client never sees this.
     */
    if (!clientKey) {
      throw new HttpException(
        {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'This request requires an Idempotency-Key header.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    return from(this.claim(request, clientKey)).pipe(
      switchMap((existing) => {
        if (existing === IN_FLIGHT) {
          /**
           * The original is still running. 409 rather than waiting: holding the socket would
           * tie up a worker behind a request that may itself be stuck, and a client that
           * retries in a moment gets the stored response.
           */
          throw new HttpException(
            {
              code: ErrorCode.CONFLICT,
              message: 'An identical request is already in progress.',
            },
            HttpStatus.CONFLICT,
          );
        }

        if (existing) {
          const stored = JSON.parse(existing) as StoredResponse;
          this.logger.log({ event: 'idempotency.replay', key: clientKey });

          // The ORIGINAL status and body, so a retry is indistinguishable from the first
          // call. The header is what tells an interested client this was a replay.
          response.status(stored.status);
          response.setHeader('x-idempotent-replay', 'true');
          return of(stored.body);
        }

        return next.handle().pipe(
          tap({
            next: (body: unknown) => {
              void this.store(request, clientKey, response.statusCode, body);
            },
            error: () => {
              /**
               * Failures are NOT stored, and the claim is released.
               *
               * Caching a failure would make a transient error permanent for 24 hours: the
               * client retries, gets the same 500 replayed, and can never succeed.
               */
              void this.release(request, clientKey);
            },
          }),
        );
      }),
    );
  }

  /**
   * Scoped per user AND per route, not by the key alone.
   *
   * A client-generated key is only unique within that client. Without scoping, two users
   * whose apps happened to generate the same key would collide — and one would receive the
   * other's response body, which is a cross-tenant data leak through a caching layer.
   */
  private redisKey(request: Request & { user?: AccessTokenPayload }, clientKey: string): string {
    const subject = request.user?.sub ?? 'anonymous';
    const studio = request.user?.studioId ?? 'no-studio';
    // Express types `route` as any; narrowed so the type-aware lint rules stay meaningful.
    const matched = (request as Omit<Request, 'route'> & { route?: { path?: string } }).route;
    const route = `${request.method}:${matched?.path ?? request.path}`;
    return `idem:${studio}:${subject}:${route}:${clientKey}`;
  }

  /** SET NX claims the key atomically; a non-null return means someone got there first. */
  private async claim(
    request: Request & { user?: AccessTokenPayload },
    clientKey: string,
  ): Promise<string | null> {
    const key = this.redisKey(request, clientKey);
    const claimed = await this.redis.set(key, IN_FLIGHT, 'EX', IN_FLIGHT_SECONDS, 'NX');

    if (claimed) return null;
    return this.redis.get(key);
  }

  private async store(
    request: Request & { user?: AccessTokenPayload },
    clientKey: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    const payload: StoredResponse = { status, body };
    await this.redis.set(
      this.redisKey(request, clientKey),
      JSON.stringify(payload),
      'EX',
      RETENTION_SECONDS,
    );
  }

  private async release(
    request: Request & { user?: AccessTokenPayload },
    clientKey: string,
  ): Promise<void> {
    await this.redis.del(this.redisKey(request, clientKey));
  }
}
