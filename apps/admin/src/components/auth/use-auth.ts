'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { clearSessionCookie, writeSessionCookie } from '@/lib/session';

/**
 * Sign-in / sign-out.
 *
 * `refresh()` after the redirect matters: the gate lives in `proxy.ts`, and the
 * router cache would otherwise serve the pre-sign-in response.
 */
export function useAuth() {
  const router = useRouter();

  const signIn = useCallback(
    (destination = '/overview') => {
      writeSessionCookie();
      router.replace(destination);
      router.refresh();
    },
    [router],
  );

  const signOut = useCallback(() => {
    clearSessionCookie();
    router.replace('/login');
    router.refresh();
  }, [router]);

  return { signIn, signOut };
}
