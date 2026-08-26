'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FilterChip } from '@/components/ui/controls';
import { useUrlFilter } from '@/components/console/url-filter';
import { MEMBER_FILTERS, type MemberFilter } from '@/lib/data';

/** Keystrokes are cheap; navigations are not. */
const SEARCH_DEBOUNCE_MS = 220;

/**
 * The member search box.
 *
 * Typing writes to the URL, so the server re-filters and the result is a
 * shareable link — but only after a pause, or every keystroke would be a
 * round trip.
 */
export function MemberSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Adopt a URL that changed underneath us — the back button, a link that
   * clears the filter, a fresh navigation. Done DURING RENDER rather than in an
   * effect, so the box never paints a stale value for a frame.
   */
  if (syncedQuery !== urlQuery) {
    setSyncedQuery(urlQuery);
    setQuery(urlQuery);
  }

  /**
   * Drop a pending navigation when the route changes.
   *
   * Without this, typing and then immediately clicking a sidebar link yanks the
   * owner back to /members a fifth of a second after they asked to go somewhere
   * else.
   */
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [pathname]);

  function onChange(next: string) {
    setQuery(next);

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;

      const params = new URLSearchParams(searchParams.toString());
      // The RAW value goes into the URL, untrimmed, so the render-time sync
      // above always sees exactly what was typed and never edits the box
      // mid-keystroke. Trimming happens where the query is consumed.
      if (next) params.set('q', next);
      else params.delete('q');

      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <div className="bg-surface border-line-strong ow-hoverable flex h-[42px] w-[300px] items-center gap-[10px] rounded-[21px] border px-[18px]">
      <span aria-hidden="true" className="t-mono-lg text-muted">
        ⌕
      </span>
      <input
        type="search"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search name or phone"
        aria-label="Search members by name or phone number"
        className="t-base text-ink min-w-0 flex-1 border-none bg-transparent"
      />
    </div>
  );
}

/** The status chips. Each writes one key, so the search query survives a click. */
export function MemberStatusChips({ active }: { active: MemberFilter }) {
  const setFilter = useUrlFilter();

  return (
    <div role="group" aria-label="Filter members by status" className="flex flex-wrap gap-2">
      {MEMBER_FILTERS.map((option) => (
        <FilterChip
          key={option}
          label={option}
          active={active === option}
          // 'All' is the default, so it is expressed by the key's absence rather
          // than by `?status=All`.
          onClick={() => setFilter('status', option === 'All' ? null : option)}
        />
      ))}
    </div>
  );
}
