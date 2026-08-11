'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Writes a single filter key into the URL without losing the others.
 *
 * `replace` rather than `push`: flipping a chip is a refinement of the current
 * view, not a new destination, and back should leave the page rather than undo
 * one chip at a time. `scroll: false` keeps the operator's place in a long table.
 */
export function useUrlFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());

      if (value === null || value === '') params.delete(key);
      else params.set(key, value);

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
}
