'use server';

import { redirect } from 'next/navigation';
import { ForgeApiError, ForgeNetworkError } from '@forge/api-client';
import { v1 } from '@forge/shared';

import { anonymousConsoleApi, consoleApi } from '@/lib/api';
import { safeDestination } from '@/lib/redirect';
import { clearSession, writeSession } from '@/lib/session';

/**
 * Console sign-in, as server actions.
 *
 * Server actions rather than client-side fetch because the tokens must never reach the
 * browser: the response is written straight into an httpOnly cookie here, so there is no
 * point at which JavaScript could read a credential that reaches every tenant.
 */

/**
 * Two steps, not three.
 *
 * Accepting an invite was originally its own stage, which was a mistake worth naming: it
 * duplicated the phone and code steps to add one extra field. An invite is not a different
 * way to sign in — it is the ordinary sign-in with a token alongside the code, which is
 * exactly what the API models (both factors, one request). One optional field on the code
 * step is the whole difference.
 */
export type LoginStage = 'phone' | 'code';

export interface LoginState {
  stage: LoginStage;
  message?: string;
  /** Keyed by field, for highlighting the offending input. */
  fieldErrors?: Record<string, string>;
  /** Carried forward so the code step knows which number it is confirming. */
  phone?: string;
  /** Where to land after signing in. Threaded through so it survives the two steps. */
  next?: string;
  /** Seconds until another code may be requested, for the resend countdown. */
  retryAfterSeconds?: number;
}

/**
 * Turns any thrown value into something renderable.
 *
 * Three outcomes matter to a person and are easy to collapse by accident: their input was
 * wrong, the service refused them, or the request never arrived. Only the first is worth
 * showing field-level detail for, and the third must not read as "wrong code" — that would
 * send an administrator hunting for an SMS that arrived perfectly.
 */
function toState(stage: LoginStage, error: unknown, carry: Partial<LoginState>): LoginState {
  if (error instanceof ForgeApiError) {
    return {
      stage,
      message: error.message,
      fieldErrors: error.fieldErrors(),
      ...carry,
    };
  }

  if (error instanceof ForgeNetworkError) {
    return {
      stage,
      message: 'Could not reach Forge. Check your connection and try again.',
      ...carry,
    };
  }

  // Never surface an unknown error's message: it can carry internals.
  return { stage, message: 'Something went wrong. Please try again.', ...carry };
}

/** Renders a zod issue as a field error on the code step. */
function invalidField(
  issue: { path: PropertyKey[]; message: string } | undefined,
  carry: Partial<LoginState>,
): LoginState {
  const field = String(issue?.path[0] ?? 'otp');
  return {
    stage: 'code',
    message: field === 'inviteToken' ? 'Check the invite code.' : 'Enter the 6-digit code.',
    fieldErrors: { [field]: issue?.message ?? 'Invalid' },
    ...carry,
  };
}

export async function requestCode(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const raw = String(formData.get('phone') ?? '').trim();
  const next = safeDestination(String(formData.get('next') ?? '') || null);

  /**
   * Validated with the SAME schema the API uses, so the two cannot disagree. A separate
   * client-side rule would drift and start rejecting numbers the API accepts (or worse, the
   * reverse), and this screen is the only place that would show it.
   */
  const parsed = v1.adminRequestOtpBody.safeParse({ phone: raw });

  if (!parsed.success) {
    return {
      stage: 'phone',
      message: 'Enter a valid Indian mobile number.',
      fieldErrors: { phone: parsed.error.issues[0]?.message ?? 'Invalid number' },
      phone: raw,
      next,
    };
  }

  try {
    const result = await anonymousConsoleApi().requestOtp(parsed.data);

    /**
     * Advancing to the code step regardless of whether the number is an administrator is
     * the whole point: the API answers identically either way, and a UI that skipped ahead
     * only for real administrators would reintroduce the enumeration oracle the API is
     * careful to avoid. Someone entering a number that is not an administrator sees a code
     * screen, waits, and eventually gets "that code is not valid".
     */
    return {
      stage: 'code',
      phone: parsed.data.phone,
      next,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  } catch (error) {
    return toState('phone', error, { phone: parsed.data.phone, next });
  }
}

export async function verifyCode(previous: LoginState, formData: FormData): Promise<LoginState> {
  const phone = String(formData.get('phone') ?? '');
  const otp = String(formData.get('otp') ?? '').trim();
  const next = safeDestination(String(formData.get('next') ?? '') || null);
  const inviteToken = String(formData.get('inviteToken') ?? '').trim();

  const carry: Partial<LoginState> = {
    phone,
    next,
    ...(previous.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: previous.retryAfterSeconds }),
  };

  /**
   * An invite token present means this is an activation, which the API takes as a single
   * request carrying BOTH factors. Validated with whichever schema matches, so a malformed
   * token is caught here rather than after an SMS has already been spent.
   *
   * The two branches are kept whole rather than merged behind one `parsed` variable: zod's
   * two output types differ, and narrowing a union of them with an `in` check gives up the
   * field types — which is how `inviteToken` ends up typed `unknown` at the call it is
   * required for.
   */
  try {
    const api = anonymousConsoleApi();

    if (inviteToken) {
      const parsed = v1.adminAcceptInviteBody.safeParse({ phone, otp, inviteToken });
      if (!parsed.success) return invalidField(parsed.error.issues[0], carry);

      const result = await api.acceptInvite(parsed.data);
      await writeSession(result.tokens);
    } else {
      const parsed = v1.adminVerifyOtpBody.safeParse({ phone, otp });
      if (!parsed.success) return invalidField(parsed.error.issues[0], carry);

      const result = await api.verifyOtp(parsed.data);
      await writeSession(result.tokens);
    }
  } catch (error) {
    return toState('code', error, carry);
  }

  // redirect() throws internally, so it must sit OUTSIDE the try/catch — otherwise the
  // control-flow exception is caught and reported to the administrator as a failure.
  redirect(next);
}

/**
 * Sign-out, as a server action.
 *
 * Tells the API first so the access token is revoked and the refresh family dies — clearing
 * only the cookie would leave a live session that anyone holding a copy of the token could
 * keep using for its full lifetime. The cookie is cleared either way: pressing sign out on a
 * shared machine must end the local session even if the API is unreachable.
 */
export async function signOut(): Promise<void> {
  try {
    await consoleApi().logout();
  } catch {
    // Deliberately swallowed. The local session is ending regardless, and there is no
    // screen left to show an error on.
  }

  await clearSession();
  redirect('/login');
}
