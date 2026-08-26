import { cn } from '@/lib/cn';
import type { Tone } from '@/lib/data/types';
import { ringGeometry, type ChartBar } from '@/lib/metrics';
import { TONE_FILL_V } from '@/lib/tone';

/* -------------------------------------------------------------------------- */
/* Column chart                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The console's one column chart — revenue by period, check-ins by hour.
 *
 * It is DECORATIVE by construction. Every figure it encodes is also printed as
 * text beside it (the total, the delta, the caption, the peak), so it is marked
 * `aria-hidden` and a screen reader is spared seventeen unlabelled bars. If a
 * chart ever carries information the surrounding text does not, it needs a
 * table alternative rather than an ARIA label per column.
 *
 * Heights are absolute pixels rather than percentages because the bars sit in a
 * flex column above their labels: a percentage would resolve against the
 * combined height and shrink every bar by the label's line box.
 */
export function ColumnChart({
  bars,
  bodyHeight,
  minHeight = 16,
  gap = 5,
  radius = 7,
  className,
}: {
  bars: readonly ChartBar[];
  /** Pixel height of the tallest possible bar. */
  bodyHeight: number;
  /** Floor for a non-zero bar, so a small value is still visibly a bar. */
  minHeight?: number | undefined;
  gap?: number | undefined;
  radius?: number | undefined;
  className?: string | undefined;
}) {
  return (
    <div aria-hidden="true" style={{ gap }} className={cn('flex items-end', className)}>
      {bars.map((bar) => (
        <div key={bar.key} className="flex min-w-0 flex-1 flex-col items-center gap-[9px]">
          <div
            style={{
              // A period with no data gets a 3px stub: zero height reads as a
              // missing bar, which is a different claim from "nothing yet".
              height: bar.empty ? 3 : Math.round(minHeight + bar.share * (bodyHeight - minHeight)),
              borderRadius: `${radius}px ${radius}px 3px 3px`,
            }}
            className={cn(
              'w-full',
              bar.empty
                ? 'bg-line'
                : bar.peak
                  ? 'ow-gold-fill-v shadow-[0_8px_22px_var(--ow-gold-glow)]'
                  : 'bg-line-strong',
            )}
          />
          <span className="t-mono-3xs text-muted h-3 leading-3 whitespace-nowrap">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Ring gauge                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A progress ring with content in the middle.
 *
 * Rotated -90° so the arc starts at twelve o'clock, and `pathLength` is left
 * alone in favour of a computed circumference — see `ringGeometry`, which also
 * clamps an over-capacity fraction that would otherwise draw backwards.
 *
 * The gradient id is passed in rather than generated: two rings on one page
 * with the same id would both resolve to whichever `<defs>` rendered first.
 */
export function RingGauge({
  size,
  radius,
  strokeWidth,
  fraction,
  gradientId,
  glow = false,
  children,
  className,
}: {
  size: number;
  radius: number;
  strokeWidth: number;
  fraction: number;
  gradientId?: string | undefined;
  glow?: boolean | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  const { dashArray, dashOffset } = ringGeometry(radius, fraction);
  const centre = size / 2;
  const stroke = gradientId ? `url(#${gradientId})` : 'var(--ow-gold)';

  return (
    <div style={{ width: size, height: size }} className={cn('relative', className)}>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${size} ${size}`}
        style={{
          width: size,
          height: size,
          transform: 'rotate(-90deg)',
          filter: glow ? 'drop-shadow(0 6px 18px var(--ow-gold-glow))' : undefined,
        }}
      >
        {gradientId ? (
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--ow-gold-lt)" />
              <stop offset="55%" stopColor="var(--ow-gold)" />
              <stop offset="100%" stopColor="var(--ow-gold-dk)" />
            </linearGradient>
          </defs>
        ) : null}
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke="var(--ow-line)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Heatmap                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Footfall intensity, 0-5. Index 0 is the card's own line colour so an empty
 * cell reads as absence rather than as a faint value.
 */
const RAMP = [
  'bg-line',
  'bg-[var(--ow-ramp-1)]',
  'bg-[var(--ow-ramp-2)]',
  'bg-[var(--ow-ramp-3)]',
  'bg-[var(--ow-ramp-4)]',
  'bg-gold',
] as const;

export function heatCellClass(level: number): string {
  const index = Math.min(Math.max(Math.round(level), 0), RAMP.length - 1);
  return RAMP[index] ?? RAMP[0];
}

/** The quiet → packed key that sits beside the heatmap. */
export function HeatLegend() {
  return (
    <div className="flex items-center gap-2">
      <span className="t-mono-2xs text-muted">quiet</span>
      <span
        aria-hidden="true"
        className="from-line-strong to-gold-lt h-[7px] w-14 rounded bg-gradient-to-r"
      />
      <span className="t-mono-2xs text-muted">packed</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline-style split bar                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A single bar divided into shares — payment mode on the revenue screen.
 *
 * Widths are percentages of the container, so a set of shares that does not
 * quite total 1 leaves a gap rather than overflowing. That is the honest
 * failure: an unaccounted-for slice should look unaccounted for.
 */
export function SplitBar({
  segments,
  className,
}: {
  segments: readonly { key: string; share: number; tone: Tone }[];
  className?: string | undefined;
}) {
  return (
    <div aria-hidden="true" className={cn('flex h-[10px] gap-[2px] overflow-hidden', className)}>
      {segments.map((segment, index) => (
        <span
          key={segment.key}
          style={{ width: `${segment.share * 100}%` }}
          className={cn(
            TONE_FILL_V[segment.tone],
            index === 0 && 'rounded-l-full',
            index === segments.length - 1 && 'rounded-r-full',
          )}
        />
      ))}
    </div>
  );
}
