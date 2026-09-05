'use client';

import { SegmentedControl } from '@/components/ui/controls';
import { ColumnChart } from '@/components/ui/charts';
import { useUrlFilter } from '@/components/console/url-filter';
import { REVENUE_SCOPES, type RevenueScope } from '@/lib/data';
import { chartBars, revenueSeries } from '@/lib/metrics';

const SCOPE_OPTIONS = REVENUE_SCOPES.map((scope) => ({ value: scope, label: scope }));

/**
 * The scope switch.
 *
 * A client component that writes to the URL rather than to local state, so the
 * server re-renders the chart for the new scope — and a link to
 * `/revenue?scope=Year` opens on the year, which is what gets pasted into a
 * message to an accountant.
 */
export function RevenueScopeSwitch({ scope }: { scope: RevenueScope }) {
  const setFilter = useUrlFilter();

  return (
    <SegmentedControl
      label="Revenue period"
      options={SCOPE_OPTIONS}
      value={scope}
      onChange={(next) => setFilter('scope', next === 'Month' ? null : next)}
      size="sm"
    />
  );
}

/**
 * The revenue columns.
 *
 * A server component: the whole series is known, so the bars are computed once
 * on the server and shipped as markup instead of sending seventeen numbers and
 * a layout pass to the browser.
 */
export function RevenueBars({
  scope,
  bodyHeight,
  radius = 7,
  gap = 5,
  className,
}: {
  scope: RevenueScope;
  bodyHeight: number;
  radius?: number | undefined;
  gap?: number | undefined;
  className?: string | undefined;
}) {
  const series = revenueSeries(scope);
  const bars = chartBars(series.values, series.labels, series.labelEvery);

  return (
    <ColumnChart
      bars={bars}
      bodyHeight={bodyHeight}
      radius={radius}
      gap={gap}
      className={className}
    />
  );
}
