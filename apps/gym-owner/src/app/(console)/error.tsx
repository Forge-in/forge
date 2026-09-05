'use client';

import { useEffect } from 'react';
import { Action } from '@/components/ui/controls';

/**
 * The console's error boundary.
 *
 * It catches the one failure `requireOwner()` deliberately does NOT turn into a
 * redirect: a network error reaching the API. Signing an owner out because
 * Forge was briefly unreachable would cost them an SMS and a re-login for a
 * blip, so the DAL rethrows and this screen offers the only useful response —
 * try again.
 *
 * The message is never rendered. A thrown error can carry an internal hostname,
 * a stack frame or a query fragment, and this page is shown to a customer.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kept in the browser console so support can ask for it; the digest is the
    // handle that ties this render to the server log entry.
    console.error('Owner console error', error.digest ?? error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="t-eyebrow text-warn">Something went wrong</p>
      <h2 className="t-display text-[32px]">We could not load this screen</h2>
      <p className="t-mono text-muted max-w-[52ch] leading-[1.7]">
        Your data is safe and nothing was changed. This is usually a connection problem — try again,
        and if it keeps happening, report it from the Account menu.
      </p>
      {error.digest ? (
        <p className="t-mono-xs text-muted">
          Reference <span className="text-sub">{error.digest}</span>
        </p>
      ) : null}
      <Action variant="gold" onClick={reset} className="t-base mt-2 h-11 rounded-[22px] px-6">
        Try again
      </Action>
    </div>
  );
}
