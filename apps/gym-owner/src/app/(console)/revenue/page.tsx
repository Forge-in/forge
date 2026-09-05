import type { Metadata } from 'next';
import { DemoButton } from '@/components/console/demo-button';
import { RevenueBars, RevenueScopeSwitch } from '@/components/screens/revenue/revenue-chart';
import { SplitBar } from '@/components/ui/charts';
import { Avatar, Card, CardHeader, Dot, Eyebrow, Meter } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  PT_EARNERS,
  REVENUE_BY_MODE,
  REVENUE_BY_PLAN,
  REVENUE_FOOTER,
  UNRECONCILED_CASH_NOTE,
} from '@/lib/data';
import { percent, rupees } from '@/lib/format';
import { revenueSeries } from '@/lib/metrics';
import { parseRevenueScope } from '@/lib/search-params';
import { TONE_TEXT } from '@/lib/tone';

export const metadata: Metadata = { title: 'Revenue' };

/**
 * The money screen.
 *
 * Same series as the overview's card, at full size and with the breakdowns an
 * owner needs at month end: what was collected, what it cost in refunds, what
 * is owed in GST, and how much cash has not been reconciled — which is the
 * figure that turns into a real problem if nobody looks at it.
 */
export default async function RevenuePage({ searchParams }: PageProps<'/revenue'>) {
  const scope = parseRevenueScope(await searchParams);
  const series = revenueSeries(scope);

  return (
    <div className="flex flex-col gap-[18px]">
      <Card className="gap-[22px] px-7 pt-[26px] pb-[22px]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-[10px]">
            <Eyebrow className="text-gold">Collected · {scope}</Eyebrow>
            <p className="flex items-end gap-[14px]">
              <span className="t-display text-[56px] leading-[0.84]">{rupees(series.total)}</span>
              <span className="t-mono-lg text-ok pb-2">{series.delta} vs last</span>
            </p>
            <p className="t-mono text-muted">{series.caption}</p>
          </div>

          <div className="flex items-center gap-[10px]">
            <RevenueScopeSwitch scope={scope} />
            <DemoButton
              toast="Revenue ledger exported · 218 rows, GST split included"
              variant="raised"
              className="t-pill bg-surface h-9 rounded-[18px] px-4"
              label="Export CSV"
            />
          </div>
        </div>

        <RevenueBars scope={scope} bodyHeight={210} radius={8} gap={6} />

        <dl className="border-line flex flex-wrap items-start gap-[26px] border-t pt-[18px]">
          {REVENUE_FOOTER.map((stat) => (
            <div key={stat.label} className="flex flex-col gap-[7px]">
              <dt className="t-field-label">{stat.label}</dt>
              <dd className={cn('text-[15px] font-semibold', TONE_TEXT[stat.tone])}>
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {/* --- By plan -------------------------------------------------- */}

        <Card className="gap-4 px-6 py-[22px]">
          <CardHeader title="By plan" />
          <dl className="flex flex-col gap-4">
            {REVENUE_BY_PLAN.map((line) => (
              <div key={line.label} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <dt className="t-mono text-sub">{line.label}</dt>
                  <dd className="t-sm font-medium">{rupees(line.amount)}</dd>
                </div>
                {/*
                  Share of the WIDEST line, not of the total: this card compares
                  plans against each other, and shares of the whole would render
                  every bar too short to compare.
                */}
                <Meter value={line.share} total={1} tone={line.tone} height={5} />
              </div>
            ))}
          </dl>
        </Card>

        {/* --- By payment mode ------------------------------------------ */}

        <Card className="gap-4 px-6 py-[22px]">
          <CardHeader title="Payment mode" />

          <SplitBar
            segments={REVENUE_BY_MODE.map((line) => ({
              key: line.label,
              share: line.share,
              tone: line.tone,
            }))}
          />

          <dl className="flex flex-col">
            {REVENUE_BY_MODE.map((line) => (
              <div
                key={line.label}
                className="ow-divide flex items-center justify-between gap-3 py-[7px]"
              >
                <dt className="flex items-center gap-[9px]">
                  <Dot tone={line.tone} size={8} square />
                  <span className="t-mono text-sub">{line.label}</span>
                </dt>
                <dd className="t-sm font-medium">
                  {rupees(line.amount)} · {percent(line.share)}
                </dd>
              </div>
            ))}
          </dl>

          <p className="t-mono-xs text-muted leading-[1.6]">{UNRECONCILED_CASH_NOTE}</p>
        </Card>

        {/* --- PT earners ----------------------------------------------- */}

        <Card className="gap-[14px] px-6 py-[22px]">
          <CardHeader title="Personal training earners" />
          <ul>
            {PT_EARNERS.map((earner) => (
              <li key={earner.id} className="ow-divide flex items-center gap-3 py-[9px]">
                <Avatar name={earner.name} size={32} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="t-sm font-medium">{earner.name}</span>
                  <span className="t-mono-xs text-muted">{earner.meta}</span>
                </span>
                <span className="t-base text-gold font-semibold">{rupees(earner.amount)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
