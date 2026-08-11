'use client';

import { Action, type ActionVariant } from '@/components/ui/controls';
import { useToast } from './toast-provider';

const NOT_WIRED = 'Not wired up in this prototype';

/**
 * A control the design shows but that has no backend yet. It acknowledges the
 * click honestly instead of doing nothing, which is what makes a prototype
 * usable for review.
 */
export function ToastAction({
  message = NOT_WIRED,
  variant = 'outline',
  className,
  children,
}: {
  message?: string;
  variant?: ActionVariant;
  className?: string;
  children: React.ReactNode;
}) {
  const { notify } = useToast();

  return (
    <Action variant={variant} className={className} onClick={() => notify(message)}>
      {children}
    </Action>
  );
}
