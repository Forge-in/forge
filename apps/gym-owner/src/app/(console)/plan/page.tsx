import type { Metadata } from 'next';
import Link from 'next/link';
import { DemoButton } from '@/components/console/demo-button';
import { AutoRenewToggle } from '@/components/screens/plan/auto-renew';
import { RingGauge } from '@/components/ui/charts';
import { Card, Eyebrow, PanelHeader, StatusPill } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  ENTITLEMENTS,
  PAYMENT_HISTORY,
  PLAN_CARDS,
  SUBSCRIPTION,
  type PlanCard as PlanCardShape,
} from '@/lib/data';
import { count, negativeRupees, ratio, rupees } from '@/lib/format';
import { PAYMENT_STATE_TONE } from '@/lib/tone';

export const metadata: Metadata = { title: 'My Wrath plan' };

const HISTORY_GRID = 'grid grid-cols-[1fr_1.2fr_1.4fr_1fr_1fr_120px] gap-4 px-[26px]';

const HISTORY_HEADINGS = ['Date', 'Invoice', 'Plan', 'Amount', 'Status', ''] as const;

/** Which of the three tiers this gym is on, derived from the entitlement. */
const CURRENT_PLAN = ENTITLEMENTS.trainerApp ? 'Wrath Pro' : 'Wrath Core';

