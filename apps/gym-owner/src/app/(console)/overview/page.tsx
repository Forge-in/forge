import type { Metadata } from 'next';
import Link from 'next/link';
import { OverviewBanner } from '@/components/screens/overview/overview-banner';
import { RevenueBars, RevenueScopeSwitch } from '@/components/screens/revenue/revenue-chart';
import { RingGauge } from '@/components/ui/charts';
import { ActionLink } from '@/components/ui/controls';
import {
  Card,
  CardHeader,
  CardNote,
  Dot,
  Eyebrow,
  Meter,
  StatusPill,
} from '@/components/ui/primitives';
import { ATTENTION_ITEMS, OCCUPANCY, OVERVIEW_KPIS, REVENUE_SPLIT, TODAY_STRIP } from '@/lib/data';
import { cn } from '@/lib/cn';
import { ratio, rupees } from '@/lib/format';
import { fillTone, revenueSeries } from '@/lib/metrics';
import { parseRevenueScope } from '@/lib/search-params';
import { TONE_PILL, TONE_TEXT } from '@/lib/tone';

export const metadata: Metadata = { title: 'Overview' };

/**
 * The morning screen.
 *
 * Ordered by what an owner does when they sit down: read the one thing that is
 * on fire, glance at the four numbers, then look at the money and the floor. The
 * two lists at the bottom are the working queue — everything in them is a link
 * into the screen that can resolve it, because a dashboard that only tells you
 * about a problem makes you go and find it again.
 */
