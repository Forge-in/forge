import type { Metadata } from 'next';
import { ToastAction } from '@/components/console/toast-action';
import { Card } from '@/components/ui/primitives';
import { Cell, DataTable, HeadCell, TableBody, TableHead, TableRow } from '@/components/ui/table';
import { FEATURE_MATRIX, PLAN_TIERS } from '@/lib/data';

export const metadata: Metadata = { title: 'Plans' };

export default function PlansPage() {
  return (
    <div className="flex flex-col gap-6 px-8 pt-[26px] pb-12">
      <div className="flex flex-wrap gap-4">
        {PLAN_TIERS.map((tier) => (
          <Card
            key={tier.id}
            className={`min-w-[260px] flex-1 gap-5 p-[26px] ${
              tier.featured ? 'border-accent-deep' : 'border-line'
            }`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="t-plan-name">{tier.name}</h2>
              <span className="t-pill text-muted">{tier.tag}</span>
            </div>

            <p className="flex items-baseline gap-2">
              <span className="t-num-md">{tier.price}</span>
              <span className="t-mono-sm text-muted">/ site / month</span>
            </p>

            <dl className="flex flex-col">
              {tier.rows.map((row) => (
                <div
                  key={row.label}
                  className="hairline-t t-base flex justify-between gap-4 py-[11px]"
                >
                  <dt className="text-sub">{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>

            <ToastAction className="t-pill w-full justify-center py-[11px]">Edit plan</ToastAction>
          </Card>
        ))}
      </div>

      <DataTable label="Capability comparison by plan" className="wc-card">
        <TableHead className="px-6 py-[14px]">
          <HeadCell className="flex-[2]">Capability</HeadCell>
          <HeadCell className="flex-1">Studio</HeadCell>
          <HeadCell className="flex-1">Scale</HeadCell>
          <HeadCell className="flex-1">Enterprise</HeadCell>
        </TableHead>
        <TableBody>
          {FEATURE_MATRIX.map((feature) => (
            <TableRow key={feature.name} className="px-6 py-[14px] text-[13.5px]">
              <Cell className="flex-[2]">{feature.name}</Cell>
              <Cell className="text-sub flex-1">{feature.studio}</Cell>
              <Cell className="text-sub flex-1">{feature.scale}</Cell>
              <Cell className="text-sub flex-1">{feature.enterprise}</Cell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
    </div>
  );
}
