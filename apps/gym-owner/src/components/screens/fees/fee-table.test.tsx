import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OwnerProvider } from '@/components/console/owner-provider';
import { Toast } from '@/components/console/toast';
import { ToastProvider } from '@/components/console/toast-provider';
import { FEE_ROWS } from '@/lib/data';
import { FeeTable, RemindAllButton } from './fee-table';

/**
 * The reminder state is the point of this component: an owner works down a
 * column of overdue members, and sending the same person three WhatsApp
 * messages in a minute is the failure it exists to prevent.
 */

/**
 * `useUrlFilter` reaches for Next's router, which does not exist outside a
 * request. The bucket tabs are exercised through `parseFeeBucket` instead; what
 * matters here is the table's own state.
 */
vi.mock('@/components/console/url-filter', () => ({
  useUrlFilter: () => () => {},
}));

function renderTable(bucket: 'Overdue' | 'This week' | 'Upcoming' = 'Overdue') {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <OwnerProvider>
        <RemindAllButton bucket={bucket} />
        <FeeTable bucket={bucket} />
        <Toast />
      </OwnerProvider>
    </ToastProvider>,
  );
  return user;
}

describe('rows', () => {
  it('renders one row per member in the bucket', () => {
    renderTable();
    for (const row of FEE_ROWS.Overdue) {
      expect(screen.getByText(row.name)).toBeVisible();
    }
  });

  it('shows each amount in full rupees', () => {
    renderTable();
    expect(screen.getByText('₹5,600')).toBeVisible();
  });

  /**
   * Nine "Remind" buttons are nine identically-named controls to a screen
   * reader unless each says which row it belongs to.
   */
  it('gives every row action an accessible name that names the member', () => {
    renderTable();
    expect(screen.getByRole('button', { name: 'Remind — Priya Nair' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Collect — Priya Nair' })).toBeVisible();
  });
});

describe('reminders', () => {
  it('confirms who was reminded', async () => {
    const user = renderTable();
    await user.click(screen.getByRole('button', { name: 'Remind — Priya Nair' }));
    expect(screen.getByText('WhatsApp + SMS reminder sent to Priya')).toBeVisible();
  });

  /** Disabled rather than removed: a vanishing button makes the row jump. */
  it('disables the button once a reminder has been sent', async () => {
    const user = renderTable();
    const button = screen.getByRole('button', { name: 'Remind — Priya Nair' });

    await user.click(button);

    const after = screen.getByRole('button', { name: 'Reminded — Priya Nair' });
    expect(after).toBeDisabled();
  });

  it('leaves the other rows alone', async () => {
    const user = renderTable();
    await user.click(screen.getByRole('button', { name: 'Remind — Priya Nair' }));
    expect(screen.getByRole('button', { name: 'Remind — Sneha Kale' })).toBeEnabled();
  });

  it('reminds the whole bucket at once, and says how many', async () => {
    const user = renderTable();
    await user.click(screen.getByRole('button', { name: /Remind all/ }));

    expect(
      screen.getByText(`Reminders queued for ${FEE_ROWS.Overdue.length} members`),
    ).toBeVisible();
    for (const row of FEE_ROWS.Overdue) {
      expect(screen.getByRole('button', { name: `Reminded — ${row.name}` })).toBeDisabled();
    }
  });

  it('counts the bucket on the button', () => {
    renderTable();
    expect(
      screen.getByRole('button', { name: `Remind all (${FEE_ROWS.Overdue.length})` }),
    ).toBeVisible();
  });
});

describe('collecting', () => {
  it('names the member and the amount', async () => {
    const user = renderTable();
    await user.click(screen.getByRole('button', { name: 'Collect — Devansh Gupta' }));
    expect(screen.getByText('Collect ₹5,600 from Devansh Gupta — cash, UPI or card')).toBeVisible();
  });
});

describe('other buckets', () => {
  it('renders the upcoming bucket', () => {
    renderTable('Upcoming');
    expect(screen.getByText('Yash Kulkarni')).toBeVisible();
  });

  it('keeps reminder state independent per member across buckets', async () => {
    const user = renderTable('This week');
    await user.click(screen.getByRole('button', { name: 'Remind — Ishita Menon' }));
    expect(screen.getByRole('button', { name: 'Remind — Rohit Verma' })).toBeEnabled();
  });
});
