'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Action, type ActionVariant } from '@/components/ui/controls';
import { useToast } from '@/components/console/toast-provider';
import type { ActionResult } from '@/app/(console)/team/actions';

/** How long an armed confirmation stays armed before disarming itself. */
const ARM_TIMEOUT_MS = 6000;

interface ConfirmActionProps {
  /** Resting label, e.g. "Suspend". */
  label: string;
  /** Armed label, e.g. "Confirm suspend" — it must name the consequence, not just say "Yes". */
  confirmLabel: string;
  /** Announced on success. */
  successMessage: string;
  /** Runs on confirm. Its message is shown verbatim on failure. */
  perform: () => Promise<ActionResult>;
  variant?: ActionVariant;
  disabled?: boolean;
  /** Explains why the control is unavailable, on hover and to assistive tech. */
  disabledReason?: string;
  className?: string;
}

/**
 * A two-press control for actions that change who can reach the platform.
 *
 * WHY TWO PRESSES RATHER THAN A MODAL. Every action here sits inside a table row and refers
 * to that row. A modal has to restate which row it means, and a modal that says "Suspend this
 * admin?" without naming them is exactly how the wrong person gets suspended. Arming in place
 * keeps the target and the confirmation in the same visual line.
 *
 * IT DISARMS ITSELF. An armed button left on an unattended console is a single stray click
 * away from revoking someone's access, so it reverts after a few seconds. That also matters
 * for a mis-click: doing nothing for a moment is a complete undo.
 *
 * THE ACTION IS PESSIMISTIC — the row does not change until the server has agreed. An
 * optimistic "Suspended" that later turns out to have been refused would be a lie about a
 * security state, which is the worst thing this screen could tell someone.
 */
export function ConfirmAction({
  label,
  confirmLabel,
  successMessage,
  perform,
  variant = 'outline',
  disabled = false,
  disabledReason,
  className,
}: ConfirmActionProps) {
  const { notify } = useToast();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function disarm() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setArmed(false);
  }

  // A timer outliving the row — which happens the moment the list revalidates — would set
  // state on an unmounted component.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  function arm() {
    setArmed(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setArmed(false);
      timerRef.current = null;
    }, ARM_TIMEOUT_MS);
  }

  function confirm() {
    disarm();

    startTransition(async () => {
      const result = await perform();
      // Both outcomes are announced. A silent success on a security action leaves the
      // operator unsure whether the click registered, and clicking again is the failure mode.
      notify(result.status === 'ok' ? successMessage : result.message);
    });
  }

  if (disabled) {
    return (
      <Action
        variant="plain"
        disabled
        title={disabledReason}
        aria-label={disabledReason ? `${label} — ${disabledReason}` : label}
        className={className}
      >
        {label}
      </Action>
    );
  }

  if (pending) {
    return (
      <Action variant={variant} disabled className={className}>
        Working…
      </Action>
    );
  }

  if (!armed) {
    return (
      <Action variant={variant} onClick={arm} className={className}>
        {label}
      </Action>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <Action
        variant="solid"
        onClick={confirm}
        className={className}
        // Autofocus so Enter confirms and Escape is not the only way out — the armed state
        // is the one place a keyboard user would otherwise have to hunt for the target.
        autoFocus
        onKeyDown={(event) => {
          if (event.key === 'Escape') disarm();
        }}
      >
        {confirmLabel}
      </Action>
      <Action variant="plain" onClick={disarm} className="t-mono-2xs text-muted">
        Cancel
      </Action>
    </span>
  );
}
