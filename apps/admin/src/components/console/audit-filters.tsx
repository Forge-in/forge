'use client';

import { FilterChip } from '@/components/ui/controls';
import { AUDIT_KINDS, type AuditKind } from '@/lib/data/types';
import { useUrlFilter } from './url-filters';

const OPTIONS = ['All', ...AUDIT_KINDS] as const;

export function AuditFilters({ active }: { active: AuditKind | 'All' }) {
  const setFilter = useUrlFilter();

  return (
    <div
      role="group"
      aria-label="Filter the audit log by event type"
      className="flex flex-wrap items-center gap-2"
    >
      {OPTIONS.map((kind) => (
        <FilterChip
          key={kind}
          active={active === kind}
          onClick={() => setFilter('kind', kind === 'All' ? null : kind)}
        >
          {kind}
        </FilterChip>
      ))}
    </div>
  );
}
