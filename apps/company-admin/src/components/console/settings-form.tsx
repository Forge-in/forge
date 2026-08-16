'use client';

import { useId } from 'react';
import { SwitchRow } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { TRIAL_OPTIONS, useConsole, type SettingsToggle } from './console-provider';
import { ToastAction } from './toast-action';

const TOGGLES: { key: SettingsToggle; label: string; help: string }[] = [
  {
    key: 'autoSuspend',
    label: 'Auto-suspend after 3 failed charges',
    help: 'The owner keeps read access; members stop checking in.',
  },
  {
    key: 'weeklyDigest',
    label: 'Weekly revenue digest',
    help: 'Monday 08:00 to every superadmin and finance seat.',
  },
  {
    key: 'ownerBilling',
    label: 'Let owners change their own plan',
    help: 'Off means plan changes come through your team.',
  },
];

/** A settings row: a description on the left, the controls on the right. */
function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-wrap gap-12', className)}>
      <div className="flex w-[220px] shrink-0 flex-col gap-[6px]">
        <h2 className="t-section">{title}</h2>
        <p className="t-sm leading-tight-prose text-muted">{description}</p>
      </div>
      <div className="flex min-w-[260px] flex-1 flex-col">{children}</div>
    </section>
  );
}

export function SettingsForm() {
  const { settings, updateSetting, flipToggle } = useConsole();
  const nameId = useId();
  const emailId = useId();

  return (
    <div className="flex max-w-[860px] flex-col px-8 pt-[26px] pb-12">
      <SettingsSection
        title="Organisation"
        description="Shown to gym owners in the console and on invoices."
        className="hairline-b pb-7"
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="t-eyebrow">
              Legal name
            </label>
            <input
              id={nameId}
              type="text"
              value={settings.legalName}
              onChange={(event) => updateSetting('legalName', event.target.value)}
              className="wc-field px-[14px] py-[11px] text-[14px]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={emailId} className="t-eyebrow">
              Support email
            </label>
            <input
              id={emailId}
              type="email"
              value={settings.supportEmail}
              onChange={(event) => updateSetting('supportEmail', event.target.value)}
              className="wc-field px-[14px] py-[11px] text-[14px]"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Trials & onboarding"
        description="Applies to every new gym you invite."
        className="hairline-b py-7"
      >
        <div className="flex flex-col gap-[18px]">
          <fieldset className="flex flex-col gap-[10px]">
            <legend className="t-eyebrow">Trial length</legend>
            <div className="flex flex-wrap gap-2">
              {TRIAL_OPTIONS.map((days) => {
                const selected = settings.trialDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => updateSetting('trialDays', days)}
                    className={cn(
                      't-trial hairline wc-hoverable cursor-pointer px-4 py-[9px]',
                      selected ? 'border-accent text-ink' : 'border-line text-sub',
                    )}
                  >
                    {days} days
                  </button>
                );
              })}
            </div>
          </fieldset>

          {TOGGLES.map((toggle) => (
            <SwitchRow
              key={toggle.key}
              label={toggle.label}
              help={toggle.help}
              checked={settings[toggle.key]}
              onToggle={() => flipToggle(toggle.key)}
            />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        description="Irreversible. Requires a second superadmin."
        className="pt-7"
      >
        <div className="flex flex-col gap-3">
          <ToastAction className="w-full justify-between px-[18px] py-4">
            <span className="text-[13.5px]">Rotate all API keys</span>
            <span className="t-pill text-sub">Rotate</span>
          </ToastAction>
          <ToastAction className="w-full justify-between px-[18px] py-4">
            <span className="text-[13.5px]">Export every organisation record</span>
            <span className="t-pill text-sub">Export</span>
          </ToastAction>
        </div>
      </SettingsSection>
    </div>
  );
}
