'use client';

import { useConsole } from './console-provider';

/**
 * "2 on trial · 3 invited". The invite half is live client state, so this small
 * leaf is a client component while the page around it stays on the server.
 */
export function InviteCountHint({ trials }: { trials: number }) {
  const { invites } = useConsole();
  return (
    <>
      {trials} on trial · {invites.length} invited
    </>
  );
}
