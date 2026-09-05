'use client';

import { useUrlFilter } from '@/components/console/url-filter';
import { FilterChip } from '@/components/ui/controls';
import { STAFF, STAFF_FILTERS, type StaffFilter } from '@/lib/data';

/**
 * Role filters, each carrying its own headcount.
 *
 * Counts are derived from the roll rather than written down, so a chip can
 * never claim three trainers while the grid below shows two — and "Manager (0)"
 * still renders, because a role with nobody in it is a fact the owner needs.
 */
export function RoleChips({ active }: { active: StaffFilter }) {
  return (
    <div
      role="group"
      aria-label="Filter staff by role"
      className="flex flex-wrap items-center gap-[9px]"
    >
      {STAFF_FILTERS.map((role) => (
        <RoleChip key={role} role={role} active={active === role} />
      ))}
    </div>
  );
}

function RoleChip({ role, active }: { role: StaffFilter; active: boolean }) {
  const setFilter = useUrlFilter();
  const headcount = role === 'All' ? STAFF.length : STAFF.filter((s) => s.group === role).length;

  return (
    <FilterChip
      active={active}
      label={role}
      count={String(headcount)}
      onClick={() => setFilter('role', role === 'All' ? null : role)}
      className="h-9 rounded-[18px] px-[17px]"
    />
  );
}
