import { Body, PipeTransform, Injectable } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates a request body against a schema from @forge/shared.
 *
 * The point is that the API and every client validate against the SAME schema object.
 * class-validator DTOs would mean the shape is written twice — once as decorators here,
 * once as types in the clients — and the two drift silently, because nothing compares them.
 *
 * A ZodError thrown here is turned into a VALIDATION_FAILED envelope with per-field details
 * by AllExceptionsFilter, so the client can highlight the offending input.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    /**
     * `parse`, not `safeParse`: throwing is the intended path. The filter already renders
     * ZodError correctly, and returning the parsed value means the handler receives data
     * that has been coerced and stripped — not merely checked.
     *
     * That distinction matters. zod strips unknown keys, so a client cannot smuggle an
     * extra field through to a downstream insert.
     */
    return this.schema.parse(value);
  }
}

/**
 * `@ZodBody(schema)` — the body decorator and its validation in one place.
 *
 * Combining them means a handler cannot accidentally accept an unvalidated body: there is
 * no way to write `@Body()` and forget the pipe, because the only body decorator in use
 * takes a schema.
 */
export const ZodBody = <T>(schema: ZodSchema<T>) => Body(new ZodValidationPipe(schema));
