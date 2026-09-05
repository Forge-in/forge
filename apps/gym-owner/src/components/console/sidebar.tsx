'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { DUES_COUNT, ENTITLEMENTS, MEMBER_TOTAL, SUBSCRIPTION } from '@/lib/data';
import { count } from '@/lib/format';
import { NAV_GROUPS, sectionFromPathname, type NavCounter } from '@/lib/navigation';
import { Meter } from '@/components/ui/primitives';

/**
 * The console's fixed left rail: brand, grouped navigation, plan summary.
 *
 * A client component only because it needs `usePathname` to light the current
 * item. Everything it renders is static, so nothing about the session reaches
 * the browser through it.
 */

const BRAND = 'Wrath';
const BRAND_SUB = 'Owner console';

interface NavBadge {
  /** What the badge shows. */
  text: string;
  /** What it MEANS, spoken. "412" alone says nothing about what is counted. */
  description: string;
}

/**
 * Resolved here rather than baked into `NAV_GROUPS` so the counts come from the
 * data layer in one place, and a locked add-on reads as "Locked" rather than as
 * a number it does not have.
 */
function badgeFor(counter: NavCounter | undefined): NavBadge | null {
  switch (counter) {
    case 'members':
      return { text: count(MEMBER_TOTAL), description: `${count(MEMBER_TOTAL)} members` };
    case 'dues':
      return { text: String(DUES_COUNT), description: `${DUES_COUNT} with dues outstanding` };
    case 'trainerApp':
      return ENTITLEMENTS.trainerApp ? null : { text: 'Locked', description: 'not in your plan' };
    default:
      return null;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const current = sectionFromPathname(pathname);

  const seatShare = `${SUBSCRIPTION.seatsUsed} of ${SUBSCRIPTION.seatsTotal} trainer seats used`;

  return (
    <div className="w-sidebar bg-surface border-line relative z-2 flex h-full shrink-0 flex-col border-r">
      <Link
        href="/overview"
        className="flex items-center gap-3 px-6 pt-[26px] pb-[22px]"
        aria-label={`${BRAND} owner console — go to overview`}
      >
        <span aria-hidden="true" className="ow-ring flex size-10 shrink-0 rounded-full p-[1.5px]">
          <span className="bg-surface text-gold flex size-full items-center justify-center rounded-full font-serif text-[19px]">
            W
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[14.5px] font-semibold tracking-[0.02em]">{BRAND}</span>
          <span className="t-nav-group">{BRAND_SUB}</span>
        </span>
      </Link>

      <nav
        aria-label="Console sections"
        className="ow-no-scrollbar flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[14px] pt-1 pb-[10px]"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-[3px]">
            {/*
              A heading, not a plain span: it gives the list below it a real
              accessible name, so "Money" is announced before "Revenue" rather
              than the four groups reading as one flat run of eleven links.
            */}
            <h2 className="t-nav-group px-3 pt-1.5 pb-2">{group.label}</h2>

            {group.items.map((item) => {
              const active = current === item.section;
              const badge = badgeFor(item.counter);

              return (
                <Link
                  key={item.section}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  /*
                   * Composed, not left to the accessible-name algorithm. That
                   * algorithm trims each text node before joining them, so a
                   * "Members" label beside a "412" badge is announced as
                   * "Members412" — and the number is meaningless without the
                   * noun anyway.
                   */
                  aria-label={badge ? `${item.label}, ${badge.description}` : item.label}
                  className={cn(
                    'ease-ow flex h-[38px] items-center justify-between gap-2 rounded-xl px-3 transition-colors duration-[160ms]',
                    active ? 'bg-raise text-ink' : 'text-sub hover:bg-raise/60 hover:text-ink',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-[10px]">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'h-4 w-[3px] shrink-0 rounded-sm',
                        active ? 'bg-gold' : 'bg-transparent',
                      )}
                    />
                    <span aria-hidden="true" className="t-base truncate font-medium">
                      {item.label}
                    </span>
                  </span>

                  {badge ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        't-mono-xs flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-[10px] px-1.5',
                        active ? 'bg-gold-soft text-gold' : 'bg-raise text-muted',
                      )}
                    >
                      {badge.text}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-line border-t p-[14px]">
        <Link
          href="/plan"
          className="bg-raise border-gold-soft ow-hoverable flex flex-col gap-[10px] rounded-[18px] border px-[15px] py-[14px]"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="t-eyebrow text-gold">
              {ENTITLEMENTS.trainerApp ? 'Wrath Pro' : 'Wrath Core'}
            </span>
            <span aria-hidden="true" className="t-mono-lg text-muted">
              ›
            </span>
          </span>
          <span className="t-mono-sm text-sub">Renews {SUBSCRIPTION.renewsOn}</span>

          {/* Members used against the plan's ceiling — the number that actually
              forces an upgrade, and the one the owner cannot see anywhere else. */}
          <Meter value={SUBSCRIPTION.membersUsed} total={SUBSCRIPTION.membersAllowed} height={4} />

          <span className="t-mono-xs text-muted">
            {ENTITLEMENTS.trainerApp ? seatShare : 'Trainer mobile not included'}
          </span>
        </Link>
      </div>
    </div>
  );
}
