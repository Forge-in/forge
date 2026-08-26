'use client';

import { useOwner } from '@/components/console/owner-provider';
import { Action, Field, SwitchRow, TextInput } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { GYM_FIELD_SPECS, OPERATING_RULE_SPECS } from '@/lib/data';
import { isGymProfileValid, validateGymField } from '@/lib/gym-profile';

/**
 * The gym's own record.
 *
 * Every field here appears on a member invoice or drives an operating rule, so
 * each is validated as it is typed and Save is genuinely disabled while
 * anything is wrong — the failure mode this prevents is a malformed GSTIN
 * reaching four hundred invoices before anyone notices.
 */
export function GymProfileForm() {
  const { gym, gymDirty, setGymField, saveGym, discardGym } = useOwner();

  const valid = isGymProfileValid(gym, GYM_FIELD_SPECS);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        saveGym();
      }}
      noValidate
      className="flex flex-col gap-5"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="t-section-lg">Gym profile</h2>
        {/*
          `aria-live` so the dirty state is announced when it changes rather than
          only being visible. It is the only signal that Save has work to do.
        */}
        <p aria-live="polite" className={cn('t-mono-xs', gymDirty ? 'text-warn' : 'text-muted')}>
          {gymDirty ? 'Unsaved changes' : 'All changes saved'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {GYM_FIELD_SPECS.map((spec) => {
          const state = validateGymField(spec.key, gym[spec.key], spec.hint);

          return (
            <Field key={spec.key} label={spec.label} hint={state.hint} invalid={state.invalid}>
              {(props) => (
                <TextInput
                  {...props}
                  name={spec.key}
                  value={gym[spec.key]}
                  onChange={(event) => setGymField(spec.key, event.target.value)}
                  inputMode={spec.key === 'capacity' ? 'numeric' : undefined}
                  autoComplete={
                    spec.key === 'email' ? 'email' : spec.key === 'phone' ? 'tel' : 'off'
                  }
                />
              )}
            </Field>
          );
        })}
      </div>

      <div className="flex items-center gap-[10px] pt-1">
        <Action
          type="submit"
          variant="gold"
          disabled={!valid || !gymDirty}
          className="t-base h-[42px] rounded-[21px] px-6"
        >
          Save changes
        </Action>
        <Action
          variant="ghost"
          onClick={discardGym}
          disabled={!gymDirty}
          className="t-sm h-[42px] rounded-[21px] px-5 font-medium"
        >
          Discard
        </Action>
      </div>
    </form>
  );
}

/**
 * The operating rules.
 *
 * These change how the front door behaves, so each row states the consequence
 * rather than the setting — "Turning this on disables QR check-in for everyone"
 * is the sentence that stops a bad Tuesday.
 */
export function OperatingRulesList() {
  const { rules, toggleRule } = useOwner();

  return (
    <div className="flex flex-col">
      <h2 className="t-section-lg pb-[10px]">Operating rules</h2>
      {OPERATING_RULE_SPECS.map((spec) => (
        <SwitchRow
          key={spec.key}
          label={spec.label}
          help={spec.meta}
          checked={rules[spec.key]}
          onToggle={() => toggleRule(spec.key, spec.label)}
          className="py-[14px]"
        />
      ))}
    </div>
  );
}
