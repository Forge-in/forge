'use client';

import { useDemoAction } from '@/components/console/owner-provider';
import { useUrlFilter } from '@/components/console/url-filter';
import { Action, SegmentedControl } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { CURRENT_DAY, WEEK, type ClassView } from '@/lib/data';

/**
 * The week strip.
 *
 * `aria-pressed` rather than `aria-current`: these pick which day to look at,
 * they do not say which day it is. The genuinely-current day is marked in the
 * accessible name so a keyboard user can still find today in a row of seven
 * near-identical buttons.
 */
export function WeekPicker({ day }: { day: string }) {
  const setFilter = useUrlFilter();

  return (
    <div role="group" aria-label="Pick a day" className="flex items-center gap-2">
      {WEEK.map((entry) => {
        const active = entry.day === day;
        const closed = entry.sessions === 0;

        return (
          <button
            key={entry.day}
            type="button"
            aria-pressed={active}
            aria-label={`${entry.day} ${entry.date}${entry.day === CURRENT_DAY ? ', today' : ''} — ${
              closed ? 'closed' : `${entry.sessions} classes`
            }`}
            onClick={() => setFilter('day', entry.day === CURRENT_DAY ? null : entry.day)}
            className={cn(
              'ow-hoverable flex h-[66px] w-[62px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[20px] border',
              active ? 'bg-gold-soft border-gold' : 'bg-surface border-line',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('t-tag-xs tracking-[0.12em]', active ? 'text-gold' : 'text-muted')}
            >
              {entry.day}
            </span>
            <span
              aria-hidden="true"
              className={cn('t-display text-[22px]', active ? 'text-gold' : 'text-ink')}
            >
              {entry.date}
            </span>
            <span
              aria-hidden="true"
              className={cn('t-mono-3xs', active ? 'text-gold' : 'text-muted')}
            >
              {closed ? 'closed' : `${entry.sessions} cls`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const VIEW_OPTIONS = [
  { value: 'Group' as const, label: 'Group classes' },
  { value: 'Personal' as const, label: 'PT sessions' },
];

export function ClassViewSwitch({ view }: { view: ClassView }) {
  const setFilter = useUrlFilter();

  return (
    <SegmentedControl
      label="Session type"
      options={VIEW_OPTIONS}
      value={view}
      onChange={(next) => setFilter('view', next === 'Group' ? null : next)}
    />
  );
}

/** "New class" / "Book PT" — the label follows whichever view is showing. */
export function NewSessionButton({
  view,
  variant = 'raised',
  label,
  className,
}: {
  view: ClassView;
  variant?: 'raised' | 'gold' | undefined;
  /** Overrides the view-derived label — the empty state says "Add session". */
  label?: string | undefined;
  className?: string | undefined;
}) {
  const notify = useDemoAction();
  const group = view === 'Group';

  return (
    <Action
      variant={variant}
      // Composed rather than left to the accessible-name algorithm, which trims
      // each text node and would announce "+New class".
      aria-label={label ?? (group ? 'New class' : 'Book PT')}
      onClick={() =>
        notify(
          group
            ? 'New class slot · pick trainer, room and capacity'
            : 'New PT session · pick member and trainer',
        )
      }
      className={cn('t-sm h-10 rounded-[20px] px-5 font-medium', className)}
    >
      <span aria-hidden="true" className="font-mono text-[13px] leading-none">
        +
      </span>
      {label ?? (group ? 'New class' : 'Book PT')}
    </Action>
  );
}
