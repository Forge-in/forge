'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { v1 } from '@forge/shared';
import { useTheme } from '@/components/theme/theme-provider';
import { WrathMark } from '@/components/ui/wrath-mark';
import { cn } from '@/lib/cn';
import { INVOICES } from '@/lib/data';
import { initials } from '@/lib/format';
import { platformMetrics } from '@/lib/metrics';
import { NAV_ITEMS, sectionFromPathname, type NavCounter } from '@/lib/navigation';
import { THEMES, type Theme } from '@/lib/theme';
import { signOut } from '@/app/login/actions';
import { useConsole } from './console-provider';

const ORG_LABEL = 'WRATH CORE';

function counterValue(counter: NavCounter | undefined, gymCount: number): string {
  if (counter === 'gyms') return String(gymCount);
  if (counter === 'invoices') return String(INVOICES.length);
  return '';
}

/**
 * The verified administrator, passed down from the console layout.
 *
 * A prop rather than a client-side fetch: this is a client component, and anything it could
 * fetch for itself would have to be reachable from the browser — which the console session
 * deliberately is not. The layout has already verified it server-side.
 */
export function Sidebar({ admin }: { admin: v1.AdminIdentity }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { openInvite } = useConsole();

  const current = sectionFromPathname(pathname);
  const { gymCount } = platformMetrics();

  return (
    <div className="w-sidebar hairline-r flex shrink-0 flex-col justify-between pt-[26px] pb-5">
      <div className="flex min-h-0 flex-col gap-[30px] overflow-y-auto">
        <Link href="/overview" className="flex items-center gap-3 px-6">
          <WrathMark size={24} strokeWidth={8} />
          <span className="t-brand-sm text-ink">{ORG_LABEL}</span>
        </Link>

        <nav aria-label="Console sections" className="flex flex-col">
          {NAV_ITEMS.map((item) => {
            const active = current === item.section;
            const count = counterValue(item.counter, gymCount);

            return (
              <Link
                key={item.section}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'ease-wc flex items-center justify-between border-l-2 px-6 py-[11px] transition-colors duration-[140ms]',
                  active
                    ? 'border-l-accent bg-surface'
                    : 'hover:bg-surface/60 border-l-transparent',
                )}
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={cn('wc-dot', active ? 'bg-ink' : 'bg-line-strong')}
                  />
                  <span className={cn('text-[13.5px]', active ? 'text-ink' : 'text-sub')}>
                    {item.label}
                  </span>
                </span>
                {count ? <span className="t-mono-2xs text-dim">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-4 px-6">
        <button
          type="button"
          onClick={openInvite}
          className="hairline wc-hoverable t-pill text-sub flex cursor-pointer items-center justify-center gap-2 py-[11px]"
        >
          + Invite owner
        </button>

        <div className="flex items-center justify-between gap-[10px]">
          <span id="appearance-label" className="t-colhead">
            Appearance
          </span>
          <div role="group" aria-labelledby="appearance-label" className="hairline flex">
            {THEMES.map((option: Theme) => {
              const selected = theme === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTheme(option)}
                  className={cn(
                    't-toggle cursor-pointer px-[9px] py-[6px] capitalize',
                    selected ? 'bg-ink text-canvas' : 'text-sub bg-transparent',
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hairline-t flex items-center gap-3 pt-4">
          <span className="wc-avatar size-[30px] rounded-full text-[11px]">
            {/* An administrator may have no name recorded — the seed CLI takes one
                optionally and an invite never asks. Falling back to the phone keeps the
                avatar meaningful instead of rendering an empty circle. */}
            {initials(admin.fullName ?? admin.phone)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[12.5px]">{admin.fullName ?? admin.phone}</span>
            <span className="t-mono-2xs text-muted">Platform admin</span>
          </span>
          {/* A form, not an onClick: signing out is a server action that has to revoke the
              token API-side and clear an httpOnly cookie, neither of which a client handler
              can do. */}
          <form action={signOut}>
            <button type="submit" className="t-mono-2xs text-muted wc-hoverable cursor-pointer">
              Exit
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
