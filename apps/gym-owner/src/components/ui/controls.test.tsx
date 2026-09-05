import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Meter, StatusPill } from './primitives';
import { Action, Field, FilterChip, SegmentedControl, SwitchRow, TextInput } from './controls';

/**
 * The source design draws every control as a `<div onClick>`. These tests pin
 * the reason that was not carried over: a div is not focusable, not reachable
 * by keyboard, not announced as an action, and not activated by Space or Enter.
 */

describe('Action', () => {
  it('is a real button, so it is keyboard-operable for free', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Action onClick={onClick}>Retry all</Action>);

    const button = screen.getByRole('button', { name: 'Retry all' });
    await user.tab();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  /** Inside a <form>, an unspecified type submits — which is rarely intended. */
  it('defaults to type="button"', () => {
    render(<Action>Cancel</Action>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('honours an explicit submit type', () => {
    render(<Action type="submit">Save</Action>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('does not fire when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Action disabled onClick={onClick}>
        Prev
      </Action>,
    );

    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('FilterChip', () => {
  /** Colour alone is not a state a screen reader can read. */
  it('announces selection through aria-pressed', () => {
    render(
      <>
        <FilterChip active label="Overdue" />
        <FilterChip active={false} label="Trial" />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Overdue' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Trial' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('includes a count in the accessible name when given one', () => {
    render(<FilterChip active={false} label="Trainers" count="3" />);
    // A REGRESSION TEST: without an explicit name this announces "Trainers3".
    expect(screen.getByRole('button')).toHaveAccessibleName('Trainers 3');
    expect(screen.getByText('3')).toBeVisible();
  });
});

describe('SegmentedControl', () => {
  const OPTIONS = [
    { value: 'Day', label: 'Day' },
    { value: 'Month', label: 'Month' },
    { value: 'Year', label: 'Year' },
  ] as const;

  it('marks exactly one option pressed', () => {
    render(
      <SegmentedControl
        label="Revenue period"
        options={OPTIONS}
        value="Month"
        onChange={() => {}}
      />,
    );

    const pressed = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveAccessibleName('Month');
  });

  it('names the group, so the buttons are not three loose controls', () => {
    render(
      <SegmentedControl label="Revenue period" options={OPTIONS} value="Day" onChange={() => {}} />,
    );
    expect(screen.getByRole('group', { name: 'Revenue period' })).toBeVisible();
  });

  it('reports the chosen value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl label="Revenue period" options={OPTIONS} value="Day" onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: 'Year' }));
    expect(onChange).toHaveBeenCalledWith('Year');
  });
});

describe('SwitchRow', () => {
  it('is a switch carrying its state, not a styled div', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <SwitchRow
        label="Biometric check-in only"
        help="Turning this on disables QR check-in"
        checked={false}
        onToggle={onToggle}
      />,
    );

    const control = screen.getByRole('switch', { name: /Biometric check-in only/ });
    expect(control).toHaveAttribute('aria-checked', 'false');

    await user.click(control);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  /** The whole row is the target, so the help text is part of its name. */
  it('includes the help text in the accessible name', () => {
    render(
      <SwitchRow
        label="Auto-lock"
        help="Desk staff can override once"
        checked
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole('switch', { name: /Desk staff can override once/ })).toBeVisible();
  });
});

describe('Field', () => {
  it('labels its control, so clicking the label focuses the input', async () => {
    const user = userEvent.setup();
    render(<Field label="Full name">{(props) => <TextInput {...props} />}</Field>);

    await user.click(screen.getByText('Full name'));
    expect(screen.getByLabelText('Full name')).toHaveFocus();
  });

  it('describes the control with its hint', () => {
    render(
      <Field label="GSTIN" hint="15 characters">
        {(props) => <TextInput {...props} />}
      </Field>,
    );
    expect(screen.getByLabelText('GSTIN')).toHaveAccessibleDescription('15 characters');
  });

  it('marks the control invalid and keeps the message reachable', () => {
    render(
      <Field label="GSTIN" hint="That is not a valid GSTIN" invalid>
        {(props) => <TextInput {...props} />}
      </Field>,
    );

    const input = screen.getByLabelText('GSTIN');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('That is not a valid GSTIN');
  });

  /**
   * Polite rather than `role="alert"`: forms with an error summary would
   * otherwise announce every problem twice, and inline validation fires while
   * someone is still typing.
   */
  it('announces an error politely rather than as an alert', () => {
    render(
      <Field label="GSTIN" hint="Wrong" invalid>
        {(props) => <TextInput {...props} />}
      </Field>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Wrong')).toHaveAttribute('aria-live', 'polite');
  });

  it('gives each field a unique id, so two on one page stay independent', () => {
    render(
      <>
        <Field label="First">{(props) => <TextInput {...props} />}</Field>
        <Field label="Second">{(props) => <TextInput {...props} />}</Field>
      </>,
    );

    expect(screen.getByLabelText('First').id).not.toBe(screen.getByLabelText('Second').id);
  });
});

describe('Meter', () => {
  /** The track is the presentational element; its only child is the fill. */
  function fillOf(container: HTMLElement): HTMLElement {
    const track = container.querySelector('[role="presentation"]');
    return track?.firstElementChild as HTMLElement;
  }

  it('fills proportionally', () => {
    const { container } = render(<Meter value={18} total={20} />);
    expect(fillOf(container)).toHaveStyle({ width: '90%' });
  });

  /** Zero is the one honest empty bar; everything else keeps a visible floor. */
  it('renders nothing at zero and a floor just above it', () => {
    const { container: empty } = render(<Meter value={0} total={20} />);
    expect(fillOf(empty)).toHaveStyle({ width: '0%' });

    const { container: tiny } = render(<Meter value={1} total={400} />);
    expect(fillOf(tiny)).toHaveStyle({ width: '2%' });
  });

  it('never overflows its track', () => {
    const { container } = render(<Meter value={25} total={20} />);
    expect(fillOf(container)).toHaveStyle({ width: '100%' });
  });

  /**
   * Presentational: every meter sits beside a text label that already states
   * the value, and a `progressbar` role would read the number twice per row.
   */
  it('is not announced as a progressbar', () => {
    render(<Meter value={5} total={10} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('StatusPill', () => {
  it('reports state without being focusable', () => {
    render(<StatusPill tone="warn">Overdue</StatusPill>);
    expect(screen.getByText('Overdue')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
