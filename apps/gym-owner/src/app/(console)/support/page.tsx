import type { Metadata } from 'next';
import { DemoButton } from '@/components/console/demo-button';
import { TicketForm, TicketList } from '@/components/screens/support/ticket-form';
import { Card, CardHeader, Eyebrow } from '@/components/ui/primitives';
import { SHIPPED_FROM_REPORTS, SUPPORT_FACTS } from '@/lib/data';

export const metadata: Metadata = { title: 'Report an issue' };

/**
 * The support screen.
 *
 * The "Shipped from your reports" card is the reason anyone files a second
 * report: it shows that the last three went somewhere. Without it the form is a
 * suggestion box.
 */
export default function SupportPage() {
  return (
    <div className="grid grid-cols-[1fr_340px] gap-4">
      <div className="flex flex-col gap-4">
        <Card className="px-[26px] py-6">
          <TicketForm />
        </Card>

        <Card className="overflow-hidden">
          <TicketList />
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card tone="gold" className="border-gold-soft gap-[14px] px-6 py-[22px]">
          <Eyebrow className="text-gold">Your support level</Eyebrow>
          <p className="t-display text-[30px] leading-none">Priority · Pro</p>

          <dl className="flex flex-col">
            {SUPPORT_FACTS.map((fact) => (
              <div
                key={fact.label}
                className="ow-divide flex items-center justify-between gap-3 py-[9px]"
              >
                <dt className="t-mono-sm text-muted">{fact.label}</dt>
                <dd className="t-sm font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>

          <DemoButton
            toast="Call back requested · someone rings you within the hour"
            variant="raised"
            className="t-pill h-[38px] w-full rounded-[19px]"
            label="Request a call back"
          />
        </Card>

        <Card className="gap-3 px-6 py-[22px] shadow-none">
          <CardHeader title="Shipped from your reports" />
          <ul>
            {SHIPPED_FROM_REPORTS.map((item) => (
              <li key={item.label} className="ow-divide flex items-start gap-[11px] py-[9px]">
                <span aria-hidden="true" className="t-mono-xs text-gold pt-0.5">
                  ✓
                </span>
                <span className="flex flex-col gap-1">
                  <span className="t-sm">{item.label}</span>
                  <span className="t-mono-2xs text-muted">{item.meta}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
