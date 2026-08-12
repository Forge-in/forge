'use client';

import { useState } from 'react';
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
import { Action } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { absoluteTime, timeAgo } from '@/lib/datetime';
import { formatPhone, initials } from '@/lib/format';
import { reinstateAdmin, suspendAdmin } from '@/app/(console)/team/actions';
import { AdminInviteDrawer } from './admin-invite-drawer';
import { ConfirmAction } from './confirm-action';

/**
 * The list of people who can reach every gym on Forge.
 *
 * A client component because each row carries actions, but it renders data the SERVER
 * fetched and verified — nothing here decides who may act. The controls below mirror the
 * API's rules so the console explains itself before a request is made; the API refuses
 * independently, and if the two ever disagree the API's answer is the one shown.
 */
export function AdminsTable({
  admins,
  currentAdminId,
  now,
}: {
  admins: readonly v1.AdminSummary[];
  /** The signed-in admin, so their own row can be marked and its Suspend control removed. */
  currentAdminId: string;
  /** Rendered on the server and passed down, so relative times do not shift on hydration. */
  now: string;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const reference = new Date(now);

  /**
   * Suspending the last active admin locks everyone out of the console permanently — the
   * only recovery is running the seed CLI against production with `--force`. The API refuses
   * it inside a locked transaction, which is what makes it actually safe; this count exists
   * so the console can say why the button is unavailable rather than letting someone press
   * it and read a 409.
   */
  const activeCount = admins.filter((admin) => admin.status === 'active').length;
  const isLastActive = activeCount <= 1;

  return (
    <>
      <DataTable
        label="Platform admins"
        className="wc-card min-w-[900px]"
        toolbar={
          <div className="hairline-b flex items-center justify-between gap-4 px-6 py-[18px]">
            <div className="flex flex-col gap-1">
              <h2 className="t-section">Platform admins</h2>
              <p className="t-xs text-muted">{activeCount} active · full access to every gym</p>
            </div>
            <Action
              variant="solid"
              onClick={() => setInviteOpen(true)}
              className="t-action px-[13px] py-[7px]"
            >
              Invite admin
            </Action>
          </div>
        }
      >
        <TableHead className="px-6 py-3">
          <HeadCell className="flex-[2]">Person</HeadCell>
          <HeadCell className="w-[120px] shrink-0">Status</HeadCell>
          <HeadCell className="w-[150px] shrink-0">Last signed in</HeadCell>
          <HeadCell className="w-[150px] shrink-0">Added</HeadCell>
          <HeadCell className="w-[190px] shrink-0 text-right">Access</HeadCell>
        </TableHead>

        <TableBody>
          {admins.length === 0 ? (
            /**
             * Practically unreachable — you must be an admin to see this page, so there is
             * always at least one. It exists because an empty body would otherwise render as
             * a bare header with no explanation if the list ever failed to a partial result.
             */
            <EmptyRow className="px-6">No platform admins found.</EmptyRow>
          ) : null}

          {admins.map((admin) => {
            const isSelf = admin.adminId === currentAdminId;
            const suspended = admin.status === 'suspended';

            return (
              <TableRow
                key={admin.adminId}
                className={cn('px-6 py-[15px] text-[13.5px]', suspended && 'opacity-60')}
              >
                <Cell className="flex flex-[2] items-center gap-[13px]">
                  <span className="wc-avatar size-[30px] rounded-full text-[11px]">
                    {initials(admin.fullName ?? admin.phone)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-[2px]">
                    <span className="flex items-center gap-2 truncate">
                      {admin.fullName ?? formatPhone(admin.phone)}
                      {isSelf ? <span className="t-mono-2xs text-muted">(you)</span> : null}
                    </span>
                    <span className="t-mono-xs text-muted truncate">
                      {formatPhone(admin.phone)}
                    </span>
                  </span>
                </Cell>

                <Cell className="w-[120px] shrink-0">
                  <StatusBadge status={suspended ? 'Suspended' : 'Active'} />
                </Cell>

                {/* Relative for scanning, absolute in the tooltip for when it matters. */}
                <Cell
                  className="t-mono-sm text-muted w-[150px] shrink-0"
                  title={absoluteTime(admin.lastSignedInAt)}
                >
                  {admin.lastSignedInAt ? timeAgo(admin.lastSignedInAt, reference) : 'never'}
                </Cell>

                <Cell
                  className="t-mono-sm text-muted w-[150px] shrink-0"
                  title={absoluteTime(admin.createdAt)}
                >
                  {timeAgo(admin.createdAt, reference)}
                </Cell>

                <Cell className="flex w-[190px] shrink-0 justify-end">
                  {suspended ? (
                    <ConfirmAction
                      label="Reinstate"
                      confirmLabel="Confirm reinstate"
                      successMessage={`${admin.fullName ?? formatPhone(admin.phone)} can sign in again`}
                      perform={() => reinstateAdmin(admin.adminId)}
                      className="t-action px-[11px] py-[6px]"
                    />
                  ) : (
                    <ConfirmAction
                      label="Suspend"
                      confirmLabel="Confirm suspend"
                      successMessage={`${admin.fullName ?? formatPhone(admin.phone)} signed out everywhere`}
                      perform={() => suspendAdmin(admin.adminId)}
                      /**
                       * Two separate reasons, and they read differently on purpose — an
                       * operator who cannot press a button deserves to know which rule they
                       * hit, not a generic "unavailable".
                       */
                      disabled={isSelf || isLastActive}
                      disabledReason={
                        isSelf
                          ? 'You cannot suspend your own account — ask another admin'
                          : 'The last active admin cannot be suspended — invite a replacement first'
                      }
                      className="t-action px-[11px] py-[6px]"
                    />
                  )}
                </Cell>
              </TableRow>
            );
          })}
        </TableBody>
      </DataTable>

      <AdminInviteDrawer open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
