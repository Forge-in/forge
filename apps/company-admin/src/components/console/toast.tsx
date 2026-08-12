'use client';

import { useToast } from './toast-provider';

/**
 * The console's single notification surface, bottom-left.
 *
 * `aria-live="polite"` is on a container that is always mounted — announcing only
 * works if the live region exists before the message arrives.
 */
export function Toast() {
  const { toast } = useToast();

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-7 left-7 z-60"
    >
      {toast ? (
        <div className="wc-card pointer-events-auto flex items-center gap-[14px] px-5 py-[14px]">
          <span aria-hidden="true" className="wc-dot bg-accent" />
          <p className="t-body">{toast}</p>
        </div>
      ) : null}
    </div>
  );
}
