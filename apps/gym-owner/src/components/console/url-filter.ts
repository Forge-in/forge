'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Writes a single filter key into the URL without losing the others.
 *
 * `replace` rather than `push`: flipping a chip refines the current view, it is
 * not a new destination, and back should leave the screen rather than undo one
 * chip at a time. `scroll: false` keeps the owner's place in a long table
 * instead of throwing them to the top on every click.
 *
 * Passing `null` deletes the key, which is how a filter returns to its default
 * without leaving `?status=All` in the URL — a default that is written down is
 * a default that has to be kept in sync in two places.
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
