'use client';

import { useId } from 'react';
import { FilterChip } from '@/components/ui/controls';
import { GYM_STATUSES, PLAN_NAMES } from '@/lib/data/types';
import { GYM_SORTS, GYM_SORT_LABELS, type GymFilters } from '@/lib/metrics';
import { useUrlFilter } from './url-filters';

const PLAN_OPTIONS = ['All', ...PLAN_NAMES] as const;
const STATUS_OPTIONS = ['All', ...GYM_STATUSES] as const;

/**
 * Plan and status chips plus the sort control. Every change is a URL change, so
 * the table below re-renders on the server with the new filters.
 */
export function GymFilters({ filters, countLabel }: { filters: GymFilters; countLabel: string }) {
  const setFilter = useUrlFilter();
  const sortId = useId();

  return (
    <div className="flex flex-wrap items-center justify-between gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter by plan" className="flex flex-wrap items-center gap-2">
          {PLAN_OPTIONS.map((plan) => (
            <FilterChip
              key={plan}
              active={filters.plan === plan}
              onClick={() => setFilter('plan', plan === 'All' ? null : plan)}
            >
              {plan}
            </FilterChip>
          ))}
        </div>

        <span aria-hidden="true" className="bg-line mx-[6px] h-[22px] w-[0.5px]" />

        <div
          role="group"
          aria-label="Filter by status"
          className="flex flex-wrap items-center gap-2"
        >
          {STATUS_OPTIONS.map((status) => (
            <FilterChip
              key={status}
              active={filters.status === status}
              onClick={() => setFilter('status', status === 'All' ? null : status)}
            >
              {status}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="t-mono-sm text-muted">{countLabel}</span>
        <label htmlFor={sortId} className="sr-only">
          Sort organisations
        </label>
        <select
          id={sortId}
          value={filters.sort}
          onChange={(event) => setFilter('sort', event.target.value)}
          className="wc-field text-sub w-auto px-3 py-2 text-[12.5px]"
        >
          {GYM_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {GYM_SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
