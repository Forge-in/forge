'use client';

import { useActionState } from 'react';

import { requestOtp, verifyOtp, type FormState } from './actions';

const initial: FormState = { status: 'idle' };

/**
 * Phone-OTP sign-in.
 *
 * Two steps in one component, driven by the action's returned state rather than by local
 * state: the server decides whether a code was sent, so a refresh or a replayed action can
 * never leave the UI claiming a code exists when it does not.
 */
export default function LoginPage() {
  const [requestState, submitPhone, requestPending] = useActionState(requestOtp, initial);
  const [verifyState, submitOtp, verifyPending] = useActionState(verifyOtp, initial);

  const codeSent = requestState.status === 'codeSent';
  // The verify step reports its own errors; before that, show the request step's.
  const active = codeSent ? verifyState : requestState;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Forge for Gym Owners</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {codeSent
              ? `Enter the code sent to ${requestState.phone}`
              : 'Sign in with your mobile number'}
          </p>
        </div>

        {!codeSent ? (
          <form action={submitPhone} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Mobile number
              </span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                defaultValue={requestState.phone ?? '+91'}
                placeholder="+919876543210"
                className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
              />
            </label>

            {active.fieldErrors?.phone ? (
              <p className="text-sm text-red-600">{active.fieldErrors.phone}</p>
            ) : null}

            <button
              type="submit"
              disabled={requestPending}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {requestPending ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form action={submitOtp} className="space-y-3">
            {/* Carried forward so the verify action does not have to trust a second entry. */}
            <input type="hidden" name="phone" value={requestState.phone ?? ''} />

            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                6-digit code
              </span>
              <input
                name="otp"
                type="text"
                inputMode="numeric"
                // Lets iOS and Android fill the code straight from the SMS.
                autoComplete="one-time-code"
                maxLength={6}
                required
                placeholder="000000"
                className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-center text-lg tracking-[0.4em] dark:border-zinc-700"
              />
            </label>

            {active.fieldErrors?.otp ? (
              <p className="text-sm text-red-600">{active.fieldErrors.otp}</p>
            ) : null}

            <button
              type="submit"
              disabled={verifyPending}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {verifyPending ? 'Verifying…' : 'Sign in'}
            </button>
          </form>
        )}

        {active.status === 'error' && active.message ? (
          <p role="alert" className="text-center text-sm text-red-600">
            {active.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
