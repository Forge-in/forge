'use client';

import Link from 'next/link';
import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * Every interactive control in the console.
 *
 * The source design draws these as `<div onClick>`. That is fine for a mock and
 * unacceptable in an application: a div is not focusable, not reachable by
 * keyboard, not announced as an action, and not activated by Space or Enter.
 * Everything here is a real `<button>` or `<Link>`, which is also why none of
 * them need a `tabIndex` or a key handler — the element already does it.
 */

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

/**
 *   gold    — the one primary action in a region; gold gradient on ink text
 *   raised  — the default: raised surface, hairline border
 *   ghost   — transparent with a border, for the lesser of two choices
 *   danger  — transparent with a warn border, for destructive actions
 *   plain   — text only, no box (in-card links such as "Full schedule")
 */
export type ActionVariant = 'gold' | 'raised' | 'ghost' | 'danger' | 'plain';

const VARIANT_CLASS: Readonly<Record<ActionVariant, string>> = {
  gold: 'ow-gold-cta ow-liftable font-semibold',
  raised: 'bg-raise border border-line-strong text-ink ow-hoverable',
  ghost: 'border border-line-strong text-muted ow-hoverable',
  danger: 'border border-warn text-warn ow-hoverable hover:!border-warn hover:!text-warn',
  plain: 'text-gold ow-hoverable',
};

/**
 * No padding, radius or type role here on purpose: the design varies all three
 * per context (a 44px header CTA and a 28px row action are the same variant),
 * and without tailwind-merge a base utility would win or lose by stylesheet
 * source order rather than by intent.
 */
const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap disabled:cursor-not-allowed';

type ActionProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: ActionVariant | undefined;
};

export function Action({ variant = 'raised', className, type, ...rest }: ActionProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(BASE, VARIANT_CLASS[variant], className)}
      {...rest}
    />
  );
}

type ActionLinkProps = React.ComponentPropsWithoutRef<typeof Link> & {
  variant?: ActionVariant | undefined;
};

export function ActionLink({ variant = 'plain', className, ...rest }: ActionLinkProps) {
  return <Link className={cn(BASE, VARIANT_CLASS[variant], className)} {...rest} />;
}

/* -------------------------------------------------------------------------- */
/* Chips                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A filter chip. Selection is carried by border and text colour, and announced
 * through `aria-pressed` — colour alone is not a state a screen reader can read.
 *
 * `label` is a string rather than children BECAUSE of the count. The
 * accessible-name algorithm trims each text node's own contribution before
 * joining them, so a "Trainers" span beside a "3" span is announced as
 * "Trainers3". Composing the name here keeps what is said equal to what is
 * shown.
 */
export function FilterChip({
  active,
  label,
  count,
  className,
  ...rest
}: Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> & {
  active: boolean;
  label: string;
  count?: string | undefined;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={count === undefined ? label : `${label} ${count}`}
      className={cn(
        't-pill ow-hoverable flex h-[34px] shrink-0 cursor-pointer items-center gap-[7px] rounded-[17px] border px-[15px] whitespace-nowrap',
        active ? 'bg-gold-soft border-gold text-gold' : 'bg-surface border-line-strong text-sub',
        className,
      )}
      {...rest}
    >
      <span>{label}</span>
      {count === undefined ? null : <span className="opacity-60">{count}</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* -------------------------------------------------------------------------- */

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * The pill-in-a-trough control used for revenue scope, class view and fee
 * bucket.
 *
 * `role="group"` with per-button `aria-pressed` rather than a radiogroup: these
 * switch a view rather than collect an answer, and a radiogroup would trap
 * arrow keys inside a control that sits in the middle of a header.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  size?: 'sm' | 'md' | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'bg-raise border-line flex shrink-0 items-center gap-1 rounded-[15px] border p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              't-pill ow-hoverable flex h-7 cursor-pointer items-center rounded-xl whitespace-nowrap',
              size === 'sm' ? 'px-[14px]' : 'px-4',
              selected ? 'bg-surface text-gold' : 'text-muted bg-transparent',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A settings switch.
 *
 * The whole row is the control — label, help text and track — so the hit target
 * matches what the design implies rather than being a 44px sliver. `role
 * ="switch"` + `aria-checked` is what makes the state audible; the track itself
 * is `aria-hidden` because it is a picture of the state, not a second control.
 */
export function SwitchRow({
  label,
  help,
  checked,
  onToggle,
  className,
}: {
  label: React.ReactNode;
  help?: React.ReactNode | undefined;
  checked: boolean;
  onToggle: () => void;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'ow-divide flex w-full cursor-pointer items-center justify-between gap-4 py-[13px] text-left',
        className,
      )}
    >
      <span className="flex min-w-0 flex-col gap-[5px]">
        <span className="t-base">{label}</span>
        {help ? <span className="t-mono-xs text-muted leading-[1.6]">{help}</span> : null}
      </span>
      <SwitchTrack checked={checked} />
    </button>
  );
}

/** The track on its own, for rows that are not themselves the button. */
export function SwitchTrack({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-6 w-11 shrink-0 items-center rounded-xl p-[3px]',
        checked ? 'ow-gold-fill' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'ease-ow size-[18px] rounded-full transition-[margin-left] duration-[180ms]',
          checked ? 'bg-on-gold ml-5' : 'bg-muted ml-0',
        )}
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A labelled field with a hint line beneath.
 *
 * The hint doubles as the error message — the design shows one line that turns
 * warn — so it is wired with `aria-describedby` and the control gets
 * `aria-invalid`. Without both, an invalid field is red and silent.
 */
export function Field({
  label,
  hint,
  invalid = false,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode | undefined;
  invalid?: boolean | undefined;
  className?: string | undefined;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={id} className="t-field-label">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': invalid,
        'aria-describedby': hint ? hintId : undefined,
      })}
      {hint ? (
        <p
          id={hintId}
          className={cn('t-mono-2xs', invalid ? 'text-warn' : 'text-muted')}
          /**
           * Polite, not `role="alert"`.
           *
           * Two reasons. Forms that have an error SUMMARY — the register dialog
           * — would otherwise announce every problem twice, once from the
           * summary and once from the field, and the duplicate is what a screen
           * reader user actually hears. And inline validation fires while
           * someone is still typing, where an assertive alert interrupts them
           * mid-word. The message is still reachable on focus through
           * `aria-describedby`, which is the guarantee that matters.
           */
          aria-live={invalid ? 'polite' : undefined}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `ComponentPropsWithRef`, not `WithoutRef`: the register dialog focuses its
 * first input on open, which needs a ref to reach the DOM node. React 19 passes
 * `ref` through as an ordinary prop, so no `forwardRef` wrapper is required.
 */
export function TextInput({ className, ...rest }: React.ComponentPropsWithRef<'input'>) {
  return <input className={cn('ow-field h-11 w-full', className)} {...rest} />;
}

export function SelectInput({ className, ...rest }: React.ComponentPropsWithRef<'select'>) {
  return <select className={cn('ow-field h-11 w-full', className)} {...rest} />;
}

export function TextArea({ className, ...rest }: React.ComponentPropsWithRef<'textarea'>) {
  return (
    <textarea
      className={cn('ow-field w-full resize-none rounded-2xl py-[14px] leading-[1.6]', className)}
      {...rest}
    />
  );
}
