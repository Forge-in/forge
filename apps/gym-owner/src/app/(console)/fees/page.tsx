import type { Metadata } from 'next';
import { DemoButton } from '@/components/console/demo-button';
import { FeeBucketTabs, FeeTable, RemindAllButton } from '@/components/screens/fees/fee-table';
import { Card } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { FEE_SUMMARY } from '@/lib/data';
import { rupees } from '@/lib/format';
import { parseFeeBucket } from '@/lib/search-params';
import { TONE_BORDER, TONE_TEXT } from '@/lib/tone';

export const metadata: Metadata = { title: 'Fees & dues' };

export default async function FeesPage({ searchParams }: PageProps<'/fees'>) {
  const bucket = parseFeeBucket(await searchParams);

  return (
    <div className="flex flex-col gap-[18px]">
      <section aria-label="Dues summary" className="grid grid-cols-4 gap-4">
        {FEE_SUMMARY.map((stat) => (
          <Card
            key={stat.label}
            size="tile"
            className={cn('gap-[13px] px-[22px] py-5', TONE_BORDER[stat.tone])}
          >
            <p className="t-eyebrow">{stat.label}</p>
            <p className={cn('t-display text-[34px]', TONE_TEXT[stat.tone])}>
              {rupees(stat.amount)}
            </p>
            <p className="t-mono-sm text-sub">{stat.sub}</p>
          </Card>
        ))}
      </section>

      <Card className="overflow-hidden">
        <div className="ow-divide-b flex items-center justify-between gap-4 px-[26px] py-5">
          <FeeBucketTabs active={bucket} />
          <div className="flex items-center gap-[10px]">
            <RemindAllButton bucket={bucket} />
            <DemoButton
              toast="Dues sheet exported"
              variant="raised"
              className="t-pill bg-surface h-9 rounded-[18px] px-[18px]"
              label="Export"
            />
          </div>
        </div>

        <FeeTable bucket={bucket} />
      </Card>
    </div>
  );
}
