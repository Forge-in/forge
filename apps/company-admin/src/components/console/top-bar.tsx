'use client';

import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { Action } from '@/components/ui/controls';
import { findGym } from '@/lib/data';
import {
  SECTION_HEADINGS,
  gymIdFromPathname,
  sectionFromPathname,
  type PageHeading,
} from '@/lib/navigation';
import { useConsole } from './console-provider';
import { SearchBox, SearchBoxFallback } from './search-box';

const FALLBACK_HEADING: PageHeading = { title: 'Wrath Core', subtitle: 'Platform console' };

function headingFor(pathname: string): PageHeading {
  const gymId = gymIdFromPathname(pathname);

  if (gymId) {
    const gym = findGym(gymId);
    return gym
      ? { title: gym.name, subtitle: `${gym.city} · ${gym.plan}` }
      : { title: 'Organisation', subtitle: 'Not found' };
  }

  const section = sectionFromPathname(pathname);
  return section ? SECTION_HEADINGS[section] : FALLBACK_HEADING;
}

export function TopBar() {
  const pathname = usePathname();
  const { openInvite } = useConsole();
  const heading = headingFor(pathname);

  return (
    <header className="hairline-b flex shrink-0 items-center justify-between gap-6 px-8 py-5">
      <div className="flex min-w-[180px] shrink-0 flex-col gap-1">
        <h1 className="t-page-title truncate">{heading.title}</h1>
        <p className="t-mono-sm text-muted truncate">{heading.subtitle}</p>
      </div>

      <div className="flex min-w-0 shrink items-center gap-3">
        {/* Only the input depends on the search params, so the boundary stays
            tight and the rest of the header prerenders. */}
        <Suspense fallback={<SearchBoxFallback />}>
          <SearchBox />
        </Suspense>

        <span className="t-pill text-sub hairline px-[13px] py-2 whitespace-nowrap">
          Production
        </span>
        <Action
          variant="solid"
          onClick={openInvite}
          className="t-pill shrink-0 px-[15px] py-[9px] whitespace-nowrap"
        >
          Invite gym owner
        </Action>
      </div>
    </header>
  );
}
