import type { Metadata } from 'next';
import { InviteCountHint } from '@/components/console/invite-count-hint';
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
import { formatCount, formatMoney } from '@/lib/format';
import { attentionAccounts, mrrBars, platformMetrics, recentlyRegistered } from '@/lib/metrics';

export const metadata: Metadata = { title: 'Overview' };

export default function OverviewPage() {
  const { gymCount, memberCount, mrrTotal, trialCount } = platformMetrics();
  const bars = mrrBars();
  const recent = recentlyRegistered();
  const attention = attentionAccounts();

  return (
    <div className="flex flex-col gap-6 px-8 pt-[26px] pb-12">
      <div className="flex flex-wrap gap-4">
        <MetricCard
          className="min-w-[220px] flex-[1.3]"
          label="Registered gyms"
          value={gymCount}
          valueClassName="t-display-xl"
          hint={<InviteCountHint trials={trialCount} />}
        />
        <MetricCard
          className="min-w-[180px] flex-1"
          label="Active members"
          value={formatCount(memberCount)}
          hint="+612 this month"
        />
        <MetricCard
          className="min-w-[180px] flex-1"
          label="Subscription MRR"
          value={formatMoney(mrrTotal)}
          hint="+11.4% vs last month"
        />
        <MetricCard
          className="min-w-[180px] flex-1"
          label="Net retention"
          value="112%"
          hint="Expansion beats churn"
        />
      </div>

      <Card className="gap-5 p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="t-section">Recurring revenue</h2>
          <CardNote>Last 12 months</CardNote>
        </div>
        <MrrChart bars={bars} className="h-[150px]" />
      </Card>

      <div className="flex flex-wrap items-stretch gap-4">
        <Card className="min-w-[320px] flex-1 px-6 py-[22px]">
          <CardHeader
            title="Recently registered"
            action={
              <ActionLink href="/gyms" className="t-action">
                All gyms
              </ActionLink>
            }
          />
          {recent.length === 0 ? (
            <EmptyState>No organisations registered yet.</EmptyState>
          ) : (
            recent.map((gym) => (
              <ActionLink
                key={gym.id}
                href={`/gyms/${gym.id}`}
                variant="plain"
                className="hairline-b wc-row text-ink flex items-center gap-[14px] py-[14px] text-left"
              >
                <span aria-hidden="true" className="bg-line size-7 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="truncate text-[13.5px]">{gym.name}</span>
                  <span className="t-mono-xs text-muted">
                    {gym.city} · {gym.plan} · {gym.sites} sites
                  </span>
                </span>
                <span className="t-base text-sub">{formatMoney(gym.mrr)}</span>
              </ActionLink>
            ))
          )}
        </Card>

        <Card className="min-w-[320px] flex-1 px-6 py-[22px]">
          <CardHeader
            title="Needs attention"
            action={
              <ActionLink href="/revenue" className="t-action">
                Revenue
              </ActionLink>
            }
          />
          {attention.length === 0 ? (
            <EmptyState>Nothing needs a look. Every account is paying and healthy.</EmptyState>
          ) : (
            attention.map(({ gym, reason }) => (
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
                <span className="t-action text-sub">{gym.status}</span>
              </ActionLink>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
