import type { Metadata } from 'next';
import { DemoButton } from '@/components/console/demo-button';
import { ColumnChart, HeatLegend, heatCellClass } from '@/components/ui/charts';
import {
  Avatar,
  Card,
  CardHeader,
  CardNote,
  Dot,
  Meter,
  PanelHeader,
  StatusPill,
} from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  ATTENDANCE_ROWS,
  ATTENDANCE_SUMMARY,
  CHECK_INS_BY_HOUR,
  DOOR_FEED,
  HEATMAP_DAYS,
  HEATMAP_HOURS,
  HOURLY_CAPTION,
  HOUR_LABELS,
  SLIPPING_MEMBERS,
  TODAY,
} from '@/lib/data';
import { chartBars } from '@/lib/metrics';
import { DOOR_EVENT_TONE, TONE_TEXT } from '@/lib/tone';

export const metadata: Metadata = { title: 'Check-ins' };

const GRID = 'grid grid-cols-[1.8fr_1fr_1fr_1.4fr_1fr] gap-4 px-[26px]';

const HEADINGS = ['Member', 'Visits · 30d', 'Avg stay', 'Consistency', 'Signal'] as const;

/**
 * Who came in, when, and who has stopped coming.
 *
 * The last of those is the one that makes money: a member who has not been seen
 * in ten days is a cancellation in three weeks, and the only cheap moment to
 * act on it is now.
 */
