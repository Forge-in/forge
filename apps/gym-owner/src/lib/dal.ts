import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { ForgeApiError, ForgeNetworkError } from '@forge/api-client';
import type { v1 } from '@forge/shared';

import { serverApi } from './api';
import { readSession } from './session';

/**
 * The Data Access Layer — where the dashboard's authorization is ACTUALLY
 * enforced.
 *
 * `proxy.ts` redirects an unauthenticated visitor before anything renders, but
 * that is an optimistic check on the PRESENCE of a cookie and nothing more. It
 * cannot tell a live session from a revoked one, an owner whose membership was
 * removed from one who still has it, or a real token from a string someone
 * pasted into their cookie jar. Next.js says as much: the proxy is not a
 * session-management or authorization solution, and the real check belongs as
 * close to the data as possible.
 *
 * This module is that place. The console layout calls `requireOwner()`, which
 * asks the API — the only thing that can verify a signature, consult the
 * revocation list and re-read the membership.
 *
 * WHY THE MEMOISATION MATTERS. `cache()` deduplicates within a single render
 * pass, so the layout, the sidebar's identity and a page header each asking for
 * the owner produce ONE call to /me rather than three. Without it, adding a
 * guard to a component would silently multiply the API load of every page —
 * which is how guards end up being left off "for performance".
 */

export interface OwnerSession {
  user: v1.MeResponse['user'];
  membership: v1.MeResponse['membership'];
  memberships: v1.MeResponse['memberships'];
  accessibleGymIds: v1.MeResponse['accessibleGymIds'];
}

export const requireOwner = cache(async (): Promise<OwnerSession> => {
  const { accessToken, refreshToken } = await readSession();

  // No cookie at all: skip the round trip. The proxy normally catches this
  // first, but a server action invoked directly does not pass through it.
  if (!accessToken && !refreshToken) redirect('/login');

  try {
    return await serverApi().me();
  } catch (error) {
    /**
     * A NETWORK failure is not an authorization failure.
     *
     * Redirecting to /login here would sign an owner out because the API was
     * briefly unreachable — and since sign-in needs an SMS, that turns a blip
     * into a real interruption in the middle of their working day. Rethrowing
     * lets the route's error boundary show "could not reach Forge", which is
     * both true and recoverable.
     */
    if (error instanceof ForgeNetworkError) throw error;

    /**
     * Anything the API refused ends the session. That covers an expired token
     * the client could not refresh, a revoked one, and — the case this exists
     * for — an owner whose membership was removed while their tab was open.
     */
    if (error instanceof ForgeApiError) redirect('/login');

    throw error;
  }
});

/**
 * The same check without the redirect, for callers that need to branch rather
 * than bounce.
 *
 * Deliberately a separate function rather than a `redirect: boolean` parameter:
 * a flag would make the guarded path opt-in at every call site, and the
 * unguarded value is the one that gets picked by accident.
 */
export const getOwner = cache(async (): Promise<OwnerSession | null> => {
  const { accessToken, refreshToken } = await readSession();
  if (!accessToken && !refreshToken) return null;

  try {
    return await serverApi().me();
  } catch (error) {
    if (error instanceof ForgeNetworkError) throw error;
    if (error instanceof ForgeApiError) return null;
    throw error;
  }
});

/**
 * The owner's display name.
 *
 * An account may have no name recorded — sign-in only ever asks for a phone
 * number — so the phone is the fallback. Greeting someone by their phone number
 * is odd; greeting them by an empty string is broken.
 */
export function ownerDisplayName(session: OwnerSession): string {
  return session.user.fullName ?? session.user.phone;
}
