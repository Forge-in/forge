import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * The console has exactly three action treatments. Padding and type role stay
 * with the call site, because the design varies them per context.
 *
 *   outline — hairline box, muted text, brightens on hover
 *   solid   — ink fill, canvas text; one per screen region
 *   plain   — text-only, no box (in-card links such as "All gyms")
 */
export type ActionVariant = 'outline' | 'solid' | 'plain';

const VARIANT_CLASS: Readonly<Record<ActionVariant, string>> = {
  outline: 'hairline wc-hoverable text-sub',
  solid: 'wc-solid',
  plain: 'wc-hoverable text-sub',
};

/**
 * No `justify-*` or `text-align` here on purpose: full-width buttons need
 * centring and split rows need `justify-between`, and without tailwind-merge a
 * base utility would win or lose by CSS source order rather than by intent.
 */
const BASE = 'inline-flex items-center gap-2 cursor-pointer';

type ActionProps = React.ComponentPropsWithoutRef<'button'> & {
  variant?: ActionVariant;
};

export function Action({ variant = 'outline', className, type, ...rest }: ActionProps) {
  return (
    <button
      type={type ?? 'button'}
      className={cn(BASE, VARIANT_CLASS[variant], className)}
      {...rest}
    />
  );
}

type ActionLinkProps = React.ComponentPropsWithoutRef<typeof Link> & {
  variant?: ActionVariant;
};

export function ActionLink({ variant = 'plain', className, ...rest }: ActionLinkProps) {
  return <Link className={cn(BASE, VARIANT_CLASS[variant], className)} {...rest} />;
}

/**
 * Filter chip. Selection is communicated by border and text colour, and to
 * assistive tech by `aria-pressed`.
 */
export function FilterChip({
  active,
  className,
  ...rest
}: React.ComponentPropsWithoutRef<'button'> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        't-action hairline wc-hoverable cursor-pointer px-[14px] py-2',
        active ? 'border-sub text-ink' : 'border-line text-muted',
        className,
      )}
      {...rest}
    />
  );
}

/**
 * Settings switch. The whole row is the control — label, help text and track —
 * so the hit target matches what the design implies.
 */
export function SwitchRow({
  label,
  help,
  checked,
  onToggle,
  className,
}: {
  label: string;
  help: string;
  checked: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        'hairline-t flex w-full cursor-pointer items-center justify-between gap-6 py-[14px] text-left',
        className,
      )}
    >
      <span className="flex flex-col gap-[3px]">
        <span className="t-body text-ink">{label}</span>
        <span className="t-xs text-muted">{help}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'flex h-[22px] w-10 shrink-0 items-center p-[2px]',
          checked ? 'bg-accent-deep' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'ease-wc size-[18px] transition-[margin-left,background-color] duration-[140ms]',
            checked ? 'ml-[18px] bg-ink' : 'ml-0 bg-dim',
          )}
        />
      </span>
    </button>
  );
}
