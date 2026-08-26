'use client';

import { Action } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { useOwner } from './owner-provider';

/**
 * Opens the register dialog from anywhere that is not the top bar — currently
 * the members empty state, which is exactly where someone realises the person
 * in front of them is not on the roll yet.
 */
export function RegisterMemberButton({ className }: { className?: string }) {
  const { openRegister } = useOwner();

  return (
    <Action variant="gold" onClick={openRegister} className={cn('t-base', className)}>
      Register member
    </Action>
  );
}
