'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';
import { MEMBERSHIP_PLANS, PAY_MODES, TRAINER_OPTIONS, type PayMode } from '@/lib/data';
import { rupees } from '@/lib/format';
import {
  REGISTRATION_FIELD_SPECS,
  findPlan,
  findTrainer,
  invalidFields,
  registrationAmount,
} from '@/lib/registration';
import { Action, Field, SelectInput, TextInput } from '@/components/ui/controls';
import { useOwner } from './owner-provider';

/**
 * "Register at the desk" — the console's one modal, and its only screen that
 * creates something.
 *
 * The dialog behaviour is written out rather than pulled from a library because
 * this is the only modal in the app and the requirements are small and exact:
 *
 *   - `role="dialog"` + `aria-modal` + a labelled title, so it announces as a
 *     dialog rather than as loose content appended to the page;
 *   - focus moves in on open and RETURNS to the button that opened it on close,
 *     or a keyboard user is dumped at the top of the document;
 *   - Escape closes it;
 *   - Tab cycles inside it, because a modal a keyboard user can tab out of is
 *     not modal;
 *   - the page behind it does not scroll.
 */
export function RegisterDialog() {
  const {
    registerOpen,
    closeRegister,
    registration,
    registrationErrors,
    setRegistrationField,
    submitRegistration,
  } = useOwner();

  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  /** The element focus came from, so it can be handed back on close. */
  const openerRef = useRef<HTMLElement | null>(null);

  /* --- Focus, scroll lock and Escape ------------------------------------ */

  useEffect(() => {
    if (!registerOpen) return;

    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus the first field rather than the panel: the owner's next act is
    // always to type a name, and it makes the dialog's purpose immediately
    // audible to a screen reader.
    firstFieldRef.current?.focus();

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
      // Guard the node still being in the document: a route change can unmount
      // the opener while the dialog is open.
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [registerOpen]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRegister();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      // Wrap at both ends. Without this, Tab from the last control lands on the
      // browser chrome and the next Tab is inside the page behind the scrim.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeRegister],
  );

  if (!registerOpen) return null;

  /* --- Derived ---------------------------------------------------------- */

  const invalid = invalidFields(registrationErrors);
  const amount = registrationAmount(registration);
  const plan = findPlan(registration.planId);
  const trainer = findTrainer(registration.trainerId);

  const amountLabel =
    registration.mode === 'Pay later'
      ? 'Recorded as pending — reminders start tomorrow'
      : plan
        ? amount > 0
          ? `Collecting now by ${registration.mode}`
          : 'No payment due on a trial'
        : 'Select a plan to see the amount';

  /** The first error for a field, so a control shows one message and not three. */
  const errorFor = (field: string) =>
    registrationErrors.find((error) => error.field === field)?.message;

  return (
    <div
      className="ow-fade-in bg-scrim fixed inset-0 z-40 flex items-center justify-center p-6"
      // Clicking the backdrop closes; clicking the panel must not bubble up to
      // it, which is why the panel stops propagation rather than the backdrop
      // testing the event target (that breaks on a drag that ends outside).
      onMouseDown={closeRegister}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
        className="bg-surface border-line-strong flex max-h-full w-[660px] max-w-full flex-col overflow-hidden rounded-[30px] border shadow-[0_30px_80px_var(--ow-shadow)]"
      >
        <div className="border-line flex shrink-0 items-start justify-between gap-4 border-b px-[30px] pt-[26px] pb-5">
          <div className="flex flex-col gap-2">
            <p className="t-eyebrow text-gold">New member</p>
            <h2 id={titleId} className="t-title text-[28px]">
              Register at the desk
            </h2>
          </div>
          <button
            type="button"
            onClick={closeRegister}
            className="bg-raise border-line-strong text-sub ow-hoverable flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border"
          >
            <span aria-hidden="true" className="t-mono-xl">
              ×
            </span>
            <span className="sr-only">Close</span>
          </button>
        </div>

        {/*
          A real <form>, so Enter submits from any field — the desk fills this in
          on a keyboard with a member waiting, and reaching for the mouse to
          finish is the difference between fast and tolerable.
        */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitRegistration();
          }}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <div className="ow-no-scrollbar flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[30px] py-6">
            {registrationErrors.length > 0 ? (
              <div
                role="alert"
                className="bg-warn-soft border-warn flex flex-col gap-1.5 rounded-[14px] border px-4 py-[13px]"
              >
                {registrationErrors.map((error) => (
                  <p
                    key={`${error.field}-${error.message}`}
                    className="t-mono text-warn leading-[1.5]"
                  >
                    — {error.message}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              {REGISTRATION_FIELD_SPECS.map((spec, index) => {
                const message = errorFor(spec.key);
                return (
                  <Field
                    key={spec.key}
                    label={spec.label}
                    hint={message ?? spec.hint}
                    invalid={invalid.has(spec.key)}
                  >
                    {(props) => (
                      <TextInput
                        {...props}
                        ref={index === 0 ? firstFieldRef : undefined}
                        name={spec.key}
                        value={registration[spec.key]}
                        placeholder={spec.placeholder}
                        inputMode={spec.inputMode}
                        autoComplete={spec.autoComplete}
                        onChange={(event) => setRegistrationField(spec.key, event.target.value)}
                        className="h-[46px]"
                      />
                    )}
                  </Field>
                );
              })}

              <Field
                label="Plan"
                hint={errorFor('plan') ?? 'Pro-rated from the joining date'}
                invalid={invalid.has('plan')}
              >
                {(props) => (
                  <SelectInput
                    {...props}
                    name="plan"
                    value={registration.planId}
                    onChange={(event) => setRegistrationField('planId', event.target.value)}
                    className="h-[46px]"
                  >
                    <option value="">Select a plan…</option>
                    {MEMBERSHIP_PLANS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.amount > 0
                          ? `${option.label} — ${rupees(option.amount)}`
                          : `${option.label} — free`}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>

              <Field
                label="Assign trainer"
                hint={trainer?.unavailableNote ?? 'Trainer can be changed any time'}
                invalid={Boolean(trainer?.unavailableNote)}
              >
                {(props) => (
                  <SelectInput
                    {...props}
                    name="trainer"
                    value={registration.trainerId}
                    onChange={(event) => setRegistrationField('trainerId', event.target.value)}
                    className="h-[46px]"
                  >
                    {TRAINER_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </SelectInput>
                )}
              </Field>
            </div>

            <fieldset className="bg-raise border-line flex flex-col gap-3 rounded-[18px] border px-[18px] py-4">
              <legend className="t-field-label">Fee collection</legend>

              <div className="flex flex-wrap items-center gap-2">
                {PAY_MODES.map((mode: PayMode) => {
                  const selected = registration.mode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setRegistrationField('mode', mode)}
                      className={cn(
                        't-pill ow-hoverable flex h-9 shrink-0 cursor-pointer items-center rounded-[18px] border px-4',
                        selected
                          ? 'bg-gold-soft border-gold text-gold'
                          : 'bg-surface border-line-strong text-sub',
                      )}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>

              <div className="border-line flex items-center justify-between gap-3 border-t pt-3">
                <p className="t-sm text-sub">{amountLabel}</p>
                {/* `aria-live` so switching plan or mode announces the new figure —
                    it is the number that determines what is taken at the desk. */}
                <p aria-live="polite" className="t-display text-gold text-2xl">
                  {plan ? rupees(amount) : '—'}
                </p>
              </div>
            </fieldset>
          </div>

          <div className="border-line flex shrink-0 items-center justify-between gap-4 border-t px-[30px] py-5">
            <p className="t-mono-xs text-muted">
              ID proof can be uploaded later — access stays limited until it is.
            </p>
            <div className="flex items-center gap-[10px]">
              <Action
                variant="ghost"
                onClick={closeRegister}
                className="t-sm h-11 rounded-[22px] px-5 font-medium"
              >
                Cancel
              </Action>
              <Action type="submit" variant="gold" className="t-base h-11 rounded-[22px] px-[26px]">
                Register &amp; collect
              </Action>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
