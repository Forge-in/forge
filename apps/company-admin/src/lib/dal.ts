import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { ForgeApiError, ForgeNetworkError } from '@forge/api-client';
import type { v1 } from '@forge/shared';

import { consoleApi } from './api';
import { readSession } from './session';

/**
 * The Data Access Layer — where the console's authorization is ACTUALLY enforced.
 *
 * `proxy.ts` redirects an unauthenticated visitor before anything renders, but that is an
 * optimistic check on the presence of a cookie and nothing more. It cannot tell a live
 * session from a revoked one, a suspended administrator from an active one, or a real token
 * from a string someone pasted into their cookie jar. Next.js says as much: the proxy is not
 * a session-management or authorization solution, and the real checks belong as close to the
 * data as possible.
 *
 * This module is that place. Every server component and server action that touches
 * administrator-only data calls `requireAdmin()`, which asks the API — the only thing that
 * can verify a signature, check the revocation list, and re-read the account's status.
 *
 * WHY THE MEMOISATION MATTERS. `cache()` deduplicates within a single render pass, so a
 * layout and three nested components each calling `requireAdmin()` produce ONE call to
 * /me rather than four. Without it, adding a guard to a component would silently multiply
 * the API load of every page — which is how guards end up being left off "for performance".
 */

export interface ConsoleSession {
  admin: v1.AdminIdentity;
}

/**
 * Verifies the session and returns the administrator, or redirects to sign-in.
 *
 * Redirect rather than throw: a server component has nowhere to render an error to, and an
 * expired console session is an entirely ordinary event — the token lives fifteen minutes.
 */
export const requireAdmin = cache(async (): Promise<ConsoleSession> => {
  const { accessToken, refreshToken } = await readSession();

  // No cookie at all: skip the round trip. The proxy normally catches this first, but a
  // server action invoked directly does not pass through it.
  if (!accessToken && !refreshToken) redirect('/login');

  try {
    const { admin } = await consoleApi().me();
    return { admin };
  } catch (error) {
    /**
     * A NETWORK failure is not an authorization failure.
     *
     * Redirecting to /login here would sign an administrator out because the API was
     * briefly unreachable — and since sign-in needs an SMS, that turns a blip into a real
     * interruption. Rethrowing lets the route's error boundary show "could not reach
     * Forge", which is both true and recoverable.
     */
    if (error instanceof ForgeNetworkError) throw error;

    /**
     * Anything the API refused ends the session. That covers an expired token the client
     * could not refresh, a revoked one, and — the case this exists for — an administrator
     * suspended while their tab was open, whose token the API now rejects instantly.
     */
    if (error instanceof ForgeApiError) redirect('/login');

    throw error;
  }
});

/**
 * The same check without the redirect, for callers that need to branch rather than bounce.
 *
 * Deliberately separate from requireAdmin: a single function taking a `redirect: boolean`
 * would make the guarded path opt-in at every call site, and the unguarded value is the one
 * that gets picked by accident.
 */
export const getAdmin = cache(async (): Promise<ConsoleSession | null> => {
  const { accessToken, refreshToken } = await readSession();
  if (!accessToken && !refreshToken) return null;

  try {
    const { admin } = await consoleApi().me();
    return { admin };
  } catch (error) {
    if (error instanceof ForgeNetworkError) throw error;
    if (error instanceof ForgeApiError) return null;
    throw error;
  }
});
