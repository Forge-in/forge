'use client';

import { useSearchParams } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useTheme } from '@/components/theme/theme-provider';
import { Action } from '@/components/ui/controls';
import { WrathMark } from '@/components/ui/wrath-mark';
import { formatCount } from '@/lib/format';
import { platformMetrics } from '@/lib/metrics';
import { safeDestination } from '@/lib/redirect';
import { requestCode, verifyCode, type LoginState } from '@/app/login/actions';

/**
 * Console sign-in: phone number, then a one-time code.
 *
 * The design showed a work-email-and-password form with an SSO button. Neither exists: the
 * platform has no password store and no identity provider, and both controls signed the
 * visitor in by flipping a client-side flag. What is here instead is the flow the API
 * actually implements.
 *
 * WHAT THIS COMPONENT DELIBERATELY DOES NOT DO. It never sees a token. Both steps are server
 * actions that write the session into an httpOnly cookie server-side, so there is no moment
 * at which a credential reaching every tenant is readable from JavaScript.
 *
 * It also does not know whether the number belongs to an administrator, and must not appear
 * to. The API answers identically either way; a screen that only advanced for real
 * administrators would hand back the enumeration oracle the API is careful to withhold. So
 * every valid number advances to the code step, and a stranger's simply never receives one.
 */
export function LoginScreen() {
  const { theme, toggleTheme } = useTheme();
  const searchParams = useSearchParams();
  const next = safeDestination(searchParams.get('next'));

  const phoneId = useId();
  const otpId = useId();
  const inviteId = useId();

  const [state, submit, pending] = useActionState<LoginState, FormData>(
    /**
     * Which action runs is decided by WHAT WAS SUBMITTED, not by the stage the component
     * thinks it is on. The code step is the only one carrying an `otp` field, so the form
     * itself is the source of truth — and the two can never disagree, which they can when
     * the decision is read from a piece of state a "change number" button also mutates.
     */
    async (previous, formData) =>
      formData.has('otp') ? verifyCode(previous, formData) : requestCode(previous, formData),
    { stage: 'phone' },
  );

  /**
   * "Change number" sends the form back to the phone step.
   *
   * A local override rather than a navigation: `useActionState` has no reset, and reloading
   * the page to clear it would throw away the typed number and the error being shown. It is
   * cleared on every submit, so the server's answer always wins from that point on.
   */
  const [backToPhone, setBackToPhone] = useState(false);
  const stage = backToPhone ? 'phone' : state.stage;

  const { gymCount, memberCount } = platformMetrics();

  return (
    <div className="text-ink flex min-h-dvh flex-col lg:flex-row">
      {/* Brand panel. The rule between panels follows the axis the layout stacks on. */}
      <div className="border-line flex flex-1 flex-col justify-between gap-14 border-b-[0.5px] px-8 py-14 lg:border-r-[0.5px] lg:border-b-0 lg:px-16">
        <div className="flex items-center gap-[14px]">
          <WrathMark size={30} strokeWidth={7} />
          <span className="t-brand">WRATH CORE</span>
          <button
            type="button"
            onClick={toggleTheme}
            className="t-toggle text-muted hairline wc-hoverable ml-[10px] cursor-pointer px-[10px] py-[6px]"
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
        </div>

        <div className="flex max-w-[460px] flex-col gap-[22px]">
          <h1 className="t-hero text-pretty">The console behind every Wrath gym.</h1>
          <p className="t-lede text-sub text-pretty">
            Register operators, watch subscription revenue, and keep every site accountable from one
            place.
          </p>
        </div>

        <dl className="flex flex-wrap gap-10">
          <div className="flex flex-col gap-[6px]">
            <dt className="t-eyebrow">Gyms</dt>
            <dd className="t-num-xs">{gymCount}</dd>
          </div>
          <div className="flex flex-col gap-[6px]">
            <dt className="t-eyebrow">Members</dt>
            <dd className="t-num-xs">{formatCount(memberCount)}</dd>
          </div>
          <div className="flex flex-col gap-[6px]">
            <dt className="t-eyebrow">Uptime</dt>
            <dd className="t-num-xs">99.98%</dd>
          </div>
        </dl>
      </div>

      {/* Sign-in panel */}
      <div className="lg:w-panel flex w-full flex-col justify-center gap-[30px] px-8 py-14 lg:shrink-0 lg:px-[72px]">
        <div className="flex flex-col gap-2">
          <h2 className="t-signin-title">Sign in</h2>
          <p className="t-md text-sub">
            {stage === 'phone'
              ? 'Platform admin access. All actions are logged.'
              : `Enter the code sent to ${state.phone}.`}
          </p>
        </div>

        <form
          className="flex flex-col gap-[18px]"
          action={submit}
          onSubmit={() => setBackToPhone(false)}
          noValidate
        >
          {/* Threaded through the form rather than held in component state: a server action
              receives FormData, and the destination has to survive both steps. */}
          <input type="hidden" name="next" value={next} />

          {stage === 'phone' ? (
            <PhoneStep id={phoneId} state={state} pending={pending} />
          ) : (
            <CodeStep
              otpId={otpId}
              inviteId={inviteId}
              state={state}
              pending={pending}
              onChangeNumber={() => setBackToPhone(true)}
            />
          )}

          {/* aria-live so a screen reader announces a rejected code without a focus change. */}
          {state.message ? (
            <p className="t-sm text-pretty" role="alert" aria-live="polite">
              {state.message}
            </p>
          ) : null}
        </form>

        <p className="t-sm leading-prose text-muted text-pretty">
          Gym owners sign in at their own dashboard. Platform admin access is granted by invite only
          — ask an existing admin.
        </p>
      </div>
    </div>
  );
}

