'use client';

import { cn } from '@/lib/cn';
import { useDemoAction } from './owner-provider';

/**
 * A full-width row that is itself the control — the "Data & access" list.
 *
 * The accessible name is the label PLUS the consequence line, because
 * "Deactivate this gym" on its own does not say that members lose access and
 * the data is kept for ninety days. Someone hearing only the label would be one
 * Enter away from a decision they could not have understood.
 */
export function DemoRowButton({
  toast,
  label,
  meta,
  destructive = false,
}: {
  toast: string;
  label: string;
  meta: string;
  destructive?: boolean;
}) {
  const notify = useDemoAction();

  return (
    <button
      type="button"
      aria-label={`${label} — ${meta}`}
      onClick={() => notify(toast)}
      className="ow-hoverable flex w-full cursor-pointer items-center justify-between gap-3 py-3 text-left"
    >
      <span className="flex flex-col gap-1">
        <span className={cn('t-sm', destructive ? 'text-warn' : 'text-ink')}>{label}</span>
        <span className="t-mono-2xs text-muted">{meta}</span>
      </span>
      <span aria-hidden="true" className="t-mono-xl text-muted">
        ›
      </span>
    </button>
  );
}
