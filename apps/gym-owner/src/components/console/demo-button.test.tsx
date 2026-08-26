import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { OwnerProvider } from './owner-provider';
import { DemoButton } from './demo-button';
import { DemoRowButton } from './demo-row-button';
import { Toast } from './toast';
import { ToastProvider } from './toast-provider';

function renderIn(node: React.ReactNode) {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <OwnerProvider>
        {node}
        <Toast />
      </OwnerProvider>
    </ToastProvider>,
  );
  return user;
}

describe('DemoButton', () => {
  it('fires its toast', async () => {
    const user = renderIn(<DemoButton toast="Dues sheet exported" label="Export" />);
    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByText('Dues sheet exported')).toBeVisible();
  });

  /**
   * A REGRESSION TEST for a real bug. The accessible-name algorithm trims each
   * text node's own contribution before joining them, so a visible "Remind"
   * beside a hidden " — Priya Nair" is announced as "Remind— Priya Nair" — no
   * space, and nothing in the DOM looks wrong. The name is now composed from
   * strings and set as an attribute, so what is announced is what was written.
   */
  it('composes a disambiguating name with the separator intact', () => {
    renderIn(<DemoButton toast="x" label="Remind" srSuffix="Priya Nair" />);
    expect(screen.getByRole('button')).toHaveAccessibleName('Remind — Priya Nair');
  });

  /** Same trimming problem: an icon beside a label yields "+Add staff". */
  it('keeps an icon out of the accessible name', () => {
    renderIn(<DemoButton toast="x" label="Add staff" icon="+" />);
    expect(screen.getByRole('button')).toHaveAccessibleName('Add staff');
    expect(screen.getByText('+')).toHaveAttribute('aria-hidden', 'true');
  });

  it('can render an icon alone and still be named', () => {
    renderIn(<DemoButton toast="x" label="Open" icon="›" hideLabel />);
    const button = screen.getByRole('button');
    expect(button).toHaveAccessibleName('Open');
    expect(button).not.toHaveTextContent('Open');
  });

  it('does not fire when disabled', async () => {
    const user = renderIn(<DemoButton toast="Should not appear" label="Prev" disabled />);
    await user.click(screen.getByRole('button', { name: 'Prev' }));
    expect(screen.queryByText('Should not appear')).toBeNull();
  });
});

describe('DemoRowButton', () => {
  /**
   * "Deactivate this gym" alone does not say that members lose access, so
   * someone hearing only the label would be one Enter away from a decision they
   * could not have understood.
   */
  it('names itself with the consequence, not just the label', () => {
    renderIn(
      <DemoRowButton
        toast="Deactivation needs a call with support"
        label="Deactivate this gym"
        meta="Members lose access · data kept 90 days"
        destructive
      />,
    );

    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Deactivate this gym — Members lose access · data kept 90 days',
    );
  });

  it('fires its toast', async () => {
    const user = renderIn(
      <DemoRowButton toast="Export queued" label="Export everything" meta="CSV" />,
    );
    await user.click(screen.getByRole('button', { name: /Export everything/ }));
    expect(screen.getByText('Export queued')).toBeVisible();
  });
});

describe('Toast', () => {
  /**
   * The live region has to EXIST before the message arrives — mounting it
   * together with its first message announces nothing at all, which is the
   * usual way this ships unnoticed.
   */
  it('keeps the live region mounted while empty', () => {
    renderIn(<DemoButton toast="Anything" label="Go" />);
    const region = document.querySelector('[aria-live="polite"]');
    expect(region).toBeTruthy();
    expect(region).toBeEmptyDOMElement();
  });

  it('replaces the previous message rather than stacking', async () => {
    const user = renderIn(
      <>
        <DemoButton toast="First message" label="One" />
        <DemoButton toast="Second message" label="Two" />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'One' }));
    await user.click(screen.getByRole('button', { name: 'Two' }));

    expect(screen.queryByText('First message')).toBeNull();
    expect(screen.getByText('Second message')).toBeVisible();
  });

  it('can be dismissed by hand', async () => {
    const user = renderIn(<DemoButton toast="Exported" label="Export" />);

    await user.click(screen.getByRole('button', { name: 'Export' }));
    expect(screen.getByText('Exported')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByText('Exported')).toBeNull();
  });
});
