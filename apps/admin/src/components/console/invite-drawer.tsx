'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { Action } from '@/components/ui/controls';
import { SideDrawer } from '@/components/ui/side-drawer';
import { WrathMark } from '@/components/ui/wrath-mark';
import { cn } from '@/lib/cn';
import { copyToClipboard } from '@/lib/clipboard';
import { PLAN_PRICE_LABEL, PLAN_TIERS } from '@/lib/data';
import { useConsole, type InviteStep } from './console-provider';
import { useToast } from './toast-provider';

const STEP_NAMES = ['Organisation', 'Owner', 'Review'] as const;

const NEXT_LABEL: Readonly<Record<InviteStep, string>> = {
  1: 'Continue',
  2: 'Review',
  3: 'Send invite',
  4: 'Done',
};

function stepLabel(step: InviteStep): string {
  if (step === 4) return 'Done';
  return `Step ${step} of 3 · ${STEP_NAMES[step - 1]}`;
}

/** Progress ticks: filled behind you, live on the current step, empty ahead. */
function tickClass(tick: number, step: InviteStep): string {
  if (step > tick || step === 4) return 'bg-accent';
  if (step === tick) return 'bg-sub';
  return 'bg-line';
}

const FIELD_CLASS = 'wc-field px-[14px] py-3 text-[14px]';

