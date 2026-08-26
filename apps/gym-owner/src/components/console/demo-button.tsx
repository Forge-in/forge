'use client';

import { Action, type ActionVariant } from '@/components/ui/controls';
import { useDemoAction } from './owner-provider';

/**
 * A button whose action is not wired to an endpoint yet.
 *
 * Most of the console's row actions — Export, Collect, Revoke, Nudge — describe
 * work the API cannot do today. Rather than scatter identical `'use client'`
 * wrappers through eleven screens, every one of them is this component, which
 * keeps the pages themselves server components and makes the set of pending
 * integrations a single grep for `<DemoButton`.
 *
 * THE LABEL IS A PROP, NOT CHILDREN, and the accessible name is always set
 * explicitly. The reason is the accessible-name algorithm: it trims each text
 * node's own contribution before joining them, so `"Remind"` beside a visually
 * hidden `" — Priya Nair"` is announced as "Remind— Priya Nair", and an icon
 * beside `"Add staff"` becomes "+Add staff". Composing the name here from
 * strings we control means what a screen reader says is exactly what we wrote.
 *
 * `srSuffix` exists because a table of nine "Remind" buttons is nine
 * identically-named controls. The visible label stays short; the accessible
 * name says which row it belongs to.
 */
export function DemoButton({
  toast,
  label,
  icon,
  srSuffix,
  hideLabel = false,
  variant,
  className,
  disabled,
}: {
  toast: string;
  /** The visible text, and the base of the accessible name. */
  label: string;
  /** Decorative glyph rendered before the label. Never part of the name. */
  icon?: React.ReactNode | undefined;
  /** Appended to the accessible name to disambiguate one row from another. */
  srSuffix?: string | undefined;
  /** Renders the icon alone — for a chevron whose label would be noise. */
  hideLabel?: boolean | undefined;
  variant?: ActionVariant | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
}) {
  const notify = useDemoAction();

  return (
    <Action
      variant={variant}
      className={className}
      disabled={disabled}
      aria-label={srSuffix ? `${label} — ${srSuffix}` : label}
      onClick={() => notify(toast)}
    >
      {icon ? (
        <span aria-hidden="true" className="leading-none">
          {icon}
        </span>
      ) : null}
      {hideLabel ? null : label}
    </Action>
  );
}
