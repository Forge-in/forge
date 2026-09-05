import type { Metadata } from 'next';
import { DemoButton } from '@/components/console/demo-button';
import { RegisterMemberButton } from '@/components/console/register-button';
import { MemberSearch, MemberStatusChips } from '@/components/screens/members/member-filters';
import { Avatar, Card, EmptyState, Meter, StatusPill } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { MEMBERS, MEMBER_TOTAL } from '@/lib/data';
import { count, firstName, rupees } from '@/lib/format';
import { filterMembers, isChurnRisk } from '@/lib/metrics';
import { parseMemberFilters } from '@/lib/search-params';
import { MEMBER_STATUS_TONE } from '@/lib/tone';

export const metadata: Metadata = { title: 'Members' };

/**
 * Column widths are declared once and applied to both the header and the rows,
 * so a column cannot drift out of alignment with its own heading.
 */
const GRID = 'grid grid-cols-[2.1fr_1.5fr_1fr_1.2fr_1.1fr_108px] gap-4 px-[26px]';

const HEADINGS = ['Member', 'Plan', 'Status', 'Attendance · 30d', 'Balance', ''] as const;

/**
 * The member roll.
 *
 * Filtering happens on the SERVER, from the URL, so a search for one member
 * does not ship the other 411 rows to the browser — and the filtered view is a
 * link the owner can send to the front desk.
 */
export default async function MembersPage({ searchParams }: PageProps<'/members'>) {
  const filters = parseMemberFilters(await searchParams);
  const rows = filterMembers(MEMBERS, { query: filters.query, filter: filters.status });
  const trimmedQuery = filters.query.trim();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-[10px]">
          <MemberSearch />
          <MemberStatusChips active={filters.status} />
        </div>
        {/*
          `aria-live` so a screen-reader user hears the result count change as
          they type or flip a chip. Without it the table simply becomes
          different, silently.
        */}
        <p aria-live="polite" className="t-mono-sm text-muted shrink-0">
          {count(rows.length)} of {count(MEMBER_TOTAL)} members
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className={cn(GRID, 'ow-divide-b bg-raise py-[15px]')} role="row" aria-hidden="true">
          {HEADINGS.map((heading, index) => (
            <span key={heading || `col-${index}`} className="t-colhead">
              {heading}
            </span>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            glyph="0"
            title={
              trimmedQuery
                ? `No member matches “${trimmedQuery}”`
                : `No member is currently ${filters.status.toLowerCase()}`
            }
            body={
              trimmedQuery
                ? 'Check the spelling, or register them as a new member.'
                : 'Nothing in this bucket right now — try another filter.'
            }
            action={
              trimmedQuery ? (
                <RegisterMemberButton className="t-sm mt-1 h-10 rounded-[20px] px-[22px]" />
              ) : null
            }
          />
        ) : (
          <ul>
            {rows.map((member) => {
              const risk = isChurnRisk(member);
              const frozen = member.status === 'Frozen';

              // What the row's button should do is a property of the member's
              // state, not of the table: unverified blocks at the door, a
              // balance needs collecting, everything else is just a profile.
              const action =
                member.status === 'Unverified'
                  ? {
                      label: 'Verify',
                      toast: `ID upload requested from ${firstName(member.name)}`,
                    }
                  : member.due > 0
                    ? {
                        label: 'Collect',
                        toast: `Payment sheet open for ${member.name}`,
                      }
                    : {
                        label: 'Open',
                        toast: `Opening ${member.name}’s profile`,
                      };

              return (
                <li key={member.id} className={cn(GRID, 'ow-divide-b items-center py-[15px]')}>
                  <span className="flex min-w-0 items-center gap-[13px]">
                    <Avatar name={member.name} size={36} />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="t-base truncate font-medium">{member.name}</span>
                      <span className="t-mono-xs text-muted">{member.phone}</span>
                    </span>
                  </span>

                  <span className="flex min-w-0 flex-col gap-[5px]">
                    <span className="t-sm text-sub truncate">{member.plan}</span>
                    <span className="t-mono-xs text-muted">{member.planMeta}</span>
                  </span>

                  <StatusPill
                    tone={MEMBER_STATUS_TONE[member.status]}
                    className="justify-self-start"
                  >
                    {member.status}
                  </StatusPill>

                  <span className="flex flex-col gap-[7px]">
                    <span className={cn('t-mono', risk ? 'text-warn' : 'text-sub')}>
                      {/* A frozen membership has nothing to measure — "0%" would
                          read as "stopped coming", which is a different claim. */}
                      {frozen ? 'paused' : `${member.attendance}% · ${member.lastSeen}`}
                    </span>
                    <Meter
                      value={frozen ? 0 : member.attendance}
                      total={100}
                      tone={risk ? 'warn' : 'gold'}
                    />
                  </span>

                  <span className="flex flex-col gap-[5px]">
                    <span
                      className={cn(
                        't-sm font-medium',
                        member.status === 'Overdue' ? 'text-warn' : 'text-ink',
                      )}
                    >
                      {member.due > 0 ? rupees(member.due) : '—'}
                    </span>
                    <span className="t-mono-xs text-muted">{member.dueMeta}</span>
                  </span>

                  <DemoButton
                    toast={action.toast}
                    label={action.label}
                    variant="raised"
                    srSuffix={member.name}
                    className="t-pill h-8 w-full rounded-2xl"
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center justify-between gap-4 px-[26px] py-[14px]">
          <p className="t-mono-xs text-muted">
            {rows.length === 0 ? 'No rows' : `Showing 1–${rows.length} · sorted by last check-in`}
          </p>
          <div className="flex items-center gap-2">
            {/*
              Genuinely `disabled`, not styled to look it. A "not-allowed" cursor
              on a live button still fires on click and is still in the tab
              order announced as available.
            */}
            <DemoButton
              toast=""
              disabled
              variant="raised"
              className="t-pill bg-raise border-line h-[30px] rounded-[15px] px-[14px]"
              label="Prev"
            />
            <DemoButton
              toast="Loading next 12 members"
              disabled={rows.length === 0}
              variant="raised"
              className="t-pill h-[30px] rounded-[15px] px-[14px]"
              label="Next"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
