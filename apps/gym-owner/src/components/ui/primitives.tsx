import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/data/types';
import { initials as toInitials, meterWidth } from '@/lib/format';
import { TONE_DOT, TONE_FILL, TONE_PILL, TONE_TEXT } from '@/lib/tone';

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

type CardProps = React.ComponentPropsWithoutRef<'section'> & {
  /** Raises the border to carry a state — a warn card, a current-plan card. */
  tone?: Tone | undefined;
  /** KPI tiles use the tighter 24px radius. */
  size?: 'tile' | 'card' | undefined;
};

export function Card({ tone, size = 'card', className, ...rest }: CardProps) {
  return (
    <section
      className={cn(
        size === 'tile' ? 'ow-tile' : 'ow-card',
        tone === 'warn' && 'ow-card-warn',
        tone === 'gold' && 'ow-card-gold',
        'flex flex-col',
        className,
      )}
      {...rest}
    />
  );
}

/** A card header with an optional action on the right. */
export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h2 className="t-section">{title}</h2>
      {action}
    </div>
  );
}

/** Muted mono note used as a card's right-hand annotation. */
export function CardNote({ className, ...rest }: React.ComponentPropsWithoutRef<'span'>) {
  return <span className={cn('t-mono-sm text-muted', className)} {...rest} />;
}

/**
 * The header strip on a card whose body is a full-bleed table — a hairline
 * across the whole card rather than inset padding.
 */
export function PanelHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        'ow-divide-b flex shrink-0 items-center justify-between gap-4 px-[26px] py-5',
        className,
      )}
    >
      <h2 className="t-section">{title}</h2>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Labels and badges                                                          */
/* -------------------------------------------------------------------------- */

export function Eyebrow({ className, ...rest }: React.ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('t-eyebrow', className)} {...rest} />;
}

/**
 * A status badge.
 *
 * A `<span>`, not a button: it reports state and is never actionable, and
 * making it focusable would put every table row's status in the tab order.
 */
export function StatusPill({
  tone = 'neutral',
  size = 'md',
  className,
  ...rest
}: React.ComponentPropsWithoutRef<'span'> & {
  tone?: Tone | undefined;
  size?: 'sm' | 'md' | undefined;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[11px] whitespace-nowrap',
        size === 'sm' ? 't-tag-xs px-[9px] py-[3px]' : 't-tag px-[11px] py-[5px]',
        TONE_PILL[tone],
        className,
      )}
      {...rest}
    />
  );
}

/** A small delta badge, e.g. "+12.1%" or "Action". */
export function DeltaPill({
  tone = 'ok',
  className,
  ...rest
}: React.ComponentPropsWithoutRef<'span'> & { tone?: Tone | undefined }) {
  return (
    <span
      className={cn(
        't-mono-2xs shrink-0 rounded-[9px] px-2 py-[3px] whitespace-nowrap',
        TONE_PILL[tone],
        className,
      )}
      {...rest}
    />
  );
}

/** Legend square / status dot. Decorative — the label beside it carries meaning. */
export function Dot({
  tone = 'gold',
  pulse = false,
  size = 8,
  square = false,
  className,
}: {
  tone?: Tone | undefined;
  pulse?: boolean | undefined;
  size?: number | undefined;
  square?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cn(
        'shrink-0',
        square ? 'rounded-[3px]' : 'rounded-full',
        TONE_DOT[tone],
        pulse && 'ow-pulse',
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Initials bubble.
 *
 * `aria-hidden`, always: every call site renders the person's full name beside
 * it, and announcing "A S" before "Aarav Shah" is noise in a table of twelve.
 */
export function Avatar({
  name,
  size = 36,
  ring = false,
  className,
}: {
  name: string;
  size?: number | undefined;
  /** Gold ring — marks a trainer with a paired app seat. */
  ring?: boolean | undefined;
  className?: string | undefined;
}) {
  const bubble = (
    <span
      aria-hidden="true"
      style={{ width: ring ? '100%' : size, height: ring ? '100%' : size, fontSize: size * 0.27 }}
      className={cn('ow-avatar shrink-0', ring && 'text-gold', className)}
    >
      {toInitials(name)}
    </span>
  );

  if (!ring) return bubble;

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="ow-ring flex shrink-0 rounded-full p-[1.5px]"
    >
      {bubble}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Meter                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A horizontal progress meter.
 *
 * `role="presentation"` because every use here sits directly beside a text
 * label that already states the value — "18 / 20 seats", "86%". A `progressbar`
 * role would make a screen reader read the same number twice per row.
 */
export function Meter({
  value,
  total,
  tone = 'gold',
  height = 4,
  className,
}: {
  value: number;
  total: number;
  tone?: Tone | undefined;
  height?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <div role="presentation" style={{ height }} className={cn('ow-meter w-full', className)}>
      <div
        style={{ width: meterWidth(value, total) }}
        className={cn('h-full rounded-full', TONE_FILL[tone])}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A KPI tile.
 *
 * The value is always Instrument Serif — that single serif numeral is what
 * makes a row of tiles read as a dashboard rather than as a table.
 */
export function MetricTile({
  label,
  value,
  sub,
  delta,
  tone = 'neutral',
  valueClassName = 'text-[38px]',
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode | undefined;
  delta?: React.ReactNode | undefined;
  tone?: Tone | undefined;
  valueClassName?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <>
      <div className={cn('flex items-center justify-between gap-[10px]', className)}>
        <Eyebrow>{label}</Eyebrow>
        {delta}
      </div>
      <p className={cn('t-display', valueClassName, TONE_TEXT[tone])}>{value}</p>
      {sub ? <p className="t-mono-sm text-sub">{sub}</p> : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty states                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Shown wherever a list can legitimately come back empty — a search that
 * matches nothing, a closed Sunday, a bucket with nothing outstanding.
 *
 * The glyph is decorative; the title says what happened and the body says what
 * to do about it.
 */
export function EmptyState({
  glyph,
  tone = 'neutral',
  title,
  body,
  action,
  className,
}: {
  glyph: string;
  tone?: Tone | undefined;
  title: React.ReactNode;
  body: React.ReactNode;
  action?: React.ReactNode | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-[13px] px-[26px] py-[70px]', className)}>
      <span
        aria-hidden="true"
        className={cn(
          't-display flex size-[54px] items-center justify-center rounded-full border text-[21px]',
          tone === 'gold' ? 'border-gold-soft text-gold' : 'border-line-strong text-muted',
        )}
      >
        {glyph}
      </span>
      <p className="t-section-lg text-center">{title}</p>
      <p className="t-mono text-muted max-w-[46ch] text-center">{body}</p>
      {action}
    </div>
  );
}
