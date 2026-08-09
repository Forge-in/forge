import type { Metadata } from 'next';
import { ToastAction } from '@/components/console/toast-action';
import { Cell, DataTable, HeadCell, TableBody, TableHead, TableRow } from '@/components/ui/table';
import { PERMISSIONS, TEAM } from '@/lib/data';
import { initials } from '@/lib/format';

export const metadata: Metadata = { title: 'Team & roles' };

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-6 px-8 pt-[26px] pb-12">
      <DataTable
        label="Internal team"
        className="wc-card min-w-[960px]"
        toolbar={
          <div className="hairline-b flex items-center justify-between gap-4 px-6 py-[18px]">
            <h2 className="t-section">Internal team</h2>
            <ToastAction variant="solid" className="t-action px-[13px] py-[7px]">
              Add teammate
            </ToastAction>
          </div>
        }
      >
        <TableHead className="px-6 py-3">
          <HeadCell className="flex-[2]">Person</HeadCell>
          <HeadCell className="flex-[1.2]">Role</HeadCell>
          <HeadCell className="flex-[1.4]">Scope</HeadCell>
          <HeadCell className="w-[140px] shrink-0">Last active</HeadCell>
          <HeadCell className="w-[100px] shrink-0">2FA</HeadCell>
        </TableHead>

        <TableBody>
          {TEAM.map((member) => (
            <TableRow key={member.email} className="px-6 py-[15px] text-[13.5px]">
              <Cell className="flex flex-[2] items-center gap-[13px]">
                <span className="wc-avatar size-[30px] rounded-full text-[11px]">
                  {initials(member.name)}
                </span>
                <span className="flex min-w-0 flex-col gap-[2px]">
                  <span className="truncate">{member.name}</span>
                  <span className="t-mono-xs text-muted truncate">{member.email}</span>
                </span>
              </Cell>
              <Cell className="text-sub flex-[1.2]">{member.role}</Cell>
              <Cell className="text-sub flex-[1.4]">{member.scope}</Cell>
              <Cell className="t-mono-sm text-muted w-[140px] shrink-0">{member.lastActive}</Cell>
              <Cell className="t-action text-sub w-[100px] shrink-0">{member.mfa}</Cell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>

      <DataTable label="Permissions by role" className="wc-card min-w-[760px]">
        <TableHead className="px-6 py-[14px]">
          <HeadCell className="flex-[2]">Permission</HeadCell>
          <HeadCell className="flex-1">Superadmin</HeadCell>
          <HeadCell className="flex-1">Ops</HeadCell>
          <HeadCell className="flex-1">Finance</HeadCell>
          <HeadCell className="flex-1">Support</HeadCell>
        </TableHead>

        <TableBody>
          {PERMISSIONS.map((permission) => (
            <TableRow key={permission.name} className="px-6 py-[14px] text-[13.5px]">
              <Cell className="flex-[2]">{permission.name}</Cell>
              <Cell className="text-sub flex-1">{permission.superadmin}</Cell>
              <Cell className="text-sub flex-1">{permission.ops}</Cell>
              <Cell className="text-sub flex-1">{permission.finance}</Cell>
              <Cell className="text-sub flex-1">{permission.support}</Cell>
            </TableRow>
          ))}
        </TableBody>
      </DataTable>
    </div>
  );
}
