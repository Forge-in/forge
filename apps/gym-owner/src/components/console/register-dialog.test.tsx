import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { OwnerProvider, useOwner } from './owner-provider';
import { RegisterDialog } from './register-dialog';
import { Toast } from './toast';
import { ToastProvider } from './toast-provider';

/**
 * The register dialog is the console's only screen that creates something, and
 * its failure modes are real-world: a duplicate member record, a fee collected
 * against the wrong plan, a phone number no reminder will ever reach. It gets
 * the interaction coverage to match.
 */

/** Stands in for the top bar's button, so focus return has somewhere to go. */
function OpenButton() {
  const { openRegister } = useOwner();
  return (
    <button type="button" onClick={openRegister}>
      Register member
    </button>
  );
}

function renderDialog() {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <OwnerProvider>
        <OpenButton />
        <RegisterDialog />
        <Toast />
      </OwnerProvider>
    </ToastProvider>,
  );
  return user;
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Register member' }));
  return screen.getByRole('dialog');
}

/** Fills everything the form needs, so a test can vary one thing at a time. */
async function fillValid(
  user: ReturnType<typeof userEvent.setup>,
  overrides: { name?: string; phone?: string; plan?: string } = {},
) {
  await user.type(screen.getByLabelText('Full name'), overrides.name ?? 'Sneha Kale');
  await user.type(screen.getByLabelText('Phone'), overrides.phone ?? '9876500011');
  await user.selectOptions(screen.getByLabelText('Plan'), overrides.plan ?? 'monthly-gym');
}

