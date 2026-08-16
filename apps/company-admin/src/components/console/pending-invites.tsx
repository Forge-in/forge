'use client';

import { Action } from '@/components/ui/controls';
import { Card, CardHeader, CardNote, EmptyState } from '@/components/ui/primitives';
import { copyToClipboard } from '@/lib/clipboard';
import type { Invite } from '@/lib/data/types';
import { SIGNUP_BASE_URL, useConsole } from './console-provider';
import { useToast } from './toast-provider';

export function PendingInvites() {
  const { invites, resendInvite, revokeInvite } = useConsole();
  const { notify } = useToast();

  async function copyLink(invite: Invite) {
    const copied = await copyToClipboard(`${SIGNUP_BASE_URL}/${invite.token}`);
    notify(copied ? 'Signup link copied' : 'Could not copy — check clipboard permissions');
  }

  return (
    <Card className="px-6 py-[22px]">
      <CardHeader
        title="Pending invites"
        action={<CardNote>{invites.length} outstanding</CardNote>}
      />

      {invites.length === 0 ? (
        <EmptyState>
          No invites outstanding. Every owner you sent one to has finished signing up.
        </EmptyState>
      ) : (
        invites.map((invite) => (
          <div key={invite.id} className="hairline-b flex flex-wrap items-center gap-4 py-[15px]">
            <div className="flex min-w-0 flex-[1.8] flex-col gap-[3px]">
              <span className="text-[13.5px]">{invite.org}</span>
              <span className="t-mono-xs text-muted truncate">{invite.email}</span>
            </div>
            <span className="t-base text-sub flex-1">{invite.plan}</span>
            <span className="t-mono-xs text-muted flex-1">{invite.sent}</span>
            <div className="flex gap-2">
              <Action
                onClick={() => void copyLink(invite)}
                className="t-action px-3 py-[7px]"
                aria-label={`Copy signup link for ${invite.org}`}
              >
                Copy link
              </Action>
              <Action
                onClick={() => resendInvite(invite)}
                className="t-action px-3 py-[7px]"
                aria-label={`Resend invite to ${invite.email}`}
              >
                Resend
              </Action>
              <Action
                onClick={() => revokeInvite(invite)}
                className="t-action text-muted px-3 py-[7px]"
                aria-label={`Revoke invite for ${invite.org}`}
              >
                Revoke
              </Action>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
