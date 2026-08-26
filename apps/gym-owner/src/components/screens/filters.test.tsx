import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnerProvider } from '@/components/console/owner-provider';
import { ToastProvider } from '@/components/console/toast-provider';
import { CURRENT_DAY, STAFF } from '@/lib/data';
import { ClassViewSwitch, WeekPicker } from './classes/class-controls';
import { FeeBucketTabs } from './fees/fee-table';
import { MemberSearch, MemberStatusChips } from './members/member-filters';
import { RevenueScopeSwitch } from './revenue/revenue-chart';
import { RoleChips } from './staff/role-chips';

/**
 * Filter state lives in the URL, not in component state — that is what makes a
 * filtered view shareable, back-button-able, and filtered on the SERVER so the
 * rows nobody asked for are never sent.
 *
 * These tests pin what each control WRITES. What the server then does with it is
 * covered by `search-params.test.ts` and `metrics.test.ts`.
 */

const replace = vi.fn();
let currentSearch = '';

vi.mock('next/navigation', () => ({
  usePathname: () => '/members',
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

beforeEach(() => {
  replace.mockClear();
  currentSearch = '';
});

function renderIn(node: React.ReactNode) {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <OwnerProvider>{node}</OwnerProvider>
    </ToastProvider>,
  );
  return user;
}

describe('MemberSearch', () => {
  it('is a labelled search box', () => {
    renderIn(<MemberSearch />);
    expect(screen.getByLabelText('Search members by name or phone number')).toBeVisible();
  });

  /** Keystrokes are cheap; navigations are not. */
  it('writes the query to the URL once typing settles', async () => {
    const user = renderIn(<MemberSearch />);
    await user.type(screen.getByRole('searchbox'), 'nair');

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith('/members?q=nair', { scroll: false });
    // Four keystrokes, one navigation.
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('drops the key entirely when the box is cleared', async () => {
    currentSearch = 'q=nair';
    const user = renderIn(<MemberSearch />);

    const box = screen.getByRole('searchbox');
    expect(box).toHaveValue('nair');

    await user.clear(box);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/members', { scroll: false }));
  });

  it('keeps other filters when the query changes', async () => {
    currentSearch = 'status=Overdue';
    const user = renderIn(<MemberSearch />);
    await user.type(screen.getByRole('searchbox'), 'p');

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/members?status=Overdue&q=p', { scroll: false }),
    );
  });

  /** Adopting a URL that changed underneath us — back button, a cleared link. */
  it('shows the query the URL already carries', () => {
    currentSearch = 'q=kabir';
    renderIn(<MemberSearch />);
    expect(screen.getByRole('searchbox')).toHaveValue('kabir');
  });
});

describe('MemberStatusChips', () => {
  it('marks the active chip pressed', () => {
    renderIn(<MemberStatusChips active="Overdue" />);
    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('writes the chosen status', async () => {
    const user = renderIn(<MemberStatusChips active="All" />);
    await user.click(screen.getByRole('button', { name: 'Frozen' }));
    expect(replace).toHaveBeenCalledWith('/members?status=Frozen', { scroll: false });
  });

  /** The default is expressed by the key's ABSENCE, not by `?status=All`. */
  it('clears the key when returning to the default', async () => {
    currentSearch = 'status=Frozen';
    const user = renderIn(<MemberStatusChips active="Frozen" />);
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(replace).toHaveBeenCalledWith('/members', { scroll: false });
  });

  it('preserves the search query when a chip is flipped', async () => {
    currentSearch = 'q=nair';
    const user = renderIn(<MemberStatusChips active="All" />);
    await user.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(replace).toHaveBeenCalledWith('/members?q=nair&status=Overdue', { scroll: false });
  });
});

describe('RevenueScopeSwitch', () => {
  it('writes a non-default scope and clears the default', async () => {
    const user = renderIn(<RevenueScopeSwitch scope="Month" />);

    await user.click(screen.getByRole('button', { name: 'Year' }));
    expect(replace).toHaveBeenCalledWith('/members?scope=Year', { scroll: false });

    await user.click(screen.getByRole('button', { name: 'Month' }));
    expect(replace).toHaveBeenCalledWith('/members', { scroll: false });
  });
});

describe('FeeBucketTabs', () => {
  /** The counts are the whole point: an empty tab should not need opening. */
  it('shows how many rows each bucket holds', () => {
    renderIn(<FeeBucketTabs active="Overdue" />);
    expect(screen.getByRole('button', { name: 'Overdue (4)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'This week (2)' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upcoming (3)' })).toBeVisible();
  });

  it('writes the chosen bucket, spaces and all', async () => {
    const user = renderIn(<FeeBucketTabs active="Overdue" />);
    await user.click(screen.getByRole('button', { name: 'This week (2)' }));
    expect(replace).toHaveBeenCalledWith('/members?bucket=This+week', { scroll: false });
  });
});

describe('WeekPicker', () => {
  it('marks the selected day pressed', () => {
    renderIn(<WeekPicker day="Sun" />);
    expect(screen.getByRole('button', { name: /^Sun 16/ })).toHaveAttribute('aria-pressed', 'true');
  });

  /**
   * Seven near-identical buttons: the accessible name has to carry the date,
   * whether it is today, and how busy it is.
   */
  it('names each day with its date, today marker and load', () => {
    renderIn(<WeekPicker day={CURRENT_DAY} />);
    expect(screen.getByRole('button', { name: 'Wed 19, today — 6 classes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sun 16 — closed' })).toBeVisible();
  });

  it('writes the chosen day and clears it for today', async () => {
    const user = renderIn(<WeekPicker day={CURRENT_DAY} />);

    await user.click(screen.getByRole('button', { name: /^Sun 16/ }));
    expect(replace).toHaveBeenCalledWith('/members?day=Sun', { scroll: false });

    await user.click(screen.getByRole('button', { name: /^Wed 19/ }));
    expect(replace).toHaveBeenCalledWith('/members', { scroll: false });
  });
});

describe('ClassViewSwitch', () => {
  it('writes the personal view and clears back to group', async () => {
    const user = renderIn(<ClassViewSwitch view="Group" />);

    await user.click(screen.getByRole('button', { name: 'PT sessions' }));
    expect(replace).toHaveBeenCalledWith('/members?view=Personal', { scroll: false });

    await user.click(screen.getByRole('button', { name: 'Group classes' }));
    expect(replace).toHaveBeenCalledWith('/members', { scroll: false });
  });
});

describe('RoleChips', () => {
  /** Counts are derived from the roll, so a chip cannot disagree with the grid. */
  it('counts each role from the staff list', () => {
    renderIn(<RoleChips active="All" />);

    expect(screen.getByRole('button', { name: `All ${STAFF.length}` })).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: `Trainers ${STAFF.filter((s) => s.group === 'Trainers').length}`,
      }),
    ).toBeVisible();
  });

  /** A role with nobody in it is a fact the owner needs, not a chip to hide. */
  it('still shows a role with nobody in it', () => {
    renderIn(<RoleChips active="All" />);
    expect(screen.getByRole('button', { name: 'Manager 0' })).toBeVisible();
  });

  it('writes the chosen role', async () => {
    const user = renderIn(<RoleChips active="All" />);
    await user.click(screen.getByRole('button', { name: /^Cleaning/ }));
    expect(replace).toHaveBeenCalledWith('/members?role=Cleaning', { scroll: false });
  });
});