function PhoneStep({ id, state, pending }: { id: string; state: LoginState; pending: boolean }) {
  return (
    <>
      <div className="flex flex-col gap-[9px]">
        <label htmlFor={id} className="t-eyebrow">
          Mobile number
        </label>
        <input
          id={id}
          type="tel"
          name="phone"
          /**
           * `tel` and this autocomplete token are what let a browser and a password manager
           * offer the right value. `inputMode` keeps a phone keypad up on mobile, which is
           * where an administrator being paged at 3am is most likely to be.
           */
          autoComplete="tel"
          inputMode="tel"
          required
          defaultValue={state.phone ?? '+91'}
          placeholder="+919876543210"
          aria-invalid={state.fieldErrors?.phone ? true : undefined}
          className="wc-field px-[15px] py-[13px] text-[14px]"
        />
        {state.fieldErrors?.phone ? (
          <span className="t-xs text-muted">{state.fieldErrors.phone}</span>
        ) : null}
      </div>

      <Action
        type="submit"
        variant="solid"
        disabled={pending}
        className="t-cta w-full justify-center py-[14px]"
      >
        {pending ? 'Sending…' : 'Send code'}
      </Action>
    </>
  );
}

function CodeStep({
  otpId,
  inviteId,
  state,
  pending,
  onChangeNumber,
}: {
  otpId: string;
  inviteId: string;
  state: LoginState;
  pending: boolean;
  onChangeNumber: () => void;
}) {
  const [hasInvite, setHasInvite] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);

  // Focus the code field on arrival so the administrator can type straight from the SMS
  // without reaching for the mouse.
  useEffect(() => {
    otpRef.current?.focus();
  }, []);

  return (
    <>
      {/* Carried forward so the server action knows which number it is confirming. The
          value is re-validated server-side; this input is a convenience, not a trust
          boundary. */}
      <input type="hidden" name="phone" value={state.phone ?? ''} />

      <div className="flex flex-col gap-[9px]">
        <div className="flex items-center justify-between">
          <label htmlFor={otpId} className="t-eyebrow">
            Verification code
          </label>
          <button
            type="button"
            onClick={onChangeNumber}
            className="t-xs text-muted cursor-pointer underline-offset-2 hover:underline"
          >
            Change number
          </button>
        </div>
        <input
          ref={otpRef}
          id={otpId}
          type="text"
          name="otp"
          /**
           * `one-time-code` is what lets iOS and Android offer the code straight from the
           * SMS notification. `inputMode="numeric"` plus the pattern keeps a numeric keypad
           * up without rejecting a leading zero the way type="number" would.
           */
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          placeholder="000000"
          aria-invalid={state.fieldErrors?.otp ? true : undefined}
          className="wc-field px-[15px] py-[13px] text-[14px] tracking-[0.4em]"
        />
        {state.fieldErrors?.otp ? (
          <span className="t-xs text-muted">{state.fieldErrors.otp}</span>
        ) : null}
      </div>

      {/**
       * The invite token, revealed on request rather than shown by default.
       *
       * Only a first-time administrator has one, and every subsequent sign-in does not — a
       * permanently visible field would read as required and invite people to paste a spent
       * token into it. It is an optional field on this step rather than a separate flow
       * because the API takes both factors in one request.
       */}
      {hasInvite ? (
        <div className="flex flex-col gap-[9px]">
          <label htmlFor={inviteId} className="t-eyebrow">
            Invite code
          </label>
          <input
            id={inviteId}
            type="text"
            name="inviteToken"
            autoComplete="off"
            required
            placeholder="Paste the code an admin gave you"
            aria-invalid={state.fieldErrors?.inviteToken ? true : undefined}
            className="wc-field px-[15px] py-[13px] font-mono text-[13px]"
          />
          <span className="t-xs text-muted">
            Sent to you directly by an existing admin — never by SMS.
          </span>
        </div>
      ) : null}

      <Action
        type="submit"
        variant="solid"
        disabled={pending}
        className="t-cta w-full justify-center py-[14px]"
      >
        {pending ? 'Verifying…' : 'Verify and sign in'}
      </Action>

      {!hasInvite ? (
        <button
          type="button"
          onClick={() => setHasInvite(true)}
          className="t-xs text-muted cursor-pointer self-center underline-offset-2 hover:underline"
        >
          I have an invite code
        </button>
      ) : null}
    </>
  );
}
