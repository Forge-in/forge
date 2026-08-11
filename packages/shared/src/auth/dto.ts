import { z } from 'zod';

/** +91 mobile in E.164 (e.g. +919876543210). Adjust per region. */
export const phoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, 'Must be a valid +91 mobile number');

/**
 * Exactly six ASCII digits. `.length(6)` alone would have accepted 'hunter' and
 * '12 456'; the code is compared against a stored value, so the shape has to be
 * pinned here rather than trusted to the verify handler. Kept a string so leading
 * zeros survive — '000123' is a valid OTP and Number() would eat it.
 */
export const otpSchema = z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits');

export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: otpSchema,
});

export type RequestOtpDto = z.infer<typeof requestOtpSchema>;
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;
