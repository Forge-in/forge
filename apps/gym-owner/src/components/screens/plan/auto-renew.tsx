'use client';

import { useOwner } from '@/components/console/owner-provider';
import { SwitchTrack } from '@/components/ui/controls';

/**
 * The auto-renew switch.
 *
 * Its own component rather than a `SwitchRow` because the row is laid out as a
 * label/value pair inside the payment card, not as a settings row with helper
 * text — but the semantics are identical: a real `role="switch"` carrying
 * `aria-checked`.
 */
export function AutoRenewToggle() {
  const { autoRenew, toggleAutoRenew } = useOwner();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={autoRenew}
      onClick={toggleAutoRenew}
      className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
    >
      <span className="t-sm text-sub">Auto-renew</span>
      <SwitchTrack checked={autoRenew} />
    </button>
  );
}
