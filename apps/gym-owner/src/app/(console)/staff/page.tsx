import type { Metadata } from 'next';
import { DemoButton } from '@/components/console/demo-button';
import { RoleChips } from '@/components/screens/staff/role-chips';
import { Avatar, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  PAYROLL,
  PAYROLL_DUE,
  PAYROLL_TOTAL,
  SHIFTS,
  SHIFT_GAP_NOTE,
  SHIFT_TICKS,
  STAFF,
} from '@/lib/data';
import { firstName, negativeRupees, rupees } from '@/lib/format';
import { parseStaffFilter } from '@/lib/search-params';
import { STAFF_STATUS_TONE } from '@/lib/tone';

export const metadata: Metadata = { title: 'Staff & roles' };

export default async function StaffPage({ searchParams }: PageProps<'/staff'>) {
  const role = parseStaffFilter(await searchParams);
  const staff = STAFF.filter((member) => role === 'All' || member.group === role);

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between gap-4">
        <RoleChips active={role} />
        <DemoButton
          toast="Add staff · name, role, shift, salary and document upload"
          variant="raised"
          className="t-sm h-10 shrink-0 rounded-[20px] px-5 font-medium"
          label="Add staff"
          icon="+"
        />
      </div>

      {staff.length === 0 ? (
        <Card>
          <EmptyState
            glyph="0"
            title={`Nobody is assigned to ${role}`}
            body="Add someone to this role, or pick another filter."
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-3 gap-4">
          {staff.map((member) => (
            /*
              The card IS the list item rather than wrapping one. `display:
              contents` on the <li> would also lay out correctly, but it drops
              the item from the accessibility tree in some browsers, which turns
              a seven-item list into no list at all.
            */
            <li
              key={member.id}
              className={cn(
                'ow-card flex flex-col gap-4 px-6 py-[22px]',
                // The border carries the alert, so a card needing action is
                // findable in a grid of seven without reading any of them.
                member.warning && 'ow-card-warn',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-[13px]">
                  <Avatar name={member.name} size={44} ring={member.device !== null} />
                  <div className="flex min-w-0 flex-col gap-[5px]">
                    <p className="t-md truncate font-semibold">{member.name}</p>
                    <p className="t-pill text-muted">{member.role}</p>
                  </div>
                </div>
                <StatusPill tone={STAFF_STATUS_TONE[member.status]} size="sm">
                  {member.status}
                </StatusPill>
              </div>

              <dl className="flex flex-col gap-[9px]">
                <Fact label="Shift" value={member.shift} />
                <Fact label="Access" value={member.access} muted />
                <Fact
                  label="Trainer app"
                  value={member.device ?? '—'}
                  tone={member.device ? 'gold' : 'muted'}
                />
                <Fact label="Attendance" value={member.attendance} muted />
              </dl>

              {member.warning ? (
                <p className="bg-warn-soft t-mono-xs text-warn rounded-[14px] px-[13px] py-[10px] leading-[1.6]">
                  {member.warning}
                </p>
              ) : null}

              <div className="border-line flex items-center gap-[9px] border-t pt-3">
                <DemoButton
                  toast={`Editing role and permissions for ${member.name}`}
                  variant="raised"
                  srSuffix={member.name}
                  className="t-pill h-[34px] flex-1 rounded-[17px]"
                  label="Edit role"
                />
                {member.status === 'On leave' ? (
                  <DemoButton
                    toast={`Pick someone to cover ${firstName(member.name)}’s shift`}
                    variant="ghost"
                    srSuffix={member.name}
                    className="t-pill text-ink h-[34px] flex-1 rounded-[17px]"
                    label="Cover shift"
                  />
                ) : (
                  <DemoButton
                    toast={`${member.name} would lose all access immediately — confirm?`}
                    variant="danger"
                    srSuffix={member.name}
                    className="t-pill h-[34px] flex-1 rounded-[17px]"
                    label="Disable"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-[1fr_360px] gap-4">
        {/* --- Shift coverage -------------------------------------------- */}

        <Card className="gap-[18px] px-[26px] py-[22px]">
          <CardHeader
            title="Shift coverage · today"
            action={<span className="t-mono-xs text-warn">{SHIFT_GAP_NOTE}</span>}
          />

          <div className="flex flex-col gap-3">
            {/* The tick row is inset by the width of the name column so the
                labels sit above the track they describe, not above the names. */}
            <div aria-hidden="true" className="flex pl-[118px]">
              {SHIFT_TICKS.map((tick) => (
                <span key={tick} className="t-mono-3xs text-muted flex-1">
                  {tick}
                </span>
              ))}
            </div>

            <ul className="flex flex-col gap-3">
              {SHIFTS.map((shift) => (
                <li key={shift.name} className="flex items-center gap-[14px]">
                  <span className="flex w-[104px] shrink-0 flex-col gap-[3px]">
                    <span className="t-xs">{shift.name}</span>
                    <span className="t-mono-3xs text-muted">{shift.role}</span>
                  </span>
                  <span className="bg-raise relative h-[22px] flex-1 overflow-hidden rounded-[11px]">
                    <span
                      aria-hidden="true"
                      style={{
                        left: `${shift.start * 100}%`,
                        width: `${(shift.end - shift.start) * 100}%`,
                      }}
                      className={cn(
                        'absolute inset-y-0 rounded-[11px]',
                        shift.lead ? 'ow-gold-fill' : 'bg-line-strong',
                      )}
                    />
                  </span>
                  <span
                    className={cn(
                      't-mono-xs w-[88px] shrink-0 text-right',
                      shift.uncovered ? 'text-warn' : 'text-sub',
                    )}
                  >
                    {shift.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* --- Payroll --------------------------------------------------- */}

        <Card className="gap-[14px] px-6 py-[22px]">
          <CardHeader title="Payroll · August" />
          <p className="flex items-end gap-[10px]">
            <span className="t-display text-[34px]">{rupees(PAYROLL_TOTAL)}</span>
            <span className="t-mono-xs text-muted pb-[5px]">{PAYROLL_DUE}</span>
          </p>

          <dl className="flex flex-col">
            {PAYROLL.map((line) => (
              <div
                key={line.label}
                className="ow-divide flex items-center justify-between gap-3 py-[9px]"
              >
                <dt className="flex flex-col gap-1">
                  <span className="t-xs">{line.label}</span>
                  <span className="t-mono-2xs text-muted">{line.meta}</span>
                </dt>
                <dd className={cn('t-sm font-semibold', line.deduction ? 'text-warn' : 'text-ink')}>
                  {line.deduction ? negativeRupees(line.amount) : rupees(line.amount)}
                </dd>
              </div>
            ))}
          </dl>

          <DemoButton
            toast={`Payroll sheet ready for ${STAFF.length} staff · verify before release`}
            variant="gold"
            className="t-xs mt-1 h-[38px] w-full rounded-[19px]"
            label="Review payroll"
          />
        </Card>
      </div>
    </div>
  );
}

/** One label/value line inside a staff card. */
function Fact({
  label,
  value,
  muted = false,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean | undefined;
  tone?: 'gold' | 'muted' | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="t-mono-xs text-muted shrink-0 tracking-[0.06em] uppercase">{label}</dt>
      <dd
        className={cn(
          't-xs text-right',
          tone === 'gold'
            ? 'text-gold'
            : tone === 'muted'
              ? 'text-muted'
              : muted
                ? 'text-sub'
                : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
