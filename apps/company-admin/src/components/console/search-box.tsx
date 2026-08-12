'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** Keystrokes are cheap; navigations are not. */
const SEARCH_DEBOUNCE_MS = 220;

const INPUT_CLASS = 'wc-field min-w-24 max-w-[250px] flex-1 px-[13px] py-[9px] text-[13px]';
const PLACEHOLDER = 'Search gyms, owners, invoices';
const LABEL = 'Search gyms, owners and invoices';

/**
 * Static stand-in with the same box model as the live control, so the header
 * prerenders complete and nothing shifts when the search params resolve.
 */
export function SearchBoxFallback() {
  return (
    <input type="search" placeholder={PLACEHOLDER} aria-label={LABEL} className={INPUT_CLASS} />
  );
}

/**
 * Global search. It is a search of the gym directory, so it always resolves
 * there — typing from any screen lands you on a filtered `/gyms`.
 */
export function SearchBox() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(urlQuery);
  const [syncedQuery, setSyncedQuery] = useState(urlQuery);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt a URL that changed underneath us — back button, a link that clears the
  // filter, a fresh navigation. Done during render rather than in an effect so
  // the box never paints a stale value for a frame.
  if (syncedQuery !== urlQuery) {
    setSyncedQuery(urlQuery);
    setQuery(urlQuery);
  }

  /*
   * Drop a pending navigation whenever the route changes.
   *
   * Without this, typing and then immediately clicking a sidebar link yanks the
   * operator to /gyms a fifth of a second after they asked to go somewhere else.
   * The box itself lives in the layout and never unmounts, so nothing else would
   * cancel that timer.
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

      // Filters already in the URL survive when we are staying on the directory.
      const params = new URLSearchParams(pathname === '/gyms' ? searchParams.toString() : '');

      // The raw value goes into the URL, untrimmed, so the render-time sync above
      // always sees exactly what was typed and never edits the box mid-keystroke.
      // Trimming happens where the query is consumed, in `filterGyms`.
      if (next) params.set('q', next);
      else params.delete('q');

      const target = params.size > 0 ? `/gyms?${params.toString()}` : '/gyms';

      // Staying put replaces, so a long query does not fill the back stack.
      if (pathname === '/gyms') router.replace(target, { scroll: false });
      else router.push(target);
    }, SEARCH_DEBOUNCE_MS);
  }

  return (
    <input
      type="search"
      value={query}
      onChange={(event) => onChange(event.target.value)}
      placeholder={PLACEHOLDER}
      aria-label={LABEL}
      className={INPUT_CLASS}
    />
  );
}
