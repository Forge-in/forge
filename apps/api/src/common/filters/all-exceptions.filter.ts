import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode, isRetryable, type ErrorDetail, type ErrorEnvelope } from '@forge/shared';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { reportError } from '../../observability/sentry';
import { REQUEST_ID_HEADER } from '../request-context';

/**
 * 426 Upgrade Required. Nest's HttpStatus enum does not include it, and it is the status
 * the forced-upgrade guard returns when a mobile build is below minSupported.
 *
 * Typed as HttpStatus rather than left as a bare number so the switch below keeps a shared
 * enum type with its cases — otherwise the type-aware lint rules stop being able to tell a
 * deliberate status from a typo.
 */
const UPGRADE_REQUIRED = 426 as HttpStatus;

/**
 * The one place a thrown value becomes an HTTP response.
 *
 * Two properties matter more than the shape itself:
 *
 *   1. A 5xx NEVER leaks internals. Stack traces, SQL fragments and driver messages
 *      routinely contain table names, column names and occasionally parameter values. In
 *      production the client gets a fixed string and a requestId; everything else goes to
 *      the log line keyed by that same id.
 *   2. Every response carries a machine-readable `code`, so clients branch on that rather
 *      than on the HTTP status or the message text.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly isProduction: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const requestId = (response.getHeader(REQUEST_ID_HEADER) as string) ?? 'unknown';
    const { status, code, message, details } = this.classify(exception);

    // Express types `route` as `any`; narrowing it here keeps the type-aware lint rules
    // meaningful instead of letting an `any` leak into the log payload.
    const route = (request as Omit<Request, 'route'> & { route?: { path?: string } }).route;

    // Log before responding: if serialisation throws, the diagnostic still exists.
    // 4xx are client mistakes and are noise at error level; 5xx are ours.
    const logPayload = {
      requestId,
      statusCode: status,
      errorCode: code,
      method: request.method,
      // The matched route pattern where available, otherwise the path — never the query
      // string, which carries search terms and filter values.
      path: route?.path ?? request.url.split('?')[0],
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        logPayload,
        exception instanceof Error ? exception.stack : String(exception),
      );

      /**
       * 5xx ONLY. A 4xx is a client mistake, not a defect — reporting those would bury real
       * issues under validation failures and make the error count meaningless.
       *
       * The user object comes from the verified token, so these tags are trustworthy. No
       * phone number is attached: requestId correlates to the log line above, which has it.
       */
      const user = (
        request as Request & { user?: { sub?: string; studioId?: string | null; role?: string } }
      ).user;

      reportError(exception, {
        requestId,
        method: request.method,
        ...(route?.path ? { path: route.path } : {}),
        ...(user?.sub ? { userId: user.sub } : {}),
        ...(user?.studioId ? { studioId: user.studioId } : {}),
        ...(user?.role ? { role: user.role } : {}),
      });
    } else {
      this.logger.warn({ ...logPayload, reason: message });
    }

    const body: ErrorEnvelope = {
      error: {
        code,
        message: this.publicMessage(status, message),
        ...(details && details.length > 0 ? { details } : {}),
        retryable: isRetryable(code),
        requestId,
        timestamp: new Date().toISOString(),
      },
    };

    if (code === ErrorCode.RATE_LIMITED) {
      response.setHeader('Retry-After', '60');
    }

    response.status(status).json(body);
  }

  /**
   * In production a 5xx message is a fixed string. The real one is already in the log,
   * correlated by requestId — which is why the id is worth surfacing in the UI.
   */
  private publicMessage(status: HttpStatus, message: string): string {
    if (this.isProduction && status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Something went wrong on our side. Quote the request id when reporting this.';
    }
    return message;
  }

  private classify(exception: unknown): {
    status: HttpStatus;
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  } {
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Request failed validation.',
        details: exception.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        })),
      };
    }

    if (exception instanceof HttpException) {
      const status: HttpStatus = exception.getStatus();
      const payload = exception.getResponse();

      // A handler may already have thrown a fully-formed envelope; respect it rather than
      // re-wrapping and losing the code it chose.
      if (typeof payload === 'object' && payload !== null && 'code' in payload) {
        const { code, message, details } = payload as {
          code: ErrorCode;
          message?: string;
          details?: ErrorDetail[];
        };
        return {
          status,
          code,
          message: message ?? exception.message,
          ...(details ? { details } : {}),
        };
      }

      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);

      return {
        status,
        code: this.codeForStatus(status),
        message: Array.isArray(message) ? message.join('; ') : message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL,
      message: exception instanceof Error ? exception.message : 'Unknown error',
    };
  }

  /**
   * Fallback for HttpExceptions thrown by Nest itself (guards, pipes, the router), which
   * carry a status but no code of ours.
   */
  private codeForStatus(status: HttpStatus): ErrorCode {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.UNPROCESSABLE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case UPGRADE_REQUIRED: // the forced-upgrade guard
        return ErrorCode.CLIENT_TOO_OLD;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return status >= HttpStatus.INTERNAL_SERVER_ERROR
          ? ErrorCode.INTERNAL
          : ErrorCode.VALIDATION_FAILED;
    }
  }
}
