import type { Metadata } from 'next';
import { DemoButton } from '@/components/console/demo-button';
import { PermissionList } from '@/components/screens/trainer-app/permission-list';
import { UpgradeButton } from '@/components/screens/trainer-app/upgrade-cta';
import {
  Avatar,
  Card,
  CardHeader,
  Dot,
  Eyebrow,
  Meter,
  PanelHeader,
  StatusPill,
} from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  ENTITLEMENTS,
  INVITE_NOTE,
  LOCKED_PERKS,
  PENDING_INVITES,
  PLAN_CARDS,
  SUBSCRIPTION,
  TRAINER_APP_STATS,
  TRAINER_DEVICES,
} from '@/lib/data';
import { firstName, rupees } from '@/lib/format';
import { DEVICE_STATE_TONE } from '@/lib/tone';

export const metadata: Metadata = { title: 'Trainer mobile' };

const GRID = 'grid grid-cols-[1.6fr_1.4fr_1.2fr_1fr_150px] gap-4 px-[26px]';

/**
 * Trainer mobile is a paid add-on, so this route has two entirely different
 * screens behind one entitlement. Both are real — the locked one is what most
 * gyms on Core see, and it is the console's only sales surface.
 */
export default function TrainerMobilePage() {
  return ENTITLEMENTS.trainerApp ? <TrainerAppEnabled /> : <TrainerAppLocked />;
}

/* -------------------------------------------------------------------------- */
/* Locked                                                                     */
/* -------------------------------------------------------------------------- */

