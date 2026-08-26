'use client';

import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Action, Field, TextInput } from '@/components/ui/controls';
import { Eyebrow } from '@/components/ui/primitives';
import { safeDestination } from '@/lib/redirect';
import { requestOtp, verifyOtp, type FormState } from './actions';

const initial: FormState = { status: 'idle' };

/**
 * Phone-OTP sign-in.
 *
 * Two steps in one component, driven by the ACTION'S RETURNED STATE rather than
 * by local state: the server decides whether a code was sent, so a refresh or a
 * replayed action can never leave the UI claiming a code exists when it does
 * not.
 */
export default function LoginPage() {
  return (
    // `useSearchParams` opts the route into client rendering unless it sits
    // inside a boundary; the fallback is the same form minus the redirect
    // target, which only matters once the code is verified.
    <Suspense fallback={<SignInForm next="/overview" />}>
      <SignInWithDestination />
    </Suspense>
  );
}

function SignInWithDestination() {
  const searchParams = useSearchParams();
  return <SignInForm next={safeDestination(searchParams.get('next'))} />;
}

function SignInForm({ next }: { next: string }) {
  const [requestState, submitPhone, requestPending] = useActionState(requestOtp, initial);
  const [verifyState, submitOtp, verifyPending] = useActionState(verifyOtp, initial);

  const codeSent = requestState.status === 'codeSent';
  // The verify step reports its own errors; before that, show the request step's.
  const active = codeSent ? verifyState : requestState;

  return (
    <main className="bg-bg text-ink relative flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 overflow-hidden p-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[200px] left-1/2 h-[560px] w-[720px] -translate-x-1/2 rounded-full"
        style={{ background: 'radial-gradient(ellipse, var(--ow-glow) 0%, rgb(0 0 0 / 0) 68%)' }}
      />

      <div className="relative z-1 flex w-full max-w-[380px] flex-col gap-7">
        <div className="flex flex-col items-center gap-4 text-center">
          <span aria-hidden="true" className="ow-ring flex size-12 rounded-full p-[1.5px]">
            <span className="bg-surface text-gold flex size-full items-center justify-center rounded-full font-serif text-[23px]">
              W
            </span>
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="t-title text-[26px]">Wrath Owner Console</h1>
            <p className="t-mono-sm text-muted">
              {codeSent
                ? `Enter the code sent to ${requestState.phone}`
                : 'Sign in with your mobile number'}
            </p>
          </div>
        </div>

        {!codeSent ? (
          <form action={submitPhone} className="flex flex-col gap-4">
            <Field
              label="Mobile number"
              hint={active.fieldErrors?.phone}
              invalid={Boolean(active.fieldErrors?.phone)}
            >
              {(props) => (
                <TextInput
                  {...props}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  defaultValue={requestState.phone ?? '+91'}
                  placeholder="+919876543210"
                />
              )}
            </Field>

            <Action
              type="submit"
              variant="gold"
              disabled={requestPending}
              className="t-base h-11 w-full rounded-[22px]"
            >
              {requestPending ? 'Sending…' : 'Send code'}
            </Action>
          </form>
        ) : (
          <form action={submitOtp} className="flex flex-col gap-4">
            {/* Carried forward so the verify action does not have to trust a
                second entry, and so the destination survives the two-step flow. */}
            <input type="hidden" name="phone" value={requestState.phone ?? ''} />
            <input type="hidden" name="next" value={next} />

            <Field
              label="6-digit code"
              hint={active.fieldErrors?.otp}
              invalid={Boolean(active.fieldErrors?.otp)}
            >
              {(props) => (
                <TextInput
                  {...props}
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  // Lets iOS and Android fill the code straight from the SMS.
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.4em]"
                />
              )}
            </Field>

            <Action
              type="submit"
              variant="gold"
              disabled={verifyPending}
              className="t-base h-11 w-full rounded-[22px]"
            >
              {verifyPending ? 'Verifying…' : 'Sign in'}
            </Action>
          </form>
        )}

        {active.status === 'error' && active.message ? (
          <p role="alert" className="t-mono-sm text-warn text-center leading-[1.6]">
            {active.message}
          </p>
        ) : null}

        <Eyebrow className="text-center">Ironhold · Wrath for gym owners</Eyebrow>
      </div>
    </main>
  );
}
