import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { OwnerProvider } from '@/components/console/owner-provider';
import { Toast } from '@/components/console/toast';
import { ToastProvider } from '@/components/console/toast-provider';
import { DEFAULT_GYM_PROFILE, OPERATING_RULE_SPECS } from '@/lib/data';

import { GymProfileForm, OperatingRulesList } from './gym-profile-form';

/**
 * Rule labels contain regex metacharacters — "fees are 7+ days overdue", where
 * an unescaped `+` is a quantifier and the pattern silently stops matching the
 * label it was built from.
 */
function literal(text: string): RegExp {
  return new RegExp(text.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
}

function renderForm() {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <OwnerProvider>
        <GymProfileForm />
        <OperatingRulesList />
        <Toast />
      </OwnerProvider>
    </ToastProvider>,
  );
  return user;
}

describe('the profile form', () => {
  it('starts clean, with Save and Discard both inert', () => {
    renderForm();
    expect(screen.getByText('All changes saved')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('prefills every field from the gym record', () => {
    renderForm();
    expect(screen.getByLabelText('Display name')).toHaveValue(DEFAULT_GYM_PROFILE.name);
    expect(screen.getByLabelText('GSTIN')).toHaveValue(DEFAULT_GYM_PROFILE.gstin);
  });

  it('reports unsaved changes as soon as something is edited', async () => {
    const user = renderForm();
    await user.type(screen.getByLabelText('Display name'), '!');
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });

  /**
   * Dirtiness is derived by comparison, not tracked with a flag. A flag stays
   * true after a character is typed and deleted, leaving "Unsaved changes"
   * accusing the owner of a change they undid.
   */
  it('goes back to clean when an edit is undone by hand', async () => {
    const user = renderForm();
    const field = screen.getByLabelText('Display name');

    await user.type(field, '!');
    expect(screen.getByText('Unsaved changes')).toBeVisible();

    await user.keyboard('{Backspace}');
    expect(screen.getByText('All changes saved')).toBeVisible();
  });

  it('saves, confirms, and returns to clean', async () => {
    const user = renderForm();
    await user.type(screen.getByLabelText('Display name'), '!');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText(/Gym profile updated/)).toBeVisible();
    expect(screen.getByText('All changes saved')).toBeVisible();
  });

  it('discards back to the last saved values', async () => {
    const user = renderForm();
    const field = screen.getByLabelText('Display name');

    await user.clear(field);
    await user.type(field, 'Something else');
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(field).toHaveValue(DEFAULT_GYM_PROFILE.name);
    expect(screen.getByText('Changes discarded')).toBeVisible();
  });

  it('discards back to the last SAVE, not to the original', async () => {
    const user = renderForm();
    const field = screen.getByLabelText('Display name');

    await user.clear(field);
    await user.type(field, 'Ironhold Baner');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await user.type(field, ' Annexe');
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    expect(field).toHaveValue('Ironhold Baner');
  });
});

describe('field validation', () => {
  it('blocks Save while a field is invalid', async () => {
    const user = renderForm();
    await user.clear(screen.getByLabelText('GSTIN'));
    await user.type(screen.getByLabelText('GSTIN'), 'NOPE');

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('marks the offending control invalid and says how it is wrong', async () => {
    const user = renderForm();
    const field = screen.getByLabelText('GSTIN');

    await user.clear(field);
    await user.type(field, 'NOPE');

    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/GSTIN must be exactly 15 characters \(4 entered\)/)).toBeVisible();
  });

  it('rejects an empty required field', async () => {
    const user = renderForm();
    await user.clear(screen.getByLabelText('Display name'));

    expect(screen.getByText('This field cannot be empty')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('rejects a non-numeric capacity', async () => {
    const user = renderForm();
    const field = screen.getByLabelText('Floor capacity');

    await user.clear(field);
    await user.type(field, 'lots');

    expect(screen.getByText('Numbers only')).toBeVisible();
  });

  it('re-enables Save once the field is corrected', async () => {
    const user = renderForm();
    const field = screen.getByLabelText('GSTIN');

    await user.clear(field);
    await user.type(field, 'NOPE');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();

    await user.clear(field);
    await user.type(field, '27AABCI1234K1ZW');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  });
});

describe('operating rules', () => {
  it('renders every rule as a real switch carrying its state', () => {
    renderForm();
    for (const spec of OPERATING_RULE_SPECS) {
      expect(screen.getByRole('switch', { name: literal(spec.label) })).toBeVisible();
    }
  });

  /** Biometric-only disables QR check-in for everyone — never a default. */
  it('ships the biometric rule off', () => {
    renderForm();
    expect(screen.getByRole('switch', { name: /Biometric check-in only/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('flips a rule and says which way it went', async () => {
    const user = renderForm();
    const rule = screen.getByRole('switch', { name: /Biometric check-in only/i });

    await user.click(rule);
    expect(rule).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Biometric check-in only · turned on/)).toBeVisible();

    await user.click(rule);
    expect(rule).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText(/Biometric check-in only · turned off/)).toBeVisible();
  });

  it('leaves the other rules alone', async () => {
    const user = renderForm();
    await user.click(screen.getByRole('switch', { name: /Biometric check-in only/i }));
    expect(screen.getByRole('switch', { name: /Require ID proof/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