function TrainerAppLocked() {
  const pro = PLAN_CARDS.find((plan) => plan.name === 'Wrath Pro');

  return (
    <div className="flex flex-col gap-[18px]">
      <Card
        tone="gold"
        className="flex-row items-center justify-between gap-10 rounded-[30px] px-10 py-[38px] shadow-[0_18px_50px_var(--ow-shadow-soft)]"
      >
        <div className="flex max-w-[520px] flex-col gap-4">
          {/*
            A <div>, not a <p>. `Eyebrow` renders a paragraph, and a <p> inside
            a <p> is invalid HTML: the browser silently auto-closes the outer
            one, so the parsed DOM differs from what React rendered and
            hydration fails for the whole tree.
          */}
          <div className="flex items-center gap-[10px]">
            <Dot tone="gold" size={6} />
            <Eyebrow className="text-gold">Add-on · not in your plan</Eyebrow>
          </div>
          <h2 className="t-display text-[38px] leading-[1.02]">
            Put Wrath Trainer in your trainers’ hands
          </h2>
          <p className="t-body text-sub leading-[1.7]">
            Trainer mobile is unlocked on Wrath Pro and above. Your trainers get their day, client
            history, plan builder, live session runner and attendance — all writing straight back
            into this dashboard.
          </p>
          <div className="flex items-center gap-3 pt-1.5">
            <UpgradeButton price={pro?.monthlyPrice ?? 7999} />
            <DemoButton
              toast="Walkthrough requested · our team replies within a day"
              variant="raised"
              className="t-base h-12 rounded-[24px] px-6 font-medium"
              label="Book a 15-min walkthrough"
            />
          </div>
        </div>

        <ul className="flex w-[230px] shrink-0 flex-col gap-[10px]">
          {LOCKED_PERKS.map((perk) => (
            <li
              key={perk}
              className="bg-raise border-line flex items-center gap-[11px] rounded-2xl border px-[15px] py-[13px]"
            >
              <span aria-hidden="true" className="t-mono text-gold">
                ✦
              </span>
              <span className="t-xs text-sub">{perk}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/*
        A preview of what unlocking gives you, dimmed. `aria-hidden` because it
        is a picture of an absent feature — a screen reader announcing four
        columns of nothing is worse than silence, and the paragraph above says
        the same thing in words.
      */}
      <Card className="gap-4 px-[26px] py-6 opacity-55 shadow-none">
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-section">Trainer seats · preview</h2>
          <span className="t-pill text-muted">Locked</span>
        </div>
        <p className="t-mono text-muted leading-[1.7]">
          Seats, device pairing, session sync and per-trainer permissions appear here once trainer
          mobile is on your plan. Nothing is charged until you confirm the upgrade.
        </p>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Enabled                                                                    */
/* -------------------------------------------------------------------------- */

function TrainerAppEnabled() {
  const seatsFree = SUBSCRIPTION.seatsTotal - SUBSCRIPTION.seatsUsed;

  return (
    <div className="flex flex-col gap-[18px]">
      <section aria-label="Trainer app health" className="grid grid-cols-3 gap-4">
        <Card tone="gold" className="gap-[14px] px-6 py-[22px]">
          <Eyebrow className="text-gold">Trainer seats</Eyebrow>
          <p className="flex items-end gap-[10px]">
            <span className="t-display text-[38px]">{SUBSCRIPTION.seatsUsed}</span>
            <span className="t-mono text-muted pb-1.5">
              of {SUBSCRIPTION.seatsTotal} on Wrath Pro
            </span>
          </p>
          <Meter value={SUBSCRIPTION.seatsUsed} total={SUBSCRIPTION.seatsTotal} height={6} />
          <p className="t-mono-xs text-sub">
            {seatsFree === 0
              ? `All seats in use · ${rupees(SUBSCRIPTION.extraSeatPrice)} per extra seat`
              : `${seatsFree} ${seatsFree === 1 ? 'seat' : 'seats'} free · ${rupees(SUBSCRIPTION.extraSeatPrice)} per extra seat beyond ${SUBSCRIPTION.seatsTotal}`}
          </p>
        </Card>

        <Card className="gap-[14px] px-6 py-[22px]">
          <Eyebrow>Sessions logged · 7d</Eyebrow>
          <p className="t-display text-[38px]">{TRAINER_APP_STATS.sessionsLogged}</p>
          <p className="t-mono-xs text-sub">{TRAINER_APP_STATS.sessionsNote}</p>
        </Card>

        <Card className="gap-[14px] px-6 py-[22px]">
          <Eyebrow>Sync health</Eyebrow>
          <p
            className={cn(
              't-display text-[38px]',
              TRAINER_APP_STATS.staleDevices > 0 ? 'text-warn' : 'text-ok',
            )}
          >
            {TRAINER_APP_STATS.staleDevices > 0
              ? `${TRAINER_APP_STATS.staleDevices} stale`
              : 'All synced'}
          </p>
          <p className="t-mono-xs text-sub">{TRAINER_APP_STATS.staleNote}</p>
        </Card>
      </section>

      {/* --- Connected devices ------------------------------------------ */}

      <Card className="overflow-hidden">
        <PanelHeader
          title="Connected trainers"
          action={
            <DemoButton
              toast="Invite link sent · trainer signs in with their phone number"
              variant="gold"
              className="t-pill h-9 rounded-[18px] px-[18px]"
              label="Invite trainer"
            />
          }
        />

        <ul>
          {TRAINER_DEVICES.map((device) => {
            const paired = device.state !== 'Invited';

            return (
              <li key={device.id} className={cn(GRID, 'ow-divide-b items-center py-4')}>
                <span className="flex min-w-0 items-center gap-[13px]">
                  <Avatar name={device.name} size={36} ring={paired} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="t-base font-medium">{device.name}</span>
                    <span className="t-mono-xs text-muted">{device.role}</span>
                  </span>
                </span>

                <span className="flex flex-col gap-1">
                  <span className="t-xs text-sub">{device.device}</span>
                  <span className="t-mono-xs text-muted">{device.version}</span>
                </span>

                <span
                  className={cn(
                    't-mono',
                    device.state === 'Stale'
                      ? 'text-warn'
                      : device.state === 'Active'
                        ? 'text-ok'
                        : 'text-muted',
                  )}
                >
                  {device.lastSync}
                </span>

                <StatusPill tone={DEVICE_STATE_TONE[device.state]} className="justify-self-start">
                  {device.state}
                </StatusPill>

                <span className="flex items-center justify-end gap-2">
                  <DemoButton
                    toast={primaryToast(device.state, device.name)}
                    label={device.action}
                    variant="raised"
                    srSuffix={device.name}
                    className="t-pill h-8 rounded-2xl px-[14px]"
                  />
                  <DemoButton
                    toast={revokeToast(device.state, device.name)}
                    label={device.state === 'Invited' ? 'Cancel' : 'Revoke'}
                    variant="danger"
                    srSuffix={device.name}
                    className="t-pill h-8 rounded-2xl px-[14px]"
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* --- Permissions and invites ------------------------------------ */}

      <div className="grid grid-cols-2 gap-4">
        <Card className="px-6 py-[22px]">
          <h2 className="t-section-sm pb-2">What trainers can see</h2>
          <PermissionList />
        </Card>

        <Card className="gap-[14px] px-6 py-[22px]">
          <CardHeader title="Pending invites" />
          <ul className="flex flex-col gap-3">
            {PENDING_INVITES.map((invite) => (
              <li
                key={invite.id}
                className="ow-inset flex items-center justify-between gap-3 px-[17px] py-[15px]"
              >
                <span className="flex min-w-0 flex-col gap-[5px]">
                  <span className="t-sm font-medium">{invite.name}</span>
                  <span className={cn('t-mono-xs', invite.expired ? 'text-warn' : 'text-muted')}>
                    {invite.meta}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <DemoButton
                    toast={
                      invite.expired
                        ? `Fresh invite sent to ${firstName(invite.name)}`
                        : `Invite resent to ${firstName(invite.name)}`
                    }
                    variant="raised"
                    srSuffix={invite.name}
                    className="t-pill-sm bg-surface h-[30px] rounded-[15px] px-[13px]"
                    label="Resend"
                  />
                  <DemoButton
                    toast={
                      invite.expired ? 'Expired invite removed' : 'Invite cancelled · seat released'
                    }
                    variant="ghost"
                    srSuffix={invite.name}
                    className="t-pill-sm h-[30px] rounded-[15px] px-[13px]"
                    label="Cancel"
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="t-mono-xs text-muted leading-[1.7]">{INVITE_NOTE}</p>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * What the primary action does depends on why the device is not healthy, and
 * the message has to say so — "Sessions" on a trainer who is on leave means
 * something different from "Force sync" on one with six unsent workouts.
 */
function primaryToast(state: string, name: string): string {
  switch (state) {
    case 'Stale':
      return 'Sync requested · 6 offline sessions will upload';
    case 'On leave':
      return `${firstName(name)}’s sessions are paused while they are on leave`;
    case 'Invited':
      return `Invite reminder sent to ${firstName(name)}`;
    default:
      return `${TRAINER_APP_STATS.sessionsLogged} sessions logged by ${firstName(name)}`;
  }
}

/**
 * Revoking is destructive and the consequence differs per state, so the
 * confirmation names the thing actually at risk rather than asking "are you
 * sure?" about all of them identically.
 */
function revokeToast(state: string, name: string): string {
  switch (state) {
    case 'Stale':
      return `Revoke ${firstName(name)}’s seat? 6 unsynced sessions may be lost.`;
    case 'Invited':
      return 'Invite cancelled · seat released';
    default:
      return `Revoke ${firstName(name)}’s seat? Their logged sessions stay with the gym.`;
  }
}
