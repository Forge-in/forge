import { z } from 'zod';

/** +91 mobile in E.164 (e.g. +919876543210). Adjust per region. */
export const phoneSchema = z
  .string()
  .regex(/^\+91[6-9]\d{9}$/, 'Must be a valid +91 mobile number');

export const requestOtpSchema = z.object({ phone: phoneSchema });
export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  otp: z.string().length(6),
});

export type RequestOtpDto = z.infer<typeof requestOtpSchema>;
export type VerifyOtpDto = z.infer<typeof verifyOtpSchema>;