describe('opening and closing', () => {
  it('is not in the document until it is opened', () => {
    render(
      <ToastProvider>
        <OwnerProvider>
          <RegisterDialog />
        </OwnerProvider>
      </ToastProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('announces itself as a modal dialog with a name', async () => {
    const user = renderDialog();
    const dialog = await open(user);

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: 'Register at the desk' })).toBeVisible();
  });

  it('moves focus to the first field so typing can start immediately', async () => {
    const user = renderDialog();
    await open(user);
    expect(screen.getByLabelText('Full name')).toHaveFocus();
  });

  it('closes on Escape', async () => {
    const user = renderDialog();
    await open(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on the close button', async () => {
    const user = renderDialog();
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Cancel', async () => {
    const user = renderDialog();
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /** A keyboard user dumped at the top of the document has lost their place. */
  it('returns focus to whatever opened it', async () => {
    const user = renderDialog();
    const opener = screen.getByRole('button', { name: 'Register member' });
    await open(user);
    await user.keyboard('{Escape}');
    expect(opener).toHaveFocus();
  });

  /** Someone who steps away to check a plan price expects their typing to survive. */
  it('keeps the draft when it is closed and reopened', async () => {
    const user = renderDialog();
    await open(user);
    await user.type(screen.getByLabelText('Full name'), 'Sneha Kale');
    await user.keyboard('{Escape}');
    await open(user);
    expect(screen.getByLabelText('Full name')).toHaveValue('Sneha Kale');
  });

  it('locks the page behind it from scrolling', async () => {
    const user = renderDialog();
    await open(user);
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});

describe('validation', () => {
  it('refuses an empty form and says why, field by field', async () => {
    const user = renderDialog();
    await open(user);
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Full name is required.');
    expect(alert).toHaveTextContent(/Phone number is required/);
    expect(alert).toHaveTextContent(/Pick a plan/);
    // Still open: nothing was created.
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('marks the offending controls invalid', async () => {
    const user = renderDialog();
    await open(user);
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));

    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Address')).toHaveAttribute('aria-invalid', 'false');
  });

  /** Scolding someone for a half-typed number they are still typing is wrong. */
  it('says nothing until the first submit', async () => {
    const user = renderDialog();
    await open(user);
    await user.type(screen.getByLabelText('Phone'), '98');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears each error as it is fixed, once it has started reporting', async () => {
    const user = renderDialog();
    await open(user);
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Full name is required.');

    await user.type(screen.getByLabelText('Full name'), 'Sneha Kale');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Full name is required.');
  });

  it('refuses a number that already belongs to a member, and names them', async () => {
    const user = renderDialog();
    await open(user);
    await fillValid(user, { phone: '9820411238' });
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Aarav Shah');
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('submits when everything is right, and confirms who was registered', async () => {
    const user = renderDialog();
    await open(user);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/Sneha Kale registered/)).toBeVisible();
    expect(screen.getByText(/₹2,300 collected by UPI/)).toBeVisible();
  });

  it('submits on Enter from a field, without reaching for the mouse', async () => {
    const user = renderDialog();
    await open(user);
    await fillValid(user);
    await user.click(screen.getByLabelText('Full name'));
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('clears the form after a successful registration', async () => {
    const user = renderDialog();
    await open(user);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));
    await open(user);

    expect(screen.getByLabelText('Full name')).toHaveValue('');
    expect(screen.getByLabelText('Phone')).toHaveValue('');
  });
});

describe('Pay later', () => {
  /**
   * The one warning that can be overridden. It must be SHOWN before it can be
   * accepted, or the confirmation is a formality nobody read.
   */
  it('warns on the first attempt and accepts on the second', async () => {
    const user = renderDialog();
    await open(user);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Pay later' }));

    await user.click(screen.getByRole('button', { name: /Register & collect/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Pay later creates an outstanding due/);
    expect(screen.getByRole('dialog')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Register & collect/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(/fee marked pending/)).toBeVisible();
  });

  it('does not warn on a free trial, where nothing is owed', async () => {
    const user = renderDialog();
    await open(user);
    await fillValid(user, { plan: 'trial-7' });
    await user.click(screen.getByRole('button', { name: 'Pay later' }));
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /** Reopening must not carry the earlier confirmation over to a new member. */
  it('re-arms the warning after the dialog is closed and reopened', async () => {
    const user = renderDialog();
    await open(user);
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Pay later' }));
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));

    await user.keyboard('{Escape}');
    await open(user);
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Pay later creates an outstanding due/);
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});

describe('the amount', () => {
  it('shows a dash until a plan is picked', async () => {
    const user = renderDialog();
    await open(user);
    expect(screen.getByText('Select a plan to see the amount')).toBeVisible();
  });

  /**
   * The amount comes from the plan RECORD, never parsed back out of the option
   * label — a renamed plan would otherwise have the desk collecting the wrong
   * figure with nothing erroring.
   */
  it('follows the chosen plan', async () => {
    const user = renderDialog();
    await open(user);

    await user.selectOptions(screen.getByLabelText('Plan'), 'annual-all');
    expect(screen.getByText('₹19,800')).toBeVisible();

    await user.selectOptions(screen.getByLabelText('Plan'), 'quarterly-cardio');
    expect(screen.getByText('₹6,300')).toBeVisible();
  });

  it('shows a free trial as costing nothing', async () => {
    const user = renderDialog();
    await open(user);
    await user.selectOptions(screen.getByLabelText('Plan'), 'trial-7');
    expect(screen.getByText('No payment due on a trial')).toBeVisible();
    expect(screen.getByText('₹0')).toBeVisible();
  });

  it('names the collection method once one is chosen', async () => {
    const user = renderDialog();
    await open(user);
    await user.selectOptions(screen.getByLabelText('Plan'), 'monthly-gym');
    await user.click(screen.getByRole('button', { name: 'Cash' }));
    expect(screen.getByText('Collecting now by Cash')).toBeVisible();
  });
});

describe('assigning a trainer', () => {
  it('warns when the chosen trainer is unavailable', async () => {
    const user = renderDialog();
    await open(user);
    await user.selectOptions(screen.getByLabelText('Assign trainer'), 'simran');

    expect(screen.getByText(/Simran is on leave till 22 Aug/)).toBeVisible();
    expect(screen.getByLabelText('Assign trainer')).toHaveAttribute('aria-invalid', 'true');
  });

  /** A warning, not a rule: booking ahead of a return date is legitimate. */
  it('still allows the registration to go through', async () => {
    const user = renderDialog();
    await open(user);
    await fillValid(user);
    await user.selectOptions(screen.getByLabelText('Assign trainer'), 'simran');
    await user.click(screen.getByRole('button', { name: /Register & collect/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
