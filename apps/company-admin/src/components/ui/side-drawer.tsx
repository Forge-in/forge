'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface SideDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Rendered inside the header; also names the dialog for assistive tech. */
  title: string;
  subtitle?: React.ReactNode;
  /** Sits under the header, e.g. the wizard's step ticks. */
  banner?: React.ReactNode;
  footer?: React.ReactNode;
  /**
   * Changes whenever the panel swaps its contents (a wizard step, say). Used to
   * recover focus if the element that had it was removed by the swap.
   */
  contentKey?: string | number;
  children: React.ReactNode;
  className?: string;
}

/**
 * Right-hand side sheet.
 *
 * Everything a modal owes the user is handled here: escape to dismiss, focus
 * moved in on open and returned on close, Tab kept inside the panel, and the page
 * behind it locked so it cannot scroll away underneath.
 */
export function SideDrawer({
  open,
  onClose,
  title,
  subtitle,
  banner,
  footer,
  contentKey,
  children,
  className,
}: SideDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Keeps the document listener stable while always calling the latest
  // `onClose`. Written in an effect, never during render — the handler only ever
  // reads it asynchronously, so being one commit behind is impossible.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const titleId = useId();

  /* Lock the page behind the sheet. */
  useEffect(() => {
    if (!open) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    // Compensating for the scrollbar keeps the layout from jumping sideways.
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  /* Move focus in, and put it back where it came from on close. */
  useEffect(() => {
    if (!open) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel)?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  /*
   * Recover focus after a content swap.
   *
   * Advancing the wizard can remove the very element that had focus — "Invite
   * another" exists on the last step and nowhere else. The browser then drops
   * focus to <body>, outside the dialog, which silently breaks the trap. Focus is
   * only moved when it has actually escaped, so clicking through the steps
   * normally leaves it where the user put it.
   */
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;

    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();
  }, [open, contentKey]);

  /*
   * Keyboard handling lives on the document, not on the overlay element.
   *
   * A React `onKeyDown` only fires for events originating inside the subtree, and
   * clicking any non-interactive part of the panel moves focus to <body> — from
   * there Escape and Tab would never reach the handler. Capture phase, so the
   * dialog wins over anything else listening.
   */
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const targets = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.offsetParent !== null || node === document.activeElement,
      );
      if (targets.length === 0) {
        // Nothing to land on: keep focus on the panel rather than losing it.
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = targets[0]!;
      const last = targets[targets.length - 1]!;
      const active = document.activeElement;

      // Focus outside the panel entirely (it escaped, or Tab started from body).
      if (!active || !panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  // The sheet only ever opens from a user gesture, so by the time this renders
  // the document exists — no mount flag needed to keep the portal SSR-safe.
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="bg-scrim fixed inset-0 z-40 flex justify-end">
      <div aria-hidden="true" className="flex-1 cursor-default" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'bg-canvas hairline-l max-w-panel flex h-full w-full flex-col outline-none',
          className,
        )}
      >
        <header className="hairline-b flex items-start justify-between gap-5 px-8 py-[26px]">
          <div className="flex flex-col gap-[6px]">
            <h2 id={titleId} className="t-drawer-title">
              {title}
            </h2>
            {subtitle ? <p className="t-mono-sm text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="t-mono-sm text-muted wc-hoverable cursor-pointer p-1"
          >
            Close
          </button>
        </header>

        {banner}

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-[26px] pb-8">{children}</div>

        {footer}
      </div>
    </div>,
    document.body,
  );
}
