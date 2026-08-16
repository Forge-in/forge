'use client';

import { useId, useState, useTransition } from 'react';
import { Action } from '@/components/ui/controls';
import { SideDrawer } from '@/components/ui/side-drawer';
import { useToast } from '@/components/console/toast-provider';
import { cn } from '@/lib/cn';
import { copyToClipboard } from '@/lib/clipboard';
import { absoluteTime } from '@/lib/datetime';
import { formatPhone } from '@/lib/format';
import { createInvite, type CreatedInvite } from '@/app/(console)/team/actions';

const FIELD_CLASS = 'wc-field px-[14px] py-3 text-[14px]';

/** Offered validities. Bounded by the contract at 1..336 hours; these are the sane picks. */
const VALIDITY_OPTIONS: readonly { hours: number; label: string }[] = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
];

/**
 * Invite a platform admin.
 *
 * Two panels, and the second one is the whole reason this is a drawer rather than a prompt:
 * the invite token is returned exactly ONCE, and the operator has to be given a real chance
 * to copy it before it is gone forever.
 */
export function AdminInviteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notify } = useToast();
  const phoneId = useId();

  const [phone, setPhone] = useState('+91');
  const [hours, setHours] = useState(72);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Resets on close rather than on open.
   *
   * The token must not survive the drawer. Clearing on open would leave it sitting in React
   * state — and therefore in a memory snapshot and in React DevTools — for as long as the
   * page stays on screen after closing.
   */
  function handleClose() {
    setCreated(null);
    setError(null);
    setPhone('+91');
    setHours(72);
    onClose();
  }

  function submit() {
    setError(null);

    startTransition(async () => {
      const result = await createInvite(phone, hours);

      if (result.status === 'error') {
        setError(result.message);
        return;
      }

      setCreated(result.data);
    });
  }

  async function copyToken() {
    if (!created) return;
    const copied = await copyToClipboard(created.token);
    // Reports honestly rather than claiming success: on plain HTTP the clipboard API is
    // unavailable, and a false "Copied" here loses the one copy of the token.
    notify(copied ? 'Invite code copied' : 'Could not copy — select the code and copy it');
  }

  return (
    <SideDrawer
      open={open}
      onClose={handleClose}
      title="Invite a platform admin"
      subtitle={created ? 'Share the code' : 'They will have access to every gym'}
      contentKey={created ? 'created' : 'form'}
      footer={
        <div className="hairline-t flex items-center justify-between gap-4 px-8 py-5">
          {created ? (
            <>
              <span className="t-sm text-muted">Copy the code before closing.</span>
              <Action variant="solid" onClick={handleClose} className="t-pill px-5 py-[11px]">
                Done
              </Action>
            </>
          ) : (
            <>
              <Action variant="plain" onClick={handleClose} className="t-pill text-muted">
                Cancel
              </Action>
              <Action
                variant="solid"
                onClick={submit}
                disabled={pending}
                className="t-pill px-5 py-[11px]"
              >
                {pending ? 'Creating…' : 'Create invite'}
              </Action>
            </>
          )}
        </div>
      }
    >
      {created ? <CreatedPanel invite={created} onCopy={copyToken} /> : null}

      {!created ? (
        <div className="flex flex-col gap-5">
          <p className="t-body leading-prose text-sub text-pretty">
            A platform admin can see and act on every gym on Forge. There is no lesser role — invite
            deliberately.
          </p>

          <div className="flex flex-col gap-2">
            <label htmlFor={phoneId} className="t-eyebrow">
              Mobile number
            </label>
            <input
              id={phoneId}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+919876543210"
              aria-invalid={error ? true : undefined}
              className={FIELD_CLASS}
              // Enter submits, which is what anyone typing a single field expects.
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !pending) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <span className="t-xs text-muted">
              They sign in with a code sent to this number, so it must be one they hold.
            </span>
          </div>

          <fieldset className="flex flex-col gap-[10px]">
            <legend className="t-eyebrow">Code valid for</legend>
            <div className="flex gap-2">
              {VALIDITY_OPTIONS.map((option) => {
                const selected = hours === option.hours;
                return (
                  <button
                    key={option.hours}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setHours(option.hours)}
                    className={cn(
                      'hairline wc-hoverable flex-1 cursor-pointer px-3 py-[11px] text-[13.5px]',
                      selected ? 'border-accent text-ink' : 'border-line text-sub',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <span className="t-xs text-muted">
              Shorter is safer. An unused code stops working when it expires.
            </span>
          </fieldset>

          {error ? (
            <p className="t-sm text-pretty" role="alert" aria-live="polite">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </SideDrawer>
  );
}

/**
 * The one screen where the token exists.
 *
 * Written to be read under pressure: what this is, why it will not come back, and how it
 * must travel. The last part is the security property — an invite token sent over SMS to the
 * same number that receives the sign-in code collapses two factors into one, and undoes the
 * only defence against a SIM swap creating a platform admin.
 */
function CreatedPanel({ invite, onCopy }: { invite: CreatedInvite; onCopy: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="t-page-title">Invite created</h3>
        <p className="t-body leading-prose text-sub text-pretty">
          For {formatPhone(invite.phone)}. Valid until {absoluteTime(invite.expiresAt)}.
        </p>
      </div>

      <div className="flex flex-col gap-[10px]">
        <p className="t-eyebrow">Invite code — shown once</p>
        <div className="wc-card flex items-center gap-3 px-[15px] py-[13px]">
          {/* select-all so a failed clipboard still leaves a one-gesture manual copy. */}
          <code className="t-mono-md text-sub flex-1 break-all select-all">{invite.token}</code>
          <Action variant="solid" onClick={onCopy} className="t-action shrink-0 px-[11px] py-[6px]">
            Copy
          </Action>
        </div>
        <p className="t-xs text-muted leading-prose text-pretty">
          Forge does not store this code — only a hash of it. Closing this panel loses it, and the
          only fix is to revoke the invite and issue a new one.
        </p>
      </div>

      <div className="hairline flex flex-col gap-[10px] p-[18px]">
        <p className="t-eyebrow">Send it any way except SMS</p>
        <p className="t-body leading-prose text-pretty">
          Hand it over in person, or on a channel their phone number does not control. The code and
          the sign-in SMS are two separate factors — putting both on the same SIM means whoever
          takes over that number can make themselves an admin.
        </p>
      </div>
    </div>
  );
}
