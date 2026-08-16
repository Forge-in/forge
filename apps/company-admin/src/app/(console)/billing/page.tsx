import type { Metadata } from 'next';
import { ToastAction } from '@/components/console/toast-action';
import { MetricCell, StatusBadge } from '@/components/ui/primitives';
import { Cell, DataTable, HeadCell, TableBody, TableHead, TableRow } from '@/components/ui/table';
import { INVOICES } from '@/lib/data';
import { formatMoney } from '@/lib/format';
import { platformMetrics } from '@/lib/metrics';

export const metadata: Metadata = { title: 'Billing' };

/** Rupees still outstanding across issued invoices. */
const OUTSTANDING = 70_000;
/** Revenue not yet collected this cycle (trials and pending mandates). */
const UNCOLLECTED = 22_000;

const COLUMNS = {
  invoice: 'w-[120px] shrink-0',
  org: 'flex-[2]',
  period: 'flex-1',
  amount: 'w-[110px] shrink-0',
  method: 'w-[130px] shrink-0',
  status: 'w-[110px] shrink-0',
} as const;

export default function BillingPage() {
  const { mrrTotal } = platformMetrics();

  return (
    <div className="flex flex-col gap-6 px-8 pt-[26px] pb-12">
      <div className="wc-card flex flex-wrap p-6">
        <MetricCell
          first
          inset="md"
          label="Collected this month"
          value={formatMoney(mrrTotal - UNCOLLECTED)}
          valueClassName="t-display-sm"
        />
        <MetricCell
          inset="md"
          label="Outstanding"
          value={formatMoney(OUTSTANDING)}
          valueClassName="t-num-sm"
        />
        <MetricCell
          inset="md"
          label="Invoices issued"
          value={INVOICES.length}
          valueClassName="t-num-sm"
        />
        <MetricCell
          last
          inset="md"
          label="Avg. days to pay"
          value="4.2"
          valueClassName="t-num-sm"
        />
      </div>

      <DataTable
        label="Invoices"
        className="wc-card min-w-[1040px]"
        toolbar={
          <div className="hairline-b flex items-center justify-between gap-4 px-6 py-[18px]">
            <h2 className="t-section">Invoices</h2>
            <div className="flex gap-[10px]">
              <ToastAction className="t-action px-[13px] py-[7px]">Export CSV</ToastAction>
              <ToastAction className="t-action px-[13px] py-[7px]">Run billing</ToastAction>
            </div>
          </div>
        }
      >
        <TableHead className="px-6 py-3">
          <HeadCell className={COLUMNS.invoice}>Invoice</HeadCell>
          <HeadCell className={COLUMNS.org}>Organisation</HeadCell>
          <HeadCell className={COLUMNS.period}>Period</HeadCell>
          <HeadCell className={COLUMNS.amount}>Amount</HeadCell>
          <HeadCell className={COLUMNS.method}>Method</HeadCell>
          <HeadCell className={COLUMNS.status}>Status</HeadCell>
        </TableHead>

        <TableBody>
          {INVOICES.map((invoice) => (
            <TableRow key={invoice.id} className="px-6 py-[15px] text-[13.5px]">
              <Cell className={`${COLUMNS.invoice} t-mono-lg text-sub`}>{invoice.id}</Cell>
              <Cell className={`${COLUMNS.org} truncate`}>{invoice.org}</Cell>
              <Cell className={`${COLUMNS.period} text-sub`}>{invoice.period}</Cell>
              <Cell className={`${COLUMNS.amount} text-sub`}>{invoice.amount}</Cell>
              <Cell className={`${COLUMNS.method} t-mono-sm text-muted`}>{invoice.method}</Cell>
              <Cell className={COLUMNS.status}>
                <StatusBadge status={invoice.status} />
              </Cell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
    </div>
  );
}
