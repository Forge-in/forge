import { cn } from '@/lib/cn';
import type { MrrBar } from '@/lib/metrics';

/**
 * Twelve-month MRR column chart.
 *
 * Bars are sized as a percentage of the tallest month, so the shape stays honest
 * no matter the absolute numbers. The most recent month is drawn in the accent
 * colour — it is the only coloured mark on the screen, which is what makes it
 * read as "now".
 *
 * Bars and labels are two rows sharing one gap value rather than one column per
 * month. Percentage heights then resolve against the plot area alone: with the
 * labels inside the same box, a 100% bar plus its label overflows the chart's
 * height and the tallest month rides up over the card's heading.
 */
export function MrrChart({
  bars,
  className,
  gapClassName = 'gap-[10px]',
}: {
  bars: MrrBar[];
  /** Sets the chart's overall height; the design uses 150px and 170px. */
  className?: string;
  gapClassName?: string;
}) {
  if (bars.length === 0) {
    return <p className="t-body text-muted">No revenue history yet.</p>;
  }

  return (
    <div
      role="img"
      aria-label={`Monthly recurring revenue over the last ${bars.length} months`}
      className={cn('flex flex-col gap-[9px]', className)}
    >
      <div className={cn('flex min-h-0 flex-1 items-end', gapClassName)}>
        {bars.map((bar, index) => (
          <div
            key={`bar-${bar.label}-${index}`}
            className={cn('flex-1', bar.current ? 'bg-accent' : 'bg-line')}
            style={{ height: `${bar.heightPercent}%` }}
          />
        ))}
      </div>

      <div className={cn('flex', gapClassName)}>
        {bars.map((bar, index) => (
          <span
            key={`label-${bar.label}-${index}`}
            className="t-mono-2xs text-dim flex-1 text-center"
          >
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}
