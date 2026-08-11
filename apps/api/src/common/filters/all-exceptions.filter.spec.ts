import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ErrorCode, isErrorEnvelope, type ErrorEnvelope } from '@forge/shared';
import { z } from 'zod';

import { AllExceptionsFilter } from './all-exceptions.filter';

/**
 * The error envelope is a contract with five client apps. These tests pin the two
 * properties that matter: clients can branch on `code`, and a 5xx never leaks internals.
 */

interface Captured {
  status: number;
  body: ErrorEnvelope;
  headers: Record<string, string>;
}

function runFilter(exception: unknown, isProduction = false): Captured {
  const captured: Captured = {
    status: 0,
    body: undefined as unknown as ErrorEnvelope,
    headers: {},
  };

  const response = {
    getHeader: (name: string) => (name === 'x-request-id' ? 'req-abc-123' : undefined),
    setHeader: (name: string, value: string) => {
      captured.headers[name] = value;
    },
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: ErrorEnvelope) {
      captured.body = body;
      return this;
    },
  };

  const request = { method: 'POST', url: '/api/v1/auth/verify?phone=%2B919876543210' };

  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter(isProduction).catch(exception, host);
  return captured;
}

describe('AllExceptionsFilter', () => {
  it('always produces a recognisable envelope', () => {
    const { body } = runFilter(new NotFoundException('Gym not found'));

    expect(isErrorEnvelope(body)).toBe(true);
    expect(body.error.requestId).toBe('req-abc-123');
    expect(new Date(body.error.timestamp).toISOString()).toBe(body.error.timestamp);
  });

  it('never includes the tenant id, which would leak it into client logs', () => {
    const { body } = runFilter(new ForbiddenException('nope'));
    expect(JSON.stringify(body)).not.toMatch(/studioId|studio_id/);
  });

  describe('status to code mapping', () => {
    it.each([
      [new NotFoundException(), HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND],
      [new ForbiddenException(), HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN],
      [new BadRequestException(), HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED],
      [
        new HttpException('x', HttpStatus.UNAUTHORIZED),
        HttpStatus.UNAUTHORIZED,
        ErrorCode.UNAUTHENTICATED,
      ],
      [new HttpException('x', HttpStatus.CONFLICT), HttpStatus.CONFLICT, ErrorCode.CONFLICT],
      [
        new HttpException('x', HttpStatus.TOO_MANY_REQUESTS),
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RATE_LIMITED,
      ],
      [new HttpException('x', 426), 426, ErrorCode.CLIENT_TOO_OLD],
    ])('maps status %#', (exception, expectedStatus, expectedCode) => {
      const { status, body } = runFilter(exception);
      expect(status).toBe(expectedStatus);
      expect(body.error.code).toBe(expectedCode);
    });
  });

  describe('zod errors', () => {
    it('becomes VALIDATION_FAILED with per-field details', () => {
      const schema = z.object({ phone: z.string().min(13), otp: z.string().length(6) });
      const parsed = schema.safeParse({ phone: 'short', otp: '1' });
      const error = parsed.success ? new Error('unreachable') : parsed.error;

      const { status, body } = runFilter(error);

      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(body.error.details?.map((d) => d.path).sort()).toEqual(['otp', 'phone']);
      // A machine-readable per-field code, so a client can highlight the right input
      // without parsing prose.
      expect(body.error.details?.[0]?.code).toBeTruthy();
    });
  });

  describe('5xx handling', () => {
    const leaky = new Error(
      'insert into "memberships" failed: duplicate key value violates constraint "memberships_studio_user_role_key"',
    );

    it('leaks nothing in production', () => {
      const { status, body } = runFilter(leaky, true);

      expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(body.error.code).toBe(ErrorCode.INTERNAL);
      expect(body.error.message).not.toContain('memberships');
      expect(body.error.message).not.toContain('insert into');
      // The requestId is the bridge to the real error, which is in the log line.
      expect(body.error.message).toMatch(/request id/i);
      expect(body.error.requestId).toBe('req-abc-123');
    });

    it('keeps the real message in development, where it is what you need', () => {
      const { body } = runFilter(leaky, false);
      expect(body.error.message).toContain('memberships');
    });

    it('marks 5xx retryable and 4xx not', () => {
      expect(runFilter(leaky).body.error.retryable).toBe(true);
      expect(runFilter(new NotFoundException()).body.error.retryable).toBe(false);
    });
  });

  describe('rate limiting', () => {
    it('sets Retry-After so a client backs off rather than hammering', () => {
      const { headers, body } = runFilter(
        new HttpException('slow down', HttpStatus.TOO_MANY_REQUESTS),
      );

      expect(body.error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(body.error.retryable).toBe(true);
      expect(headers['Retry-After']).toBe('60');
    });
  });

  it('respects a code a handler already chose rather than re-deriving one', () => {
    const exception = new HttpException(
      { code: ErrorCode.CLIENT_TOO_OLD, message: 'Update required to continue.' },
      HttpStatus.BAD_REQUEST,
    );

    const { body } = runFilter(exception);

    expect(body.error.code).toBe(ErrorCode.CLIENT_TOO_OLD);
    expect(body.error.message).toBe('Update required to continue.');
  });

  it('handles a non-Error throw without crashing the filter', () => {
    const { status, body } = runFilter('a bare string');
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.error.code).toBe(ErrorCode.INTERNAL);
  });

  it('flattens the array message Nest validation pipes produce', () => {
    const { body } = runFilter(new BadRequestException(['phone must be valid', 'otp is required']));
    expect(body.error.message).toBe('phone must be valid; otp is required');
  });
});