export default function CheckInsPage() {
  const hourBars = chartBars(CHECK_INS_BY_HOUR, HOUR_LABELS, 2);

  return (
    <div className="flex flex-col gap-[18px]">
      <section aria-label="Attendance summary" className="grid grid-cols-4 gap-4">
        {ATTENDANCE_SUMMARY.map((stat) => (
          <Card key={stat.label} size="tile" className="gap-[13px] px-[22px] py-5">
            <p className="t-eyebrow">{stat.label}</p>
            <p className={cn('t-display text-[34px]', TONE_TEXT[stat.tone])}>{stat.value}</p>
            <p className="t-mono-sm text-sub">{stat.sub}</p>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-[1fr_var(--spacing-rail)] gap-4">
        {/* --- Hourly chart and heatmap --------------------------------- */}

        <Card className="gap-6 px-[26px] py-6">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="t-section">Check-ins by hour · today</h2>
              <p className="t-mono-sm text-muted">{HOURLY_CAPTION}</p>
            </div>
            <CardNote className="t-link text-gold">{TODAY}</CardNote>
          </div>

          <ColumnChart bars={hourBars} bodyHeight={132} minHeight={14} gap={6} radius={6} />

          <div className="border-line flex flex-col gap-3 border-t pt-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="t-section">Footfall pattern · last 7 days</h3>
              <HeatLegend />
            </div>

            <div className="flex gap-2">
              {/* Band labels. `pb` aligns their baseline with the cells, not
                  with the weekday captions beneath the columns. */}
              <div className="flex flex-col justify-end gap-[5px] pb-[22px]">
                {HEATMAP_HOURS.map((hour) => (
                  <span key={hour} className="t-mono-3xs text-muted flex h-[15px] items-center">
                    {hour}
                  </span>
                ))}
              </div>

              {HEATMAP_DAYS.map((day) => (
                <div key={day.label} className="flex flex-1 flex-col items-center gap-[5px]">
                  {day.cells.map((level, index) => (
                    <span
                      key={`${day.label}-${HEATMAP_HOURS[index] ?? index}`}
                      aria-hidden="true"
                      className={cn('h-[15px] w-full rounded', heatCellClass(level))}
                    />
                  ))}
                  <span className={cn('t-mono-2xs pt-1.5', day.today ? 'text-gold' : 'text-muted')}>
                    {day.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* --- Live feed and churn risk --------------------------------- */}

        <div className="flex flex-col gap-4">
          <Card className="px-6 py-[22px]">
            <CardHeader
              title="Live door feed"
              className="pb-2"
              action={
                <span className="flex items-center gap-[7px]">
                  <Dot tone="ok" size={5} pulse />
                  <span className="t-pill text-muted">Turnstile online</span>
                </span>
              }
            />
            {/*
              `aria-live="off"`: the feed updates continuously in production, and
              a polite live region would read every door event aloud over
              whatever the owner is actually doing.
            */}
            <ul aria-live="off">
              {DOOR_FEED.map((entry) => {
                const tone = DOOR_EVENT_TONE[entry.event];
                return (
                  <li key={entry.id} className="ow-divide flex items-center gap-3 py-[10px]">
                    <span className="t-mono-sm text-muted w-[52px] shrink-0">{entry.time}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span
                        className={cn(
                          't-sm truncate font-medium',
                          tone === 'warn'
                            ? 'text-warn'
                            : entry.event === 'Out'
                              ? 'text-sub'
                              : 'text-ink',
                        )}
                      >
                        {entry.name}
                      </span>
                      <span className="t-mono-2xs text-muted">{entry.meta}</span>
                    </span>
                    <StatusPill tone={tone} size="sm">
                      {entry.event}
                    </StatusPill>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card tone="warn" className="px-6 py-[22px]">
            <CardHeader
              title="Not seen in 10+ days"
              className="pb-2"
              action={<span className="t-pill text-warn">Churn risk</span>}
            />
            <ul>
              {SLIPPING_MEMBERS.map((member) => (
                <li key={member.id} className="ow-divide flex items-center gap-3 py-[10px]">
                  <Avatar name={member.name} size={30} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="t-sm font-medium">{member.name}</span>
                    <span className="t-mono-2xs text-muted">{member.meta}</span>
                  </span>
                  <DemoButton
                    toast={member.action}
                    variant="raised"
                    srSuffix={member.name}
                    className="t-pill-sm h-7 shrink-0 rounded-[14px] px-3"
                    label="Nudge"
                  />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* --- Per-member register ---------------------------------------- */}

      <Card className="overflow-hidden">
        <PanelHeader
          title="Attendance per member · rolling 30 days"
          action={
            <DemoButton
              toast="Attendance register exported · 30 days × 412 members"
              variant="raised"
              className="t-pill h-[34px] rounded-[17px] px-4"
              label="Export register"
            />
          }
        />

        <div className={cn(GRID, 'ow-divide-b bg-raise py-[14px]')} aria-hidden="true">
          {HEADINGS.map((heading) => (
            <span key={heading} className="t-colhead">
              {heading}
            </span>
          ))}
        </div>

        <ul>
          {ATTENDANCE_ROWS.map((row) => {
            // A frozen membership is held, not measured. Rendering 0% would
            // report "stopped coming", which is a different fact.
            const held = row.consistency === null;

            return (
              <li key={row.id} className={cn(GRID, 'ow-divide-b items-center py-[14px]')}>
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={row.name} size={32} />
                  <span className="t-sm font-medium">{row.name}</span>
                </span>
                <span className="t-mono-lg text-sub">{row.visits ?? '0'}</span>
                <span className="t-mono-lg text-sub">{row.averageStay}</span>
                <span className="flex items-center gap-[11px]">
                  <Meter
                    // A held membership still draws a sliver, so the row does
                    // not read as an empty track next to "0 visits".
                    value={row.consistency ?? 2}
                    total={100}
                    tone={row.tone}
                    height={5}
                    className="flex-1"
                  />
                  <span
                    className={cn(
                      't-mono w-[34px] shrink-0',
                      held ? 'text-muted' : TONE_TEXT[row.tone],
                    )}
                  >
                    {held ? 'held' : `${row.consistency}%`}
                  </span>
                </span>
                <StatusPill tone={row.tone} className="justify-self-start">
                  {row.tag}
                </StatusPill>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
