'use client';

import type { v1 } from '@forge/shared';
import {
  Cell,
  DataTable,
  EmptyRow,
  HeadCell,
  TableBody,
  TableHead,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/primitives';
import { absoluteTime, hasExpired, timeUntil } from '@/lib/datetime';
import { formatPhone } from '@/lib/format';
import { revokeInvite } from '@/app/(console)/team/actions';
import { ConfirmAction } from './confirm-action';

/**
 * Outstanding invites — pre-authorisations to become a platform admin.
 *
 * Deliberately a separate table from the admins list rather than extra rows in it. An invite
 * is not a person with access; it is permission for someone to *gain* access, and merging
 * the two would put "pending" and "active" in one column where a glance could confuse them.
 *
 * The codes themselves are not here and cannot be: Forge stores only a hash. The console can
 * revoke an invite, never re-read it.
 */
export function AdminInvitesTable({
  invites,
  /** Admins, so `invitedBy` (a user id) can be shown as a person rather than a uuid. */
  admins,
  now,
}: {
  invites: readonly v1.AdminInviteSummary[];
  admins: readonly v1.AdminSummary[];
  now: string;
}) {
  const reference = new Date(now);

  /**
   * Resolved client-side from data already on the page rather than by widening the API
   * response. Falls back to an em dash when the inviter is no longer an admin — their
   * account can be removed while an invite they issued is still outstanding, and the row
   * must still render.
   */
  const nameByUserId = new Map(
    admins.map((admin) => [admin.userId, admin.fullName ?? formatPhone(admin.phone)]),
  );

  return (
    <DataTable
      label="Outstanding admin invites"
      className="wc-card min-w-[860px]"
      toolbar={
        <div className="hairline-b flex flex-col gap-1 px-6 py-[18px]">
          <h2 className="t-section">Outstanding invites</h2>
          <p className="t-xs text-muted">
            Each needs the invite code and a one-time code sent to that number
          </p>
        </div>
      }
    >
      <TableHead className="px-6 py-3">
        <HeadCell className="flex-[1.6]">Number</HeadCell>
        <HeadCell className="w-[120px] shrink-0">Status</HeadCell>
        <HeadCell className="w-[160px] shrink-0">Expires</HeadCell>
        <HeadCell className="flex-1">Invited by</HeadCell>
        <HeadCell className="w-[150px] shrink-0 text-right">Action</HeadCell>
      </TableHead>

      <TableBody>
        {invites.length === 0 ? (
          <EmptyRow className="px-6">
            No outstanding invites. Use “Invite admin” above to add someone.
          </EmptyRow>
        ) : null}

        {invites.map((invite) => {
          /**
           * The API filters expired invites out of this list, so an expired row can only
           * appear on a console that has been left open across the expiry. It is still
           * rendered honestly rather than hidden — a row that silently vanished would look
           * like someone revoked it.
           */
          const expired = hasExpired(invite.expiresAt, reference);

          return (
            <TableRow key={invite.id} className="px-6 py-[15px] text-[13.5px]">
              <Cell className="t-mono-sm flex-[1.6] truncate">{formatPhone(invite.phone)}</Cell>

              <Cell className="w-[120px] shrink-0">
                <StatusBadge status={expired ? 'Churned' : 'Pending'} />
              </Cell>

              <Cell
                className="t-mono-sm text-muted w-[160px] shrink-0"
                title={absoluteTime(invite.expiresAt)}
              >
                {timeUntil(invite.expiresAt, reference)}
              </Cell>

              <Cell className="text-sub flex-1 truncate">
                {nameByUserId.get(invite.invitedBy) ?? '—'}
              </Cell>

              <Cell className="flex w-[150px] shrink-0 justify-end">
                <ConfirmAction
                  label={expired ? 'Clear' : 'Revoke'}
                  confirmLabel={expired ? 'Confirm clear' : 'Confirm revoke'}
                  successMessage={`Invite for ${formatPhone(invite.phone)} revoked`}
                  perform={() => revokeInvite(invite.id)}
                  className="t-action px-[11px] py-[6px]"
                />
              </Cell>
            </TableRow>
          );
        })}
      </TableBody>
    </DataTable>
  );
}
