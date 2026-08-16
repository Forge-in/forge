'use client';

import { useEffect } from 'react';
import { Action } from '@/components/ui/controls';

/**
 * Console-scoped error boundary: the sidebar and header survive, so a failed
 * page does not strand the operator on a blank screen.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Swap for the platform's reporter when one is wired up.
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-6 px-8 pt-[26px] pb-12">
      <div className="flex flex-col gap-3">
        <h2 className="t-detail-title">Something went wrong</h2>
        <p className="t-body leading-prose text-sub max-w-[460px] text-pretty">
          This screen failed to load. Retrying is safe — nothing was changed.
        </p>
        {error.digest ? <p className="t-mono-sm text-dim">Reference {error.digest}</p> : null}
      </div>

      <Action variant="solid" onClick={reset} className="t-pill self-start px-5 py-[11px]">
        Try again
      </Action>
    </div>
  );
}
