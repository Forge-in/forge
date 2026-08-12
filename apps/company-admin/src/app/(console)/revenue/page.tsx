import type { Metadata } from 'next';
import { ToastAction } from '@/components/console/toast-action';
import { ActionLink } from '@/components/ui/controls';
import { MrrChart } from '@/components/ui/mrr-chart';
import {
  Card,
  CardHeader,
  CardNote,
  EmptyState,
  MetricCard,
  StatusDot,
} from '@/components/ui/primitives';
import { formatMoney, rankLabel } from '@/lib/format';
import {
  atRiskAccounts,
  dunningRows,
  dunningValue,
  failedInvoices,
  mrrBars,
  planSplit,
  platformMetrics,
  topAccounts,
  upcomingRenewals,
} from '@/lib/metrics';

export const metadata: Metadata = { title: 'Revenue' };

export default function RevenuePage() {
  const { mrrTotal, arr } = platformMetrics();
  const bars = mrrBars();
  const tiers = planSplit();
  const leaders = topAccounts();
  const risky = atRiskAccounts();
  const failed = failedInvoices();
  const dunning = dunningRows();
  const renewals = upcomingRenewals();

  return (
    <div className="flex flex-col gap-6 px-8 pt-[26px] pb-12">
      <div className="flex flex-wrap gap-4">
        <MetricCard
          className="min-w-[220px] flex-[1.3]"
          label="MRR"
          value={formatMoney(mrrTotal)}
          valueClassName="t-display-lg"
          hint="+11.4% vs last month"
        />
        <MetricCard
          className="min-w-[180px] flex-1"
          label="ARR run rate"
          value={formatMoney(arr)}
          valueClassName="t-num-md"
          hint="At current MRR"
        />
        <MetricCard
          className="min-w-[180px] flex-1"
          label="Gross churn"
          value="1.8%"
          valueClassName="t-num-md"
          hint="Monthly, by revenue"
        />
        <MetricCard
          className="min-w-[180px] flex-1"
          label="Failed payments"
          value={failed.length}
          valueClassName="t-num-md"
          hint={`${formatMoney(dunningValue())} in dunning`}
        />
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <Card className="min-w-[380px] flex-[1.6] gap-5 p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="t-section">Growth</h2>
            <CardNote>Last 12 months</CardNote>
          </div>
          <MrrChart bars={bars} className="h-[170px]" gapClassName="gap-[9px]" />
        </Card>

        <Card className="min-w-[280px] flex-1 gap-[22px] p-6">
          <h2 className="t-section">Revenue by plan</h2>
          {tiers.map((tier) => (
            <div key={tier.plan} className="flex flex-col gap-[10px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px]">{tier.plan}</span>
                <span className="t-mono-md text-sub">
                  {tier.value} · {tier.percentLabel}
                </span>
              </div>
              <div className="bg-line h-1">
                <div
                  className={`h-1 ${tier.emphasised ? 'bg-ink' : 'bg-line-strong'}`}
                  style={{ width: `${tier.widthPercent}%` }}
                />
              </div>
              <span className="t-mono-xs text-muted">{tier.accounts} accounts</span>
            </div>
          ))}
        </Card>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-[380px] flex-[1.3] p-6">
          <CardHeader title="Top accounts" action={<CardNote>By MRR</CardNote>} />
          {leaders.map(({ gym, sharePercent }, index) => (
            <ActionLink
              key={gym.id}
              href={`/gyms/${gym.id}`}
              variant="plain"
              className="hairline-b wc-row text-ink flex items-center gap-4 py-[14px] text-left text-[13.5px]"
            >
              <span className="t-mono-sm text-dim w-[22px]">{rankLabel(index)}</span>
              <span className="min-w-0 flex-[1.6] truncate">{gym.name}</span>
              <span className="text-sub flex-1">{gym.plan}</span>
              <span className="text-sub w-24">{formatMoney(gym.mrr)}</span>
              <span className="t-mono-sm text-muted w-16">{sharePercent}</span>
            </ActionLink>
          ))}
        </Card>

        <Card className="min-w-[300px] flex-1 p-6">
          <CardHeader
            title="Churn & at risk"
            action={<CardNote>{risky.length} accounts</CardNote>}
          />
          {risky.length === 0 ? (
            <EmptyState>Nothing at risk. Every account is healthy and paying.</EmptyState>
          ) : (
            risky.map(({ gym, reason }) => (
              <ActionLink
                key={gym.id}
                href={`/gyms/${gym.id}`}
                variant="plain"
                className="hairline-b wc-row text-ink flex items-center gap-[14px] py-[14px] text-left"
              >
                <StatusDot status={gym.status} />
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="truncate text-[13.5px]">{gym.name}</span>
                  <span className="t-mono-xs text-muted">{reason}</span>
                </span>
                <span className="t-base text-sub">{formatMoney(gym.mrr)}</span>
              </ActionLink>
            ))
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-[340px] flex-1 p-6">
          <CardHeader title="Failed payments" action={<CardNote>Dunning</CardNote>} />
          {dunning.length === 0 ? (
            <EmptyState>No failed payments. Nothing is in dunning right now.</EmptyState>
          ) : (
            dunning.map(({ invoice, attempt }) => (
              <div
                key={invoice.id}
                className="hairline-b flex items-center gap-4 py-[14px] text-[13.5px]"
              >
                <span className="min-w-0 flex-[1.4] truncate">{invoice.org}</span>
                <span className="text-sub w-[90px]">{invoice.amount}</span>
                <span className="t-mono-xs text-muted flex-1">{attempt}</span>
                <ToastAction
                  message={`Retrying payment for ${invoice.org}`}
                  className="t-action px-[11px] py-[6px]"
                >
                  Retry
                </ToastAction>
              </div>
            ))
          )}
        </Card>

        <Card className="min-w-[340px] flex-1 p-6">
          <CardHeader title="Upcoming renewals" action={<CardNote>Next 30 days</CardNote>} />
          {renewals.length === 0 ? (
            <EmptyState>No renewals due in the next 30 days.</EmptyState>
          ) : (
            renewals.map(({ gym, date }) => (
              <div
                key={gym.id}
                className="hairline-b flex items-center gap-4 py-[14px] text-[13.5px]"
              >
                <span className="min-w-0 flex-[1.4] truncate">{gym.name}</span>
                <span className="text-sub flex-1">{gym.plan}</span>
                <span className="text-sub w-24">{formatMoney(gym.mrr)}</span>
                <span className="t-mono-sm text-muted w-20">{date}</span>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
