import { redirect } from 'next/navigation';

import { CONSOLE_HOME } from '@/lib/navigation';

/**
 * `/` is not a screen.
 *
 * `proxy.ts` normally resolves the root before it reaches a page — to the
 * console for a signed-in owner, to sign-in otherwise. This exists for the
 * paths that do not pass through the proxy at all: a direct server render, a
 * request the matcher excludes, or a future deployment target that runs the
 * proxy differently. Without it, the root would 404 in exactly the situations
 * nobody tests.
 */
export default function RootPage() {
  redirect(CONSOLE_HOME);
}
