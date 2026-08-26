'use client';

import { useOwner, useDemoAction } from '@/components/console/owner-provider';
import { useUrlFilter } from '@/components/console/url-filter';
import { Action, SegmentedControl } from '@/components/ui/controls';
import { Avatar, EmptyState, StatusPill } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { FEE_BUCKETS, FEE_ROWS, type FeeBucket } from '@/lib/data';
import { rupees } from '@/lib/format';

const GRID = 'grid grid-cols-[2fr_1.3fr_1.3fr_1.2fr_210px] gap-4 px-[26px]';

/**
 * The dues bucket switch.
 *
 * Counts are baked into the labels because the choice between "chase the four
 * overdue" and "look at the two due this week" is made on those numbers — a
 * tab that has to be opened to reveal it is empty has wasted a click.
 */
export function FeeBucketTabs({ active }: { active: FeeBucket }) {
  const setFilter = useUrlFilter();

  return (
    <SegmentedControl
      label="Dues bucket"
      value={active}
      onChange={(next) => setFilter('bucket', next === 'Overdue' ? null : next)}
      options={FEE_BUCKETS.map((bucket) => ({
        value: bucket,
        label: `${bucket} (${FEE_ROWS[bucket].length})`,
      }))}
    />
  );
}

/**
 * The dues table.
 *
 * A client component, unlike the other tables in the console, because "already
 * reminded" is per-session state the owner builds up as they work down the
 * list — sending the same member three WhatsApp messages in a minute is the
 * failure this prevents.
 */
export function FeeTable({ bucket }: { bucket: FeeBucket }) {
  const { isReminded, remind } = useOwner();
  const notify = useDemoAction();

  const rows = FEE_ROWS[bucket];
  const overdue = bucket === 'Overdue';

  if (rows.length === 0) {
    return (
      <EmptyState
        glyph="✓"
        tone="gold"
        title="Nothing outstanding here"
        body="Every member in this bucket has paid. Reminders resume automatically."
      />
    );
  }

  return (
    <ul>
      {rows.map((row) => {
        const reminded = isReminded(row.id);

        return (
          <li key={row.id} className={cn(GRID, 'ow-divide-b items-center py-4')}>
            <span className="flex min-w-0 items-center gap-[13px]">
              <Avatar name={row.name} size={36} />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="t-base font-medium">{row.name}</span>
                <span className="t-mono-xs text-muted">{row.phone}</span>
              </span>
            </span>

            <span className="flex flex-col gap-[5px]">
              <span className={cn('t-md font-semibold', overdue ? 'text-warn' : 'text-ink')}>
                {rupees(row.amount)}
              </span>
              <span className="t-mono-xs text-muted">{row.amountMeta}</span>
            </span>

            <span className="flex flex-col gap-[5px]">
              <span className={cn('t-mono-md', overdue ? 'text-warn' : 'text-sub')}>
                {row.dueLabel}
              </span>
              <span className="t-mono-xs text-muted">{row.plan}</span>
            </span>

            <StatusPill tone={overdue ? 'warn' : 'neutral'} className="justify-self-start">
              {row.state}
            </StatusPill>

            <span className="flex items-center justify-end gap-[9px]">
              <Action
                variant="raised"
                // Disabled after sending rather than hidden: the button
                // disappearing would make the row jump under the cursor
                // half-way down a list someone is working through.
                disabled={reminded}
                // Set explicitly rather than composed from a visually hidden
                // span: the accessible-name algorithm trims each text node
                // before joining, so "Remind" beside " — Priya Nair" is
                // announced as "Remind— Priya Nair".
                aria-label={`${reminded ? 'Reminded' : 'Remind'} — ${row.name}`}
                onClick={() => remind(row.id, row.name)}
                className={cn('t-pill h-8 rounded-2xl px-[15px]', reminded && 'text-muted')}
              >
                {reminded ? 'Reminded' : 'Remind'}
              </Action>
              <Action
                variant="gold"
                aria-label={`Collect — ${row.name}`}
                onClick={() =>
                  notify(`Collect ${rupees(row.amount)} from ${row.name} — cash, UPI or card`)
                }
                className="h-8 rounded-2xl px-[15px] text-[11px]"
              >
                Collect
              </Action>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "Remind all" for the visible bucket. */
export function RemindAllButton({ bucket }: { bucket: FeeBucket }) {
  const { remindAll } = useOwner();
  const rows = FEE_ROWS[bucket];

  return (
    <Action
      variant="raised"
      onClick={() => remindAll(rows)}
      disabled={rows.length === 0}
      className="t-pill bg-surface h-9 rounded-[18px] px-[18px]"
    >
      Remind all ({rows.length})
    </Action>
  );
}