export function InviteDrawer() {
  const router = useRouter();
  const { notify } = useToast();
  const {
    inviteOpen,
    inviteStep,
    form,
    sentLink,
    sentTo,
    settings,
    closeInvite,
    setFormField,
    goBack,
    goNext,
    startAnother,
  } = useConsole();

  const ids = {
    org: useId(),
    city: useId(),
    sites: useId(),
    owner: useId(),
    email: useId(),
    note: useId(),
  };

  function onNext() {
    if (goNext()) router.push('/gyms');
  }

  async function onCopy() {
    const copied = await copyToClipboard(sentLink);
    notify(copied ? 'Signup link copied' : 'Could not copy — select the link and copy it');
  }

  const reviewRows: { label: string; value: string }[] = [
    { label: 'Organisation', value: form.org.trim() || '—' },
    { label: 'City', value: form.city.trim() || '—' },
    { label: 'Sites', value: String(form.sites || 1) },
    { label: 'Plan', value: form.plan },
    { label: 'Owner', value: form.owner.trim() || '—' },
    { label: 'Email', value: form.email.trim() || '—' },
    { label: 'Trial', value: `${settings.trialDays} days` },
  ];

  const firstName = form.owner.trim().split(/\s+/)[0];
  const emailPreview = `${firstName || 'They'} gets a link to set a password and finish setting up ${
    form.org.trim() || 'the gym'
  }. ${form.note.trim() || 'No personal note added.'}`;

  return (
    <SideDrawer
      open={inviteOpen}
      onClose={closeInvite}
      title="Invite a gym owner"
      subtitle={stepLabel(inviteStep)}
      contentKey={inviteStep}
      banner={
        <div className="flex gap-[6px] px-8 pt-4">
          {[1, 2, 3].map((tick) => (
            <span
              key={tick}
              aria-hidden="true"
              className={cn('h-[3px] flex-1', tickClass(tick, inviteStep))}
            />
          ))}
        </div>
      }
      footer={
        <div className="hairline-t flex items-center justify-between gap-4 px-8 py-5">
          {inviteStep === 4 ? (
            <span />
          ) : (
            <Action variant="plain" onClick={goBack} className="t-pill text-muted">
              {inviteStep === 1 ? 'Cancel' : 'Back'}
            </Action>
          )}

          <div className="flex gap-[10px]">
            {inviteStep === 4 ? (
              <Action variant="outline" onClick={startAnother} className="t-pill px-4 py-[11px]">
                Invite another
              </Action>
            ) : null}
            <Action variant="solid" onClick={onNext} className="t-pill px-5 py-[11px]">
              {NEXT_LABEL[inviteStep]}
            </Action>
          </div>
        </div>
      }
    >
      {inviteStep === 1 ? (
        <div className="flex flex-col gap-5">
          <p className="t-body leading-prose text-sub text-pretty">
            We create the organisation shell now. The owner sets their own password, uploads their
            logo, and adds staff when they accept.
          </p>

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.org} className="t-eyebrow">
              Organisation name
            </label>
            <input
              id={ids.org}
              type="text"
              value={form.org}
              onChange={(event) => setFormField('org', event.target.value)}
              placeholder="Ironworks Strength Co."
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex gap-[14px]">
            <div className="flex flex-[1.4] flex-col gap-2">
              <label htmlFor={ids.city} className="t-eyebrow">
                City
              </label>
              <input
                id={ids.city}
                type="text"
                value={form.city}
                onChange={(event) => setFormField('city', event.target.value)}
                placeholder="Mumbai"
                className={FIELD_CLASS}
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <label htmlFor={ids.sites} className="t-eyebrow">
                Sites
              </label>
              <input
                id={ids.sites}
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                /* 0 renders as an empty box so the field can be cleared and
                   retyped; step 1's validation rejects it before going on. */
                value={form.sites === 0 ? '' : form.sites}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  setFormField('sites', Number.isNaN(parsed) ? 0 : parsed);
                }}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <fieldset className="flex flex-col gap-[10px]">
            <legend className="t-eyebrow">Starting plan</legend>
            <div className="flex gap-2">
              {PLAN_TIERS.map((tier) => {
                const selected = form.plan === tier.id;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFormField('plan', tier.id)}
                    className={cn(
                      'hairline wc-hoverable flex flex-1 cursor-pointer flex-col gap-[5px] p-[14px] text-left',
                      selected ? 'border-accent' : 'border-line',
                    )}
                  >
                    <span className={cn('text-[13.5px]', selected ? 'text-ink' : 'text-sub')}>
                      {tier.id}
                    </span>
                    <span className="t-mono-xs text-muted">{PLAN_PRICE_LABEL[tier.id]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <p className="t-sm leading-prose text-muted text-pretty">
            They get a {settings.trialDays}-day trial. Nothing is charged until it ends.
          </p>
        </div>
      ) : null}

      {inviteStep === 2 ? (
        <div className="flex flex-col gap-5">
          <p className="t-body leading-prose text-sub text-pretty">
            The link goes to this address and expires in 14 days. Only this person can use it.
          </p>

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.owner} className="t-eyebrow">
              Owner name
            </label>
            <input
              id={ids.owner}
              type="text"
              autoComplete="name"
              value={form.owner}
              onChange={(event) => setFormField('owner', event.target.value)}
              placeholder="Sameer Rathore"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.email} className="t-eyebrow">
              Email
            </label>
            <input
              id={ids.email}
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setFormField('email', event.target.value)}
              placeholder="owner@gym.com"
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={ids.note} className="t-eyebrow">
              Personal note
            </label>
            <textarea
              id={ids.note}
              rows={4}
              value={form.note}
              onChange={(event) => setFormField('note', event.target.value)}
              placeholder="Added to the top of the invite email."
              className={cn(FIELD_CLASS, 'resize-none leading-[1.5]')}
            />
          </div>
        </div>
      ) : null}

      {inviteStep === 3 ? (
        <div className="flex flex-col gap-[22px]">
          <p className="t-body leading-prose text-sub text-pretty">
            Check it once. Sending creates the organisation in a pending state and emails the owner.
          </p>

          <dl className="flex flex-col">
            {reviewRows.map((row) => (
              <div
                key={row.label}
                className="hairline-t t-body flex justify-between gap-5 py-[13px]"
              >
                <dt className="text-sub">{row.label}</dt>
                <dd className="text-right">{row.value}</dd>
              </div>
            ))}
          </dl>

          <div className="hairline flex flex-col gap-[10px] p-[18px]">
            <p className="t-eyebrow">They will receive</p>
            <p className="t-body leading-prose text-pretty">{emailPreview}</p>
          </div>
        </div>
      ) : null}

      {inviteStep === 4 ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <WrathMark size={40} strokeWidth={6} />
            <h3 className="t-page-title">Invite sent</h3>
            <p className="t-body leading-prose text-sub text-pretty">
              We emailed {sentTo}. The link expires in 14 days.
            </p>
          </div>

          <div className="flex flex-col gap-[10px]">
            <p className="t-eyebrow">Signup link</p>
            <div className="wc-card flex items-center gap-3 px-[15px] py-[13px]">
              <span className="t-mono-md text-sub flex-1 truncate">{sentLink}</span>
              <Action variant="solid" onClick={onCopy} className="t-action px-[11px] py-[6px]">
                Copy
              </Action>
            </div>
          </div>

          <p className="t-sm leading-prose text-muted text-pretty">
            It shows in Gyms as a pending invite until they finish. You can resend or revoke it
            there.
          </p>
        </div>
      ) : null}
    </SideDrawer>
  );
}
