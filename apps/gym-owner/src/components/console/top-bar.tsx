'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Action } from '@/components/ui/controls';
import { Dot } from '@/components/ui/primitives';
import { ALERT_COUNT, SYNC_LABEL } from '@/lib/data';
import { initials } from '@/lib/format';
import { SECTION_HEADINGS, sectionFromPathname, type PageHeading } from '@/lib/navigation';
import { useOwner } from './owner-provider';
import { ThemeSwitch } from './theme-switch';

/**
 * The console's page header: where you are on the left, what you can do on the
 * right.
 *
 * The overview's heading greets the owner by name and so cannot come from a
 * lookup table — it is computed on the server and passed down, which also keeps
 * the greeting's clock on the server rather than in a browser that might be in
 * a different timezone.
 */
export function TopBar({
  ownerName,
  overviewHeading,
}: {
  ownerName: string;
  overviewHeading: PageHeading;
}) {
  const pathname = usePathname();
  const { openRegister } = useOwner();

  const section = sectionFromPathname(pathname);
  const heading: PageHeading =
    section === 'overview' || section === null ? overviewHeading : SECTION_HEADINGS[section];

  return (
    <header className="border-line flex h-topbar shrink-0 items-center justify-between gap-5 border-b px-7">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="t-eyebrow truncate">{heading.crumb}</p>
        {/* One <h1> per page, and it lives here rather than in each page so it
            can never be forgotten or duplicated by a screen. */}
        <h1 className="t-title truncate">{heading.title}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-[10px]">
        {/*
          A status readout, not a control. `role="status"` so a change to the
          sync text is announced without stealing focus — and it is not a button
          because there is nothing to click.
        */}
        <p
          role="status"
          className="bg-surface border-line flex h-9 items-center gap-[7px] rounded-[18px] border px-[13px]"
        >
          <Dot tone="ok" size={6} pulse />
          <span className="t-pill text-sub">{SYNC_LABEL}</span>
        </p>

        <ThemeSwitch />

        <Link
          href="/support"
          aria-label={`${ALERT_COUNT} alerts — open reports`}
          className="bg-surface border-gold-soft text-gold t-mono ow-hoverable flex size-9 shrink-0 items-center justify-center rounded-full border"
        >
          <span aria-hidden="true">{ALERT_COUNT}</span>
        </Link>

        <Action
          variant="gold"
          onClick={openRegister}
          className="t-base h-11 shrink-0 gap-[9px] rounded-[22px] px-[22px] tracking-[0.03em]"
        >
          <span aria-hidden="true" className="font-mono text-sm leading-none">
            +
          </span>
          Register member
        </Action>

        <Link
          href="/settings"
          aria-label={`Signed in as ${ownerName} — open gym profile`}
          className="ow-ring ow-liftable flex size-10 shrink-0 rounded-full p-[1.5px]"
        >
          <span
            aria-hidden="true"
            className="bg-surface text-gold t-mono flex size-full items-center justify-center rounded-full"
          >
            {initials(ownerName)}
          </span>
        </Link>
      </div>
    </header>
  );
}
