'use client';

import { useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import { useAuth } from '@/components/auth/use-auth';
import { useTheme } from '@/components/theme/theme-provider';
import { Action } from '@/components/ui/controls';
import { WrathMark } from '@/components/ui/wrath-mark';
import { formatCount } from '@/lib/format';
import { platformMetrics } from '@/lib/metrics';
import { safeDestination } from '@/lib/redirect';

export function LoginScreen() {
  const { theme, toggleTheme } = useTheme();
  const { signIn } = useAuth();
  const searchParams = useSearchParams();

  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState('sameer@wrathfitness.com');
  const [password, setPassword] = useState('demo-access');
  const [submitting, setSubmitting] = useState(false);

  const { gymCount, memberCount } = platformMetrics();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    signIn(safeDestination(searchParams.get('next')));
  }

  return (
    <div className="text-ink flex min-h-dvh flex-col lg:flex-row">
      {/* Brand panel */}
      {/* The rule between the panels follows the axis the layout is stacked on. */}
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
          <p className="t-md text-sub">Superadmin access. All actions are logged.</p>
        </div>

        <form className="flex flex-col gap-[18px]" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-[9px]">
            <label htmlFor={emailId} className="t-eyebrow">
              Work email
            </label>
            <input
              id={emailId}
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@wrathfitness.com"
              className="wc-field px-[15px] py-[13px] text-[14px]"
            />
          </div>

          <div className="flex flex-col gap-[9px]">
            <div className="flex items-center justify-between">
              <label htmlFor={passwordId} className="t-eyebrow">
                Password
              </label>
              <span className="t-xs text-muted">Forgot?</span>
            </div>
            <input
              id={passwordId}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••"
              className="wc-field px-[15px] py-[13px] text-[14px]"
            />
          </div>

          <Action
            type="submit"
            variant="solid"
            disabled={submitting}
            className="t-cta w-full justify-center py-[14px]"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </Action>

          <div className="flex items-center gap-3 pt-[6px]">
            <span aria-hidden="true" className="bg-line h-[0.5px] flex-1" />
            <span className="t-rule">or</span>
            <span aria-hidden="true" className="bg-line h-[0.5px] flex-1" />
          </div>

          <Action
            variant="outline"
            disabled={submitting}
            onClick={() => {
              setSubmitting(true);
              signIn(safeDestination(searchParams.get('next')));
            }}
            className="t-cta w-full justify-center py-[13px]"
          >
            Continue with SSO
          </Action>
        </form>

        <p className="t-sm leading-prose text-muted text-pretty">
          Gym owners sign in at their own subdomain. Invite them from Gyms → Invite gym owner.
        </p>
      </div>
    </div>
  );
}
