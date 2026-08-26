'use client';

import { Dot } from '@/components/ui/primitives';
import { useToast } from './toast-provider';

/**
 * The console's notification surface, bottom-centre.
 *
 * `aria-live="polite"` sits on a container that is ALWAYS MOUNTED. A live
 * region only announces changes to a node that already existed — mounting the
 * region together with its first message announces nothing at all, which is the
 * usual way this bug ships unnoticed.
 *
 * `pointer-events-none` on the wrapper so a toast over the bottom of a table
 * never swallows a click meant for the row underneath it.
 */
export function Toast() {
  const { toast, dismiss } = useToast();

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-[30px] left-1/2 z-50 -translate-x-1/2"
    >
      {toast ? (
        <div className="ow-toast-in bg-raise border-gold-soft pointer-events-auto flex items-center gap-3 rounded-[24px] border px-6 py-[14px] shadow-[0_18px_44px_var(--ow-shadow)]">
          <Dot tone="gold" size={6} />
          <p className="t-base font-medium">{toast}</p>
          {/* A dismiss affordance, because 2.6 seconds is short for a screen
              reader and long for someone who has read it and wants it gone. */}
          <button
            type="button"
            onClick={dismiss}
            className="t-mono-lg text-muted ow-hoverable ml-1 cursor-pointer"
          >
            <span aria-hidden="true">×</span>
            <span className="sr-only">Dismiss notification</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
