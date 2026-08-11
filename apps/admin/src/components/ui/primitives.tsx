import { cn } from '@/lib/cn';
import type { StatusLabel } from '@/lib/data/types';
import { statusDotClass } from '@/lib/status';

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The 5px square that carries status colour. Purely decorative — the label next
 * to it is what a screen reader reads.
 */
export function StatusDot({ status, className }: { status: StatusLabel; className?: string }) {
  return <span aria-hidden="true" className={cn('wc-dot', statusDotClass(status), className)} />;
}

export function StatusBadge({ status, className }: { status: StatusLabel; className?: string }) {
  return (
    <span className={cn('flex items-center gap-[9px]', className)}>
      <StatusDot status={status} />
      <span className="t-action text-sub">{status}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({ className, children, ...rest }: React.ComponentPropsWithoutRef<'section'>) {
  return (
    <section className={cn('wc-card flex flex-col', className)} {...rest}>
      {children}
    </section>
  );
}

/**
 * Card heading with an optional action on the right, separated by a hairline —
 * the pattern every list panel in the console uses.
 */
export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('hairline-b flex items-baseline justify-between gap-4 pb-4', className)}>
      <h2 className="t-section">{title}</h2>
      {action}
    </div>
  );
}

/** Muted mono note used as a card's right-hand annotation. */
export function CardNote({ children }: { children: React.ReactNode }) {
  return <span className="t-mono-sm text-muted">{children}</span>;
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Shown wherever a list can legitimately come back empty — a filter that matches
 * nothing, no outstanding invites, no failed payments.
 */
export function EmptyState({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn('t-body text-muted text-pretty py-6', className)}>{children}</p>;
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A KPI tile.
 *
 * Exactly one tile in a row gets a serif `t-display-*` value — that single
 * coloured numeral is what gives the row a focal point. The rest stay `t-num-*`.
 */
export function MetricCard({
  label,
  value,
  hint,
  valueClassName = 't-num-lg',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <Card className={cn('gap-3 px-6 py-[22px]', className)}>
      <p className="t-eyebrow">{label}</p>
      <p className={valueClassName}>{value}</p>
      {hint ? <p className="t-sm text-sub">{hint}</p> : null}
    </Card>
  );
}

/**
 * One cell of a hairline-divided metric strip (gym detail, billing summary).
 *
 * The outer edges of a strip sit flush with the container, so the first cell
 * drops its left inset and the last drops its right inset and its rule.
 */
export function MetricCell({
  label,
  value,
  valueClassName,
  inset = 'lg',
  first = false,
  last = false,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  /** 36px inside the gym detail strip, 32px inside the billing summary. */
  inset?: 'md' | 'lg';
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-[10px]',
        inset === 'lg' ? 'px-9' : 'px-8',
        first && 'pl-0',
        last && 'pr-0',
        !last && 'hairline-r',
      )}
    >
      <p className="t-eyebrow">{label}</p>
      <p className={cn('t-num', valueClassName)}>{value}</p>
    </div>
  );
}