export default function PlanPage() {
  const current = PLAN_CARDS.find((plan) => plan.name === CURRENT_PLAN);
  const cycleShare = ratio(SUBSCRIPTION.cycleDays - SUBSCRIPTION.daysLeft, SUBSCRIPTION.cycleDays);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-[1fr_340px] gap-4">
        {/* --- Current plan --------------------------------------------- */}

        <Card
          tone="gold"
          className="gap-[22px] rounded-[28px] px-7 py-[26px] shadow-[0_14px_40px_var(--ow-shadow-soft)]"
        >
          <div className="flex items-start justify-between gap-5">
            <div className="flex flex-col gap-[11px]">
              <Eyebrow className="text-gold">Current plan</Eyebrow>
              <h2 className="t-display text-4xl leading-none">{CURRENT_PLAN}</h2>
              <p className="t-mono text-sub">
                {rupees(current?.monthlyPrice ?? 0)} per month + 18% GST · billed monthly · gym ID{' '}
                {SUBSCRIPTION.gymId}
              </p>
            </div>

            <RingGauge size={86} radius={37} strokeWidth={6} fraction={cycleShare}>
              <span className="t-display text-[22px] leading-none">{SUBSCRIPTION.daysLeft}</span>
              <span className="t-mono-3xs text-muted tracking-[0.1em] uppercase">days left</span>
            </RingGauge>
          </div>

          <dl className="border-line grid grid-cols-4 gap-4 border-t pt-5">
            <Fact label="Renews on" value={SUBSCRIPTION.renewsOn} />
            <Fact label="Next charge" value={`${rupees(SUBSCRIPTION.nextCharge)} incl. GST`} />
            <Fact
              label="Trainer seats"
              value={
                ENTITLEMENTS.trainerApp
                  ? `${SUBSCRIPTION.seatsUsed} of ${SUBSCRIPTION.seatsTotal} used`
                  : 'Not included'
              }
              muted={!ENTITLEMENTS.trainerApp}
            />
            <Fact
              label="Members allowed"
              value={`${count(SUBSCRIPTION.membersUsed)} of ${count(SUBSCRIPTION.membersAllowed)}`}
            />
          </dl>

          <div className="flex flex-wrap items-center gap-[10px]">
            <DemoButton
              toast={`Payment sheet · UPI, card or netbanking · ${rupees(SUBSCRIPTION.nextCharge)}`}
              label={`Pay ${rupees(SUBSCRIPTION.nextCharge)} now`}
              variant="gold"
              className="t-base h-11 rounded-[22px] px-[22px]"
            />
            <DemoButton
              toast={`Add or remove trainer seats · ${rupees(SUBSCRIPTION.extraSeatPrice)} per extra seat`}
              variant="raised"
              className="t-sm h-11 rounded-[22px] px-5 font-medium"
              label="Manage seats"
            />
            <DemoButton
              toast={`Renewal off means trainer app access ends ${SUBSCRIPTION.renewsOn}. Confirm in the email we just sent.`}
              variant="ghost"
              className="t-sm h-11 rounded-[22px] px-5 font-medium"
              label="Cancel renewal"
            />
          </div>
        </Card>

        {/* --- Payment method and billing details ----------------------- */}

        <div className="flex flex-col gap-4">
          <Card className="gap-[14px] px-6 py-[22px]">
            <h2 className="t-section-sm">Payment method</h2>

            <div className="ow-inset flex flex-col gap-3 px-[18px] py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="t-mono-xl tracking-[0.1em]">•••• {SUBSCRIPTION.cardLast4}</p>
                <p className="t-mono-xs text-muted">{SUBSCRIPTION.cardMeta}</p>
              </div>
              <p className="t-mono-xs text-ok">
                Auto-debit mandate active · {rupees(SUBSCRIPTION.mandateLimit)} limit
              </p>
            </div>

            <AutoRenewToggle />

            <DemoButton
              toast="Add a new card or UPI mandate"
              variant="raised"
              className="t-pill bg-surface h-9 w-full rounded-[18px]"
              label="Change card / UPI"
            />
          </Card>

          <Card className="gap-[10px] px-6 py-[22px] shadow-none">
            <Eyebrow>Billing details</Eyebrow>
            <p className="t-sm text-sub leading-[1.8]">{SUBSCRIPTION.billingAddress}</p>
            {/*
              A link, not a toast: the GSTIN and address genuinely live on the
              gym profile screen, so this is real navigation.
            */}
            <Link href="/settings" className="t-link text-gold ow-hoverable pt-1">
              Edit GSTIN &amp; address
            </Link>
          </Card>
        </div>
      </div>

      {/* --- Tiers ------------------------------------------------------ */}

      <ul className="grid grid-cols-3 gap-4">
        {PLAN_CARDS.map((plan) => (
          <PlanTier key={plan.name} plan={plan} />
        ))}
      </ul>

      {/* --- History ---------------------------------------------------- */}

      <Card className="overflow-hidden">
        <PanelHeader
          title="Payment & plan history"
          action={
            <DemoButton
              toast="12 invoices zipped · GST summary included"
              variant="plain"
              className="t-link"
              label="Download all invoices"
            />
          }
        />

        <div className={cn(HISTORY_GRID, 'ow-divide-b bg-raise py-[14px]')} aria-hidden="true">
          {HISTORY_HEADINGS.map((heading, index) => (
            <span key={heading || `col-${index}`} className="t-colhead">
              {heading}
            </span>
          ))}
        </div>

        <ul>
          {PAYMENT_HISTORY.map((payment) => (
            <li key={payment.id} className={cn(HISTORY_GRID, 'ow-divide-b items-center py-[15px]')}>
              <span className="t-mono-md text-sub">{payment.date}</span>
              <span className="t-mono-md text-muted">{payment.invoice}</span>
              <span className="t-sm">{payment.plan}</span>
              <span
                className={cn(
                  't-sm font-semibold',
                  payment.state === 'Failed'
                    ? 'text-warn'
                    : payment.amount < 0
                      ? 'text-sub'
                      : 'text-ink',
                )}
              >
                {/* A credit note is a negative amount and is written as one — a
                    refund shown as a positive charge is a support ticket. */}
                {payment.amount < 0 ? negativeRupees(payment.amount) : rupees(payment.amount)}
              </span>
              <StatusPill tone={PAYMENT_STATE_TONE[payment.state]} className="justify-self-start">
                {payment.state}
              </StatusPill>
              <DemoButton
                toast={payment.note}
                label={payment.action}
                variant={payment.state === 'Failed' ? 'danger' : 'raised'}
                srSuffix={payment.invoice}
                className="t-pill h-[30px] w-full rounded-[15px]"
              />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Fact({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean | undefined;
}) {
  return (
    <div className="flex flex-col gap-[7px]">
      <dt className="t-field-label">{label}</dt>
      <dd className={cn('t-md font-semibold', muted ? 'text-muted' : 'text-ink')}>{value}</dd>
    </div>
  );
}

function PlanTier({ plan }: { plan: PlanCardShape }) {
  const isCurrent = plan.name === CURRENT_PLAN;
  const isDowngrade =
    plan.monthlyPrice < (PLAN_CARDS.find((p) => p.name === CURRENT_PLAN)?.monthlyPrice ?? 0);

  const cta = isCurrent ? 'Current plan' : isDowngrade ? 'Downgrade' : 'Upgrade';

  const toast = isCurrent
    ? `You are on ${plan.name}`
    : isDowngrade
      ? `Downgrading removes trainer mobile for ${SUBSCRIPTION.seatsUsed} trainers on ${SUBSCRIPTION.renewsOn}`
      : `Switching to ${plan.name} · pro-rated today`;

  return (
    <li
      className={cn(
        'ow-card flex flex-col gap-4 px-[26px] py-6',
        isCurrent && 'bg-gold-soft border-gold',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{plan.name}</h3>
        {isCurrent ? (
          <StatusPill tone="gold" size="sm">
            Current
          </StatusPill>
        ) : plan.tag ? (
          <StatusPill tone="gold" size="sm">
            {plan.tag}
          </StatusPill>
        ) : null}
      </div>

      <p className="flex items-end gap-2">
        <span className="t-display text-[34px]">{rupees(plan.monthlyPrice)}</span>
        <span className="t-mono-xs text-muted pb-[5px]">/month + GST</span>
      </p>

      <ul className="flex flex-col gap-[9px]">
        {plan.features.map((feature) => (
          <li key={feature.label} className="flex items-start gap-[10px]">
            <span
              aria-hidden="true"
              className={cn('t-mono-xs pt-0.5', feature.included ? 'text-sub' : 'text-muted')}
            >
              {feature.included ? '✓' : '✕'}
            </span>
            <span
              aria-hidden="true"
              className={cn('t-xs leading-[1.5]', feature.included ? 'text-sub' : 'text-muted')}
            >
              {feature.label}
            </span>
            {/*
              The tick and the cross are a colour-and-glyph distinction, so the
              state is said in words too. Written as ONE string rather than a
              hidden prefix beside the visible label: the accessible-name
              algorithm trims each text node before joining them, which would
              produce "Included:Trainer mobile".
            */}
            <span className="sr-only">
              {feature.included ? `Included: ${feature.label}` : `Not included: ${feature.label}`}
            </span>
          </li>
        ))}
      </ul>

      <DemoButton
        toast={toast}
        label={cta}
        // Three tier buttons all say "Upgrade"; the plan name is what tells a
        // screen-reader user which one they are on.
        srSuffix={plan.name}
        disabled={isCurrent}
        variant={isCurrent ? 'ghost' : plan.name === 'Wrath Elite' ? 'gold' : 'raised'}
        className="t-sm mt-1 h-10 w-full rounded-[20px] font-semibold"
      />
    </li>
  );
}
