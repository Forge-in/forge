'use server';

import { ForgeApiError, ForgeNetworkError } from '@forge/api-client';
import { v1 } from '@forge/shared';
import { redirect } from 'next/navigation';

import { serverApi } from '../../lib/api';
import { safeDestination } from '../../lib/redirect';
import { writeSession } from '../../lib/session';

/**
 * Sign-in, as server actions.
 *
 * Server actions rather than client-side fetch because the tokens must never reach the
 * browser: the response is written straight into an httpOnly cookie here, so there is no
 * point at which JavaScript could read it.
 */

export interface FormState {
  status: 'idle' | 'codeSent' | 'error';
  message?: string;
  /** Keyed by field, for highlighting the offending input. */
  fieldErrors?: Record<string, string>;
  phone?: string;
}

/**
 * Turns any thrown value into something renderable.
 *
 * Three distinct outcomes matter to a user and are easy to collapse by accident: their input
 * was wrong, the service refused them, or the request never arrived. Only the first is
 * worth showing field-level detail for.
 */
function toFormState(error: unknown, phone?: string): FormState {
  if (error instanceof ForgeApiError) {
    return {
      status: 'error',
      message: error.message,
      fieldErrors: error.fieldErrors(),
      ...(phone ? { phone } : {}),
    };
  }

  if (error instanceof ForgeNetworkError) {
    return {
      status: 'error',
      message: 'Could not reach Forge. Check your connection and try again.',
      ...(phone ? { phone } : {}),
    };
  }

  // Never surface an unknown error's message: it can carry internals.
  return { status: 'error', message: 'Something went wrong. Please try again.' };
}

export async function requestOtp(_previous: FormState, formData: FormData): Promise<FormState> {
  const raw = String(formData.get('phone') ?? '').trim();

  /**
   * Validated with the SAME schema the API uses, so the two cannot disagree. A separate
   * client-side rule would drift and start rejecting numbers the API accepts (or worse, the
   * reverse), and this shape is the only place that would show it.
   */
  const parsed = v1.requestOtpBody.safeParse({ phone: raw });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Enter a valid Indian mobile number.',
      fieldErrors: { phone: parsed.error.issues[0]?.message ?? 'Invalid number' },
      phone: raw,
    };
  }

  try {
    await serverApi().requestOtp(parsed.data);
    return { status: 'codeSent', phone: parsed.data.phone };
  } catch (error) {
    return toFormState(error, parsed.data.phone);
  }
}

export async function verifyOtp(_previous: FormState, formData: FormData): Promise<FormState> {
  const phone = String(formData.get('phone') ?? '');
  const otp = String(formData.get('otp') ?? '').trim();

  /**
   * Where the proxy was trying to send them before sign-in interrupted.
   *
   * Read through `safeDestination`, which rejects anything that is not a local
   * path — this value reaches us from the query string, so without that check
   * the login screen is an open redirect with the real domain in front of it.
   */
  const next = safeDestination(String(formData.get('next') ?? ''));

  const parsed = v1.verifyOtpBody.safeParse({ phone, otp });

  if (!parsed.success) {
    return {
      status: 'codeSent',
      message: 'Enter the 6-digit code.',
      fieldErrors: { otp: 'Must be 6 digits' },
      phone,
    };
  }

  let result: v1.VerifyOtpResponse;
  try {
    result = await serverApi().verifyOtp(parsed.data);
  } catch (error) {
    return { ...toFormState(error, phone), status: 'codeSent' };
  }

  /**
   * A person with memberships at several studios has to choose. Signing them into the first
   * one would silently put a trainer in the wrong business — so this returns rather than
   * guessing. The studio picker is the next screen to build.
   */
  if (result.status === 'needsStudioSelection') {
    return {
      status: 'error',
      message: `This number belongs to ${result.memberships.length} studios. Studio selection is not built yet.`,
      phone,
    };
  }

  await writeSession(result.tokens);

  // redirect() throws internally, so it must sit outside the try/catch above — otherwise the
  // control-flow exception is caught and reported to the user as a failure.
  redirect(next);
}
