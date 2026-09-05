import Link from 'next/link';

import { CONSOLE_HOME } from '@/lib/navigation';

/**
 * The root not-found page.
 *
 * Deliberately standalone rather than inside the console shell: an unknown URL
 * can be hit by someone with no session, and rendering the shell would run
 * `requireOwner()` and bounce them to sign-in — turning a mistyped link into an
 * apparent logout.
 */
export default function NotFound() {
  return (
    <main className="bg-bg text-ink flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="t-eyebrow">Error 404</p>
      <h1 className="t-display text-[44px]">This page does not exist</h1>
      <p className="t-mono text-muted max-w-[46ch] leading-[1.7]">
        The link may be out of date, or the screen may have moved as the console grew.
      </p>
      <Link
        href={CONSOLE_HOME}
        className="ow-gold-cta ow-liftable t-base mt-2 flex h-11 items-center rounded-[22px] px-6 font-semibold"
      >
        Back to the overview
      </Link>
    </main>
  );
}
