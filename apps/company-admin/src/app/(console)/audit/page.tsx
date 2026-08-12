import type { Metadata } from 'next';
import { AuditFilters } from '@/components/console/audit-filters';
import { Cell, DataTable, EmptyRow, TableBody, TableRow } from '@/components/ui/table';
import { AUDIT } from '@/lib/data';
import { parseAuditKind } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Audit log' };

export default async function AuditPage({ searchParams }: PageProps<'/audit'>) {
  const kind = parseAuditKind(await searchParams);
  const entries = kind === 'All' ? AUDIT : AUDIT.filter((entry) => entry.kind === kind);

  return (
    <div className="flex flex-col gap-5 px-8 pt-[26px] pb-12">
      <AuditFilters active={kind} />

      <DataTable label="Audit log" className="wc-card min-w-[1000px]">
        <TableBody>
          {entries.length === 0 ? (
            <EmptyRow className="px-6">
              No {kind.toLowerCase()} events in the retained window.
            </EmptyRow>
          ) : (
            entries.map((entry) => (
              <TableRow key={entry.id} className="gap-5 px-6 py-[15px] text-[13.5px]">
                <Cell className="t-mono-sm text-muted w-[130px] shrink-0">{entry.time}</Cell>
                <Cell className="t-action text-sub w-[110px] shrink-0">{entry.kind}</Cell>
                <Cell className="flex-1">{entry.text}</Cell>
                <Cell className="t-mono-sm text-muted w-[150px] shrink-0">{entry.actor}</Cell>
                <Cell className="t-mono-sm text-dim w-[120px] shrink-0">{entry.ip}</Cell>
              </TableRow>
            ))
          )}
        </TableBody>
      </DataTable>
    </div>
  );
}
