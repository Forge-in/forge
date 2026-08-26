import type { Metadata } from 'next';
import { DemoButton } from '@/components/console/demo-button';
import {
  ClassViewSwitch,
  NewSessionButton,
  WeekPicker,
} from '@/components/screens/classes/class-controls';
import {
  Card,
  CardHeader,
  EmptyState,
  Meter,
  PanelHeader,
  StatusPill,
} from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  CURRENT_DATE_LABEL,
  CURRENT_DAY,
  ROOMS,
  ROOM_PRESSURE_THRESHOLD,
  TRAINER_LOAD,
  TRAINER_LOAD_NOTE,
  WAITLIST,
  WEEK,
  sessionsFor,
} from '@/lib/data';
import { percent, ratio } from '@/lib/format';
import { fillTone } from '@/lib/metrics';
import { parseClassFilters } from '@/lib/search-params';
import { SESSION_STATUS_TONE, TONE_TEXT } from '@/lib/tone';

export const metadata: Metadata = { title: 'Classes & sessions' };

/** "06:00" -> "06:00", and the duration as its own line. Kept out of the JSX. */
function durationLabel(minutes: number): string {
  return `${minutes} min`;
}

export default async function ClassesPage({ searchParams }: PageProps<'/classes'>) {
  const { day, view } = parseClassFilters(await searchParams);
  const sessions = sessionsFor(day, view);
  const summary = WEEK.find((entry) => entry.day === day);

  const heading = `${view === 'Group' ? 'Group classes' : 'PT sessions'} · ${day} ${
    day === CURRENT_DAY ? CURRENT_DATE_LABEL : 'this week'
  }`;

  const unassigned = sessions.filter((session) => session.status === 'Unassigned').length;
  const cancelled = sessions.filter((session) => session.status === 'Cancelled').length;

  /*
   * "short hours", not "closed". The gym IS open on Sunday — the empty state
   * below says 7 AM to 1 PM — it simply has no classes booked. Saying "closed"
   * here contradicted the paragraph directly beneath it.
   */
  const subtitle =
    sessions.length === 0
      ? `${day === 'Sun' ? 'Sunday' : day} · short hours`
      : [
          `${sessions.length} ${view === 'Group' ? 'slots' : 'sessions'}`,
          unassigned > 0 && `${unassigned} unassigned`,
          cancelled > 0 && `${cancelled} cancelled`,
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between gap-4">
        <WeekPicker day={day} />
        <div className="flex items-center gap-[10px]">
          <ClassViewSwitch view={view} />
          <NewSessionButton view={view} />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_340px] gap-4">
        {/* --- Schedule -------------------------------------------------- */}

        <Card className="overflow-hidden">
          <PanelHeader
            title={heading}
            action={<span className="t-mono-sm text-muted">{subtitle}</span>}
          />

          {sessions.length === 0 ? (
            <EmptyState
              glyph="—"
              title={`No sessions scheduled for ${day === 'Sun' ? 'Sunday' : day}`}
              body="Gym is open 7 AM – 1 PM. Add a session or keep it a rest day."
              action={
                <NewSessionButton
                  view={view}
                  variant="gold"
                  // The empty state asks for "a session", not "a class" — it is
                  // offered whichever view you are in.
                  label="Add session"
                  className="mt-1 h-[38px] rounded-[19px] px-5"
                />
              }
            />
          ) : (
            <ul>
              {sessions.map((session) => {
                const tone = SESSION_STATUS_TONE[session.status];
                const cancelled = session.status === 'Cancelled';
                const running = session.status === 'Running';
                const isPersonal = session.capacity === 1;

                return (
                  <li
                    key={session.id}
                    className="ow-divide-b flex items-center gap-[18px] px-[26px] py-[17px]"
                  >
                    <span className="flex w-14 shrink-0 flex-col gap-1">
                      <span className="t-mono-xl">{session.time}</span>
                      <span className="t-mono-2xs text-muted">
                        {durationLabel(session.durationMinutes)}
                      </span>
                    </span>

                    {/* The spine: the fastest read of "is this one fine?" down a
                        column of six. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-[38px] w-[3px] shrink-0 rounded-sm',
                        cancelled
                          ? 'bg-line-strong'
                          : running
                            ? 'bg-gold'
                            : tone === 'warn'
                              ? 'bg-warn'
                              : 'bg-line-strong',
                      )}
                    />

                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="t-body font-medium">{session.name}</span>
                      <span
                        className={cn(
                          't-mono-sm',
                          session.trainer === null ? 'text-warn' : 'text-muted',
                        )}
                      >
                        {session.trainer === null
                          ? isPersonal
                            ? 'Trainer not picked'
                            : 'No trainer assigned'
                          : `${session.trainer}${session.room ? ` · ${session.room}` : ''}`}
                      </span>
                    </span>

                    <span className="flex w-[104px] shrink-0 flex-col gap-[7px]">
                      <span
                        className={cn(
                          't-mono-sm',
                          session.filled === 0 ? 'text-muted' : 'text-sub',
                        )}
                      >
                        {isPersonal
                          ? session.filled === 1
                            ? '1 client'
                            : 'no client'
                          : `${session.filled} / ${session.capacity} seats`}
                      </span>
                      <Meter
                        value={session.filled}
                        total={session.capacity}
                        tone={cancelled ? 'neutral' : fillTone(session.filled, session.capacity)}
                      />
                    </span>

                    <span className="flex w-24 shrink-0">
                      <StatusPill tone={tone}>{session.statusDetail ?? session.status}</StatusPill>
                    </span>

                    <DemoButton
                      toast={`${session.action} · ${session.name}`}
                      label={session.action}
                      // The one session that needs a decision gets the only gold
                      // button in the list, so it is findable at a glance.
                      variant={session.status === 'Unassigned' ? 'gold' : 'raised'}
                      srSuffix={session.name}
                      className="t-pill h-8 shrink-0 rounded-2xl px-[15px]"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* --- Rail ------------------------------------------------------ */}

        <div className="flex flex-col gap-4">
          <Card className="gap-[14px] px-6 py-[22px]">
            <CardHeader title="Trainer load · this week" />
            <dl className="flex flex-col gap-4">
              {TRAINER_LOAD.map((trainer) => {
                // Narrowed into a local so `hours` stays non-null through the
                // JSX below, where a `!onLeave` guard would not carry.
                const hours = trainer.hours;
                const onLeave = hours === null;
                const over = hours !== null && hours > trainer.capHours;

                return (
                  <div key={trainer.name} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-[10px]">
                      <dt className="t-sm text-sub">{trainer.name}</dt>
                      <dd
                        className={cn(
                          't-mono-sm',
                          onLeave ? 'text-muted' : over ? 'text-warn' : 'text-sub',
                        )}
                      >
                        {hours === null ? 'on leave' : `${hours} h`}
                      </dd>
                    </div>
                    <Meter
                      // A trainer over their cap still fills the bar, not more:
                      // the warn colour carries the overage, and a bar that
                      // overflowed its track would just look like a bug.
                      value={hours === null ? 0 : Math.min(hours, trainer.capHours)}
                      total={trainer.capHours}
                      tone={onLeave ? 'neutral' : over ? 'warn' : 'gold'}
                      height={5}
                    />
                  </div>
                );
              })}
            </dl>
            <p className="t-mono-xs text-warn leading-[1.6]">{TRAINER_LOAD_NOTE}</p>
          </Card>

          <Card className="gap-[14px] px-6 py-[22px]">
            <CardHeader title="Room utilisation" />
            <dl className="flex flex-col">
              {ROOMS.map((room) => {
                const share = ratio(room.booked, room.slots);
                const pressured = share >= ROOM_PRESSURE_THRESHOLD;

                return (
                  <div
                    key={room.name}
                    className="ow-divide flex items-center justify-between gap-3 py-[9px]"
                  >
                    <dt className="flex flex-col gap-1">
                      <span className="t-sm">{room.name}</span>
                      <span className="t-mono-2xs text-muted">
                        {room.booked} of {room.slots} slots booked
                      </span>
                    </dt>
                    <dd
                      className={cn(
                        't-display text-[22px]',
                        pressured ? TONE_TEXT.warn : share >= 0.7 ? TONE_TEXT.gold : 'text-ink',
                      )}
                    >
                      {percent(share)}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </Card>

          <Card className="bg-gold-soft border-gold-soft gap-[10px] px-6 py-5 shadow-none">
            <p className="t-eyebrow text-gold">Waitlist</p>
            <p className="t-display text-[30px]">{WAITLIST.people} people</p>
            <p className="t-mono-sm text-sub leading-[1.6]">{WAITLIST.note}</p>
            <DemoButton
              toast={WAITLIST.action}
              variant="raised"
              className="t-pill bg-surface mt-1 h-9 w-full rounded-[18px]"
              label="Duplicate slot"
            />
          </Card>
        </div>
      </div>

      {/* The day summary is announced but not drawn: the week strip already
          shows the count, and repeating it under the table is noise. */}
      <p className="sr-only" aria-live="polite">
        {summary
          ? `${day} ${summary.date}: ${summary.sessions === 0 ? 'closed' : `${sessions.length} ${view === 'Group' ? 'group classes' : 'PT sessions'}`}`
          : ''}
      </p>
    </div>
  );
}
