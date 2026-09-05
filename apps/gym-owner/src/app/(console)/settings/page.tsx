import type { Metadata } from 'next';
import { DemoButton } from '@/components/console/demo-button';
import { DemoRowButton } from '@/components/console/demo-row-button';
import { GymProfileForm, OperatingRulesList } from '@/components/screens/settings/gym-profile-form';
import { Card, CardHeader } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { DATA_ACTIONS, OWNER_FACTS } from '@/lib/data';
import { ownerDisplayName, requireOwner } from '@/lib/dal';
import { initials } from '@/lib/format';

export const metadata: Metadata = { title: 'Gym profile' };

/**
 * "gym_owner" -> "Gym owner".
 *
 * The role comes from the verified session rather than being hard-coded, so it
 * arrives in the API's snake_case and has to be made readable. Showing the real
 * role matters here: a co-owner or manager must not be told they have the
 * owner's access.
 */
function roleLabel(role: string): string {
  const words = role.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Account settings.
 *
 * The owner card reads from the VERIFIED session rather than from the demo
 * dataset — this is the one screen where showing a placeholder name next to
 * "full access" would be actively misleading about whose account is open.
 */
export default async function SettingsPage() {
  const session = await requireOwner();
  const ownerName = ownerDisplayName(session);

  return (
    <div className="grid grid-cols-[1fr_340px] gap-4">
      <div className="flex flex-col gap-4">
        <Card className="px-[26px] py-6">
          <GymProfileForm />
        </Card>

        <Card className="px-[26px] py-6">
          <OperatingRulesList />
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card className="items-center gap-4 px-6 py-[22px]">
          <span aria-hidden="true" className="ow-ring flex size-[76px] rounded-full p-0.5">
            <span className="bg-raise text-gold flex size-full items-center justify-center rounded-full font-serif text-[26px]">
              {initials(ownerName)}
            </span>
          </span>

          <div className="flex flex-col items-center gap-1.5">
            <p className="t-section-lg">{ownerName}</p>
            <p className="t-mono-xs text-muted tracking-[0.14em] uppercase">
              {roleLabel(session.membership.role)} · full access
            </p>
          </div>

          <dl className="flex w-full flex-col gap-[10px]">
            {OWNER_FACTS.map((fact) => (
              <div
                key={fact.label}
                className="ow-divide flex items-center justify-between gap-3 py-[9px]"
              >
                <dt className="t-mono-xs text-muted">{fact.label}</dt>
                <dd
                  className={cn(
                    't-xs',
                    fact.tone === 'ok' ? 'text-ok' : fact.tone === 'sub' ? 'text-sub' : 'text-ink',
                  )}
                >
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          <DemoButton
            toast="Edit name, phone, email or password"
            variant="raised"
            className="t-pill h-[38px] w-full rounded-[19px]"
            label="Edit owner profile"
          />
        </Card>

        <Card className="gap-3 px-6 py-[22px] shadow-none">
          <CardHeader title="Data & access" />
          <ul>
            {DATA_ACTIONS.map((action) => (
              <li key={action.id} className="ow-divide">
                {/*
                  The whole row is the control, and its accessible name is the
                  label plus the consequence — "Deactivate this gym" alone does
                  not say that members lose access.
                */}
                <DemoRowButton
                  toast={action.toast}
                  label={action.label}
                  meta={action.meta}
                  destructive={action.destructive === true}
                />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