export default async function OverviewPage({ searchParams }: PageProps<'/overview'>) {
  const scope = parseRevenueScope(await searchParams);
  const series = revenueSeries(scope);
  const occupancyShare = ratio(OCCUPANCY.now, OCCUPANCY.capacity);

  return (
    <div className="flex flex-col gap-[18px]">
      <OverviewBanner />

      {/* --- KPI row ---------------------------------------------------- */}

      <section aria-label="Headline figures" className="grid grid-cols-4 gap-4">
        {OVERVIEW_KPIS.map((kpi) => (
          <Link
            key={kpi.id}
            href={kpi.href}
            className="ow-tile ow-hoverable flex flex-col gap-[14px] px-[22px] py-5"
          >
            <span className="flex items-center justify-between gap-[10px]">
              <span className="t-eyebrow">{kpi.label}</span>
              <span
                className={cn(
                  't-mono-2xs shrink-0 rounded-[9px] px-2 py-[3px] whitespace-nowrap',
                  TONE_PILL[kpi.tone],
                )}
              >
                {kpi.delta}
              </span>
            </span>
            <span
              className={cn(
                't-display text-[38px]',
                kpi.tone === 'warn' ? 'text-warn' : 'text-ink',
              )}
            >
              {kpi.value}
            </span>
            <span className="t-mono-sm text-sub">{kpi.sub}</span>
          </Link>
        ))}
      </section>

      {/* --- Revenue and occupancy -------------------------------------- */}

      <div className="grid grid-cols-[1fr_var(--spacing-rail)] gap-4">
        <Card className="gap-5 px-[26px] pt-6 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-[9px]">
              <Eyebrow className="text-gold">Revenue · {scope}</Eyebrow>
              <p className="flex items-end gap-3">
                <span className="t-display text-[44px] leading-[0.86]">{rupees(series.total)}</span>
                <span className="t-mono text-ok pb-1.5">{series.delta} vs last</span>
              </p>
              <p className="t-mono-sm text-muted">{series.caption}</p>
            </div>
            <RevenueScopeSwitch scope={scope} />
          </div>

          <RevenueBars scope={scope} bodyHeight={174} />

          <div className="border-line flex flex-wrap items-center gap-[22px] border-t pt-4">
            {REVENUE_SPLIT.map((line) => (
              <p key={line.label} className="flex items-center gap-[9px]">
                <Dot tone={line.tone} size={8} square />
                <span className="t-mono-sm text-sub">{line.label}</span>
                <span className="t-sm font-semibold">{rupees(line.amount)}</span>
              </p>
            ))}
          </div>
        </Card>

        <Card className="items-center gap-4 px-[26px] py-6">
          {/*
            A <div>, not a <p>. `Eyebrow` renders a paragraph, and a <p> inside
            a <p> is invalid HTML: the browser silently auto-closes the outer
            one, so the parsed DOM differs from what React rendered and
            hydration fails for the whole tree.
          */}
          <div className="flex items-center gap-[9px] self-start">
            <Dot tone="gold" size={6} pulse />
            <Eyebrow className="text-gold">In the gym now</Eyebrow>
          </div>

          <RingGauge
            size={194}
            radius={84}
            strokeWidth={11}
            fraction={occupancyShare}
            gradientId="overview-occupancy"
            glow
          >
            <span className="t-display text-[52px] leading-[0.84]">{OCCUPANCY.now}</span>
            <span className="t-mono-xs text-muted tracking-[0.14em] uppercase">
              of {OCCUPANCY.capacity} capacity
            </span>
          </RingGauge>

          <dl className="flex w-full flex-col gap-[11px]">
            {OCCUPANCY.rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3">
                <dt className="t-mono-sm text-muted">{row.label}</dt>
                <dd className={cn('t-sm font-medium', row.muted ? 'text-sub' : 'text-ink')}>
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {/* --- Working queues --------------------------------------------- */}

      <div className="grid grid-cols-2 gap-4">
        <Card className="px-6 py-[22px]">
          <CardHeader
            title="Needs your attention"
            action={<CardNote>{ATTENTION_ITEMS.length} open</CardNote>}
            className="pb-[10px]"
          />
          <ul>
            {ATTENTION_ITEMS.map((item) => (
              <li key={item.id} className="ow-divide flex items-center gap-[14px] py-[13px]">
                <span
                  aria-hidden="true"
                  className={cn(
                    't-mono-lg flex size-[34px] shrink-0 items-center justify-center rounded-full',
                    TONE_PILL[item.tone],
                  )}
                >
                  {item.icon}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
                  <span className="t-base font-medium">{item.title}</span>
                  <span className="t-mono-sm text-muted">{item.meta}</span>
                </span>
                <ActionLink
                  variant="raised"
                  href={item.href}
                  // Five "Assign"/"Chase"/"Open" links are five identically
                  // named controls unless each says what it acts on. Set as an
                  // attribute rather than built from a hidden span, which the
                  // accessible-name algorithm would join without the space.
                  aria-label={`${item.cta} — ${item.title}`}
                  className="t-pill h-[30px] shrink-0 rounded-[15px] px-[14px]"
                >
                  {item.cta}
                </ActionLink>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="px-6 py-[22px]">
          <CardHeader
            title="Today on the floor"
            action={
              <ActionLink href="/classes" className="t-link">
                Full schedule
              </ActionLink>
            }
            className="pb-[10px]"
          />
          <ul>
            {TODAY_STRIP.map((slot) => (
              <li key={slot.id} className="ow-divide flex items-center gap-[14px] py-[13px]">
                <span className="flex w-11 shrink-0 flex-col gap-0.5">
                  <span className="t-mono-lg">{slot.hour}</span>
                  <span className="t-mono-2xs text-muted">{slot.minute}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
                  <span className="t-base font-medium">{slot.name}</span>
                  <span className="t-mono-sm text-muted">{slot.trainer}</span>
                </span>
                <span className="flex w-[78px] shrink-0 flex-col gap-[7px]">
                  <span
                    className={cn('t-mono-sm', slot.tone === 'warn' ? TONE_TEXT.warn : 'text-sub')}
                  >
                    {slot.filled} / {slot.capacity}
                  </span>
                  <Meter
                    value={slot.filled}
                    total={slot.capacity}
                    tone={slot.tone === 'warn' ? 'warn' : fillTone(slot.filled, slot.capacity)}
                  />
                </span>
                <StatusPill tone={slot.tone} size="sm">
                  {slot.status}
                </StatusPill>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
