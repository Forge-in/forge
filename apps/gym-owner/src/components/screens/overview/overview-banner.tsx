'use client';

import { Action } from '@/components/ui/controls';
import { Dot } from '@/components/ui/primitives';
import { useDemoAction } from '@/components/console/owner-provider';
import { TOP_BANNER } from '@/lib/data';

/**
 * The single alert that outranks the whole dashboard.
 *
 * `role="alert"` would interrupt on every navigation back to the overview,
 * which is the wrong volume for a standing condition — this is a region the
 * owner can find, not a thing that shouts. `role="region"` with a label puts it
 * in the landmark list instead.
 */
export function OverviewBanner() {
  const notify = useDemoAction();

  // Nothing on fire is the common case, and a banner that is always there is a
  // banner nobody reads.
  //
  // Copied to a local const first: TypeScript will not carry a narrowing on an
  // imported binding into the click handler below, because the module could in
  // principle reassign it between render and click.
  const banner = TOP_BANNER;
  if (!banner) return null;

  return (
    <section
      aria-label="Needs immediate attention"
      className="bg-warn-soft border-warn flex items-center justify-between gap-4 rounded-[20px] border px-5 py-[15px]"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-[13px]">
        <Dot tone="warn" size={8} />
        <p className="t-body font-medium">{banner.title}</p>
        <p className="t-mono text-sub">{banner.sub}</p>
      </div>
      <Action
        variant="raised"
        onClick={() => notify(banner.toast)}
        className="t-pill bg-surface h-[34px] shrink-0 rounded-[17px] px-4"
      >
        {banner.cta}
      </Action>
    </section>
  );
}
