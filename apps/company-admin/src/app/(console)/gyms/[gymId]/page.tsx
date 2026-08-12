import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GymDetailHeader } from '@/components/console/gym-detail-header';
import { ActionLink } from '@/components/ui/controls';
import {
  Card,
  CardHeader,
  CardNote,
  EmptyState,
  MetricCell,
  StatusBadge,
} from '@/components/ui/primitives';
import { GYMS, findGym, sitesForGym } from '@/lib/data';
import { formatCount, formatMoney, initials } from '@/lib/format';
import { invoicesForGym, seatLabel } from '@/lib/metrics';

/** The directory is small and fully known at build time, so pre-render it all. */
export function generateStaticParams() {
  return GYMS.map((gym) => ({ gymId: gym.id }));
}

export async function generateMetadata({ params }: PageProps<'/gyms/[gymId]'>): Promise<Metadata> {
  const { gymId } = await params;
  const gym = findGym(gymId);
  return { title: gym?.name ?? 'Organisation' };
}

export default async function GymDetailPage({ params }: PageProps<'/gyms/[gymId]'>) {
  const { gymId } = await params;
  const gym = findGym(gymId);

  // A stale bookmark or a hand-typed id must not render an empty shell.
  if (!gym) notFound();

  const sites = sitesForGym(gym.id, gym.sites);
  const invoices = invoicesForGym(gym);

  return (
    <div className="flex flex-col gap-6 px-8 pt-[26px] pb-12">
      <ActionLink href="/gyms" className="t-tag text-sub self-start">
        ← All gyms
      </ActionLink>

      <GymDetailHeader gym={gym} />

      <div className="flex flex-wrap">
        <MetricCell
          first
          label="Members"
          value={formatCount(gym.members)}
          valueClassName="t-display"
        />
        <MetricCell label="Sites" value={gym.sites} />
        <MetricCell label="Staff seats" value={seatLabel(gym)} />
        <MetricCell label="MRR" value={formatMoney(gym.mrr)} />
        <MetricCell last label="Health" value={`${gym.health} / 100`} />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card className="min-w-[300px] flex-1 gap-[18px] p-6">
          <h2 className="t-section">Owner</h2>

          <div className="flex items-center gap-[14px]">
            <span className="wc-avatar size-[42px] rounded-full text-[13px]">
              {initials(gym.owner)}
            </span>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="t-lg">{gym.owner}</span>
              <span className="t-mono-sm text-muted truncate">{gym.email}</span>
            </div>
          </div>

          <dl className="flex flex-col pt-[6px]">
            {[
              { label: 'Last sign-in', value: gym.lastSeen },
              { label: 'Owner app', value: gym.app },
              { label: 'Trainers on staff', value: gym.trainers },
            ].map((row) => (
              <div
                key={row.label}
                className="hairline-t t-base flex justify-between gap-4 py-[11px]"
              >
                <dt className="text-sub">{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card className="min-w-[340px] flex-[1.4] p-6">
          <CardHeader title="Sites" action={<CardNote>{gym.sites} locations</CardNote>} />
          {sites.length === 0 ? (
            <EmptyState>No sites on this account yet.</EmptyState>
          ) : (
            sites.map((site) => (
              <div
                key={site.name}
                className="hairline-b flex flex-wrap items-center gap-4 py-[14px]"
              >
                <span className="flex-[1.4] text-[13.5px]">{site.name}</span>
                <span className="t-mono-sm text-muted flex-1">
                  {formatCount(site.members)} members
                </span>
                <span className="t-mono-sm text-muted flex-1">{site.checkInsToday} today</span>
                <span className="t-action text-sub">{site.state}</span>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card className="p-6">
        <CardHeader
          title="Billing history"
          action={
            <ActionLink href="/billing" className="t-action">
              All invoices
            </ActionLink>
          }
        />
        {invoices.map((invoice) => (
          <div key={invoice.id} className="hairline-b flex items-center py-[14px] text-[13.5px]">
            <span className="t-mono-lg text-sub flex-1">{invoice.id}</span>
            <span className="flex-[1.4]">{invoice.period}</span>
            <span className="text-sub flex-1">{invoice.amount}</span>
            <span className="t-mono-sm text-muted flex-1">{invoice.method}</span>
            <StatusBadge status={invoice.status} className="w-[100px]" />
          </div>
        ))}
      </Card>
    </div>
  );
}
