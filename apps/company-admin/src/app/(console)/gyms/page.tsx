import type { Metadata } from 'next';
import { GymFilters } from '@/components/console/gym-filters';
import { PendingInvites } from '@/components/console/pending-invites';
import { StatusBadge } from '@/components/ui/primitives';
import {
  Cell,
  DataTable,
  EmptyRow,
  HeadCell,
  TableBody,
  TableHead,
  TableRowLink,
} from '@/components/ui/table';
import { GYMS } from '@/lib/data';
import { formatCount, formatMoney } from '@/lib/format';
import { filterGyms, seatLabel } from '@/lib/metrics';
import { parseGymFilters } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Gyms' };

/** Column widths are shared by the header and the rows so they stay aligned. */
const COLUMNS = {
  org: 'flex-[2.6] min-w-[180px]',
  plan: 'flex-1 min-w-[80px]',
  sites: 'w-[70px] shrink-0',
  members: 'w-[90px] shrink-0',
  seats: 'w-[90px] shrink-0',
  mrr: 'w-[110px] shrink-0',
  status: 'w-[110px] shrink-0',
} as const;

export default async function GymsPage({ searchParams }: PageProps<'/gyms'>) {
  const filters = parseGymFilters(await searchParams);
  const rows = filterGyms(filters);

  return (
    <div className="flex flex-col gap-5 px-8 pt-[26px] pb-12">
      <GymFilters filters={filters} countLabel={`${rows.length} of ${GYMS.length}`} />

      <DataTable label="Registered organisations" className="wc-card min-w-[980px]">
        <TableHead className="gap-4 px-[22px] py-3">
          <HeadCell className={COLUMNS.org}>Organisation</HeadCell>
          <HeadCell className={COLUMNS.plan}>Plan</HeadCell>
          <HeadCell className={COLUMNS.sites}>Sites</HeadCell>
          <HeadCell className={COLUMNS.members}>Members</HeadCell>
          <HeadCell className={COLUMNS.seats}>Seats</HeadCell>
          <HeadCell className={COLUMNS.mrr}>MRR</HeadCell>
          <HeadCell className={COLUMNS.status}>Status</HeadCell>
        </TableHead>

        <TableBody>
          {rows.length === 0 ? (
            <EmptyRow className="px-[22px]">
              No organisation matches these filters. Clear the plan or status chips, or search for
              something else.
            </EmptyRow>
          ) : (
            rows.map((gym) => (
              <TableRowLink
                key={gym.id}
                href={`/gyms/${gym.id}`}
                className="gap-4 px-[22px] py-[15px] text-[13.5px]"
              >
                <Cell className={`${COLUMNS.org} flex items-center gap-[13px]`}>
                  <span aria-hidden="true" className="bg-line size-7 shrink-0" />
                  <span className="flex min-w-0 flex-col gap-[2px]">
                    <span className="truncate">{gym.name}</span>
                    <span className="t-mono-xs text-muted">{gym.city}</span>
                  </span>
                </Cell>
                <Cell className={`${COLUMNS.plan} text-sub`}>{gym.plan}</Cell>
                <Cell className={`${COLUMNS.sites} text-sub`}>{gym.sites}</Cell>
                <Cell className={`${COLUMNS.members} text-sub`}>{formatCount(gym.members)}</Cell>
                <Cell className={`${COLUMNS.seats} text-sub`}>{seatLabel(gym)}</Cell>
                <Cell className={`${COLUMNS.mrr} text-sub`}>{formatMoney(gym.mrr)}</Cell>
                <Cell className={COLUMNS.status}>
                  <StatusBadge status={gym.status} />
                </Cell>
              </TableRowLink>
            ))
          )}
        </TableBody>
      </DataTable>

      <PendingInvites />
    </div>
  );
}
