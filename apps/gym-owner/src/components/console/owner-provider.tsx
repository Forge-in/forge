'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_GYM_PROFILE,
  DEFAULT_JOINING_DATE,
  DEFAULT_OPERATING_RULES,
  DEFAULT_TRAINER_PERMISSIONS,
  GYM_FIELDS,
  INITIAL_TICKETS,
  NEXT_TICKET_NUMBER,
  TICKET_BODY_MIN,
  type GymField,
  type GymProfile,
  type OperatingRule,
  type OperatingRules,
  type Ticket,
  type TicketCategory,
  type TicketPriority,
  type TrainerPermission,
} from '@/lib/data';
import { firstName, rupees } from '@/lib/format';
import {
  canSubmitRegistration,
  findPlan,
  registrationAmount,
  validateRegistration,
  type RegistrationError,
  type RegistrationForm,
} from '@/lib/registration';
import { useToast } from './toast-provider';

/**
 * Session-level console state.
 *
 * Everything here is either shared across routes or must survive a navigation.
 * The register dialog is opened from the top bar, which lives in the layout, so
 * it cannot be page state. The rest — profile edits, operating rules, trainer
 * permissions, reminders already sent, filed reports — persists because an
 * owner who toggles a rule, checks the fees screen and comes back would
 * otherwise find their change silently reverted.
 *
 * It is DELIBERATELY not persisted beyond the tab. These writes have no
 * endpoint yet; putting them in localStorage would make a demo look like a
 * commitment, and the first real mutation would then have to reconcile with a
 * stale local copy.
 *
 * ONE RULE THROUGHOUT THIS FILE: no side effect ever runs inside a state
 * updater. React may invoke an updater twice — it does so in Strict Mode by
 * design — so a `notify()` in there fires two toasts in development, and is a
 * latent double-write once these actions reach a real endpoint. The decision is
 * made in the handler, from the values that render closed over, and `setState`
 * only ever computes the next value.
 */

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface TicketDraft {
  category: TicketCategory;
  priority: TicketPriority;
  subject: string;
  body: string;
}

export type TicketField = keyof TicketDraft;

const EMPTY_TICKET: TicketDraft = {
  category: 'Bug report',
  priority: 'Normal',
  subject: '',
  body: '',
};

const EMPTY_REGISTRATION: RegistrationForm = {
  name: '',
  phone: '',
  email: '',
  dob: '',
  address: '',
  start: DEFAULT_JOINING_DATE,
  planId: '',
  trainerId: 'none',
  mode: 'UPI',
};

interface OwnerContextValue {
  /* Register dialog */
  registerOpen: boolean;
  openRegister: () => void;
  closeRegister: () => void;
  registration: RegistrationForm;
  registrationErrors: readonly RegistrationError[];
  setRegistrationField: <K extends keyof RegistrationForm>(
    key: K,
    value: RegistrationForm[K],
  ) => void;
  submitRegistration: () => void;

  /* Fee reminders */
  isReminded: (id: string) => boolean;
  remind: (id: string, name: string) => void;
  remindAll: (rows: readonly { id: string; name: string }[]) => void;

  /* Gym profile */
  gym: GymProfile;
  gymDirty: boolean;
  setGymField: (key: GymField, value: string) => void;
  saveGym: () => void;
  discardGym: () => void;

  /* Operating rules */
  rules: OperatingRules;
  toggleRule: (key: OperatingRule, label: string) => void;

  /* Trainer app */
  permissions: Record<TrainerPermission, boolean>;
  togglePermission: (key: TrainerPermission, label: string) => void;

  /* Subscription */
  autoRenew: boolean;
  toggleAutoRenew: () => void;

  /* Support */
  tickets: readonly Ticket[];
  ticketDraft: TicketDraft;
  ticketError: string;
  setTicketField: (key: TicketField, value: string) => void;
  submitTicket: () => void;
  clearTicket: () => void;
}

const OwnerContext = createContext<OwnerContextValue | null>(null);

/* -------------------------------------------------------------------------- */
/* Provider                                                                   */
/* -------------------------------------------------------------------------- */

export function OwnerProvider({ children }: { children: React.ReactNode }) {
  const { notify } = useToast();

  /* --- Register dialog -------------------------------------------------- */

  const [registerOpen, setRegisterOpen] = useState(false);
  const [registration, setRegistration] = useState<RegistrationForm>(EMPTY_REGISTRATION);
  const [registrationErrors, setRegistrationErrors] = useState<readonly RegistrationError[]>([]);

  /**
   * Whether a confirmable warning has already been shown and may be overridden.
   *
   * A ref, and one of only two in this file, because it is NOT derived from
   * anything rendered — nothing on screen changes when it flips, and modelling
   * it as state would re-render the whole console to record that the owner has
   * seen a message. It is only ever written inside an event handler.
   */
  const warnedRef = useRef(false);

  const openRegister = useCallback(() => {
    setRegisterOpen(true);
    setRegistrationErrors([]);
    warnedRef.current = false;
  }, []);

  /**
   * Closing KEEPS the draft.
   *
   * Someone half-way through a registration who steps away to check a plan
   * price expects their typing to still be there. The form is only cleared on a
   * successful submit, where keeping it would invite registering the same
   * person twice.
   */
  const closeRegister = useCallback(() => {
    setRegisterOpen(false);
    setRegistrationErrors([]);
    warnedRef.current = false;
  }, []);

  const setRegistrationField = useCallback(
    <K extends keyof RegistrationForm>(key: K, value: RegistrationForm[K]) => {
      const next = { ...registration, [key]: value };
      setRegistration(next);

      /**
       * Re-validate live, but only ONCE THE OWNER HAS ALREADY SUBMITTED. Before
       * that, marking a half-typed phone number invalid is scolding someone for
       * not having finished. After it, errors that clear as they are fixed are
       * the whole point.
       */
      if (registrationErrors.length > 0) setRegistrationErrors(validateRegistration(next));
    },
    [registration, registrationErrors],
  );

  const submitRegistration = useCallback(() => {
    const errors = validateRegistration(registration);

    if (!canSubmitRegistration(errors, warnedRef.current)) {
      setRegistrationErrors(errors);
      /*
       * Only a confirmable-ONLY failure arms the override. If a blocking error
       * is also present, the owner has not yet been shown the warning on its
       * own, and consuming their confirmation here would let the next click
       * through without them ever having read it.
       */
      warnedRef.current = errors.length > 0 && errors.every((error) => error.confirmable);
      return;
    }

    const name = registration.name.trim();
    const amount = registrationAmount(registration);
    const plan = findPlan(registration.planId);

    setRegisterOpen(false);
    setRegistrationErrors([]);
    warnedRef.current = false;
    setRegistration(EMPTY_REGISTRATION);

    const settlement =
      registration.mode === 'Pay later'
        ? 'fee marked pending'
        : amount > 0
          ? `${rupees(amount)} collected by ${registration.mode}`
          : `${plan?.label ?? 'Trial'} started — nothing to collect`;

    notify(`${name} registered · ${settlement}`);
  }, [registration, notify]);

  /* --- Fee reminders ---------------------------------------------------- */

  const [reminded, setReminded] = useState<Record<string, boolean>>({});

  const isReminded = useCallback((id: string) => reminded[id] === true, [reminded]);

  const remind = useCallback(
    (id: string, name: string) => {
      setReminded((current) => ({ ...current, [id]: true }));
      notify(`WhatsApp + SMS reminder sent to ${firstName(name)}`);
    },
    [notify],
  );

  const remindAll = useCallback(
    (rows: readonly { id: string; name: string }[]) => {
      // An empty bucket is reachable — "Upcoming" clears once everything is
      // collected — and a button that silently does nothing is worse than one
      // that says so.
      if (rows.length === 0) {
        notify('Nothing to remind in this bucket');
        return;
      }

      setReminded((current) => {
        const next = { ...current };
        for (const row of rows) next[row.id] = true;
        return next;
      });
      notify(`Reminders queued for ${rows.length} members`);
    },
    [notify],
  );

  /* --- Gym profile ------------------------------------------------------ */

  const [gym, setGym] = useState<GymProfile>(DEFAULT_GYM_PROFILE);
  const [savedGym, setSavedGym] = useState<GymProfile>(DEFAULT_GYM_PROFILE);

  /**
   * Derived by comparison, not tracked with a boolean.
   *
   * A `dirty` flag set on every keystroke stays true after the owner types a
   * character and deletes it, so "Unsaved changes" sits there accusing them of
   * a change they undid — and "Discard" then appears to do nothing.
   */
  const gymDirty = useMemo(
    () => GYM_FIELDS.some((key) => savedGym[key] !== gym[key]),
    [gym, savedGym],
  );

  const setGymField = useCallback((key: GymField, value: string) => {
    setGym((current) => ({ ...current, [key]: value }));
  }, []);

  const saveGym = useCallback(() => {
    // Nothing to save is not an error, but it is worth saying: an owner who
    // clicks Save and sees no feedback assumes it failed.
    if (!gymDirty) {
      notify('Nothing to save');
      return;
    }

    setSavedGym(gym);
    notify('Gym profile updated · members see the new details immediately');
  }, [gym, gymDirty, notify]);

  const discardGym = useCallback(() => {
    setGym(savedGym);
    notify('Changes discarded');
  }, [savedGym, notify]);

  /* --- Operating rules -------------------------------------------------- */

  const [rules, setRules] = useState<OperatingRules>(DEFAULT_OPERATING_RULES);

  const toggleRule = useCallback(
    (key: OperatingRule, label: string) => {
      const next = !rules[key];
      setRules({ ...rules, [key]: next });
      notify(`${label} · turned ${next ? 'on' : 'off'}`);
    },
    [rules, notify],
  );

  /* --- Trainer permissions ---------------------------------------------- */

  const [permissions, setPermissions] = useState<Record<TrainerPermission, boolean>>(
    DEFAULT_TRAINER_PERMISSIONS,
  );

  const togglePermission = useCallback(
    (key: TrainerPermission, label: string) => {
      const next = !permissions[key];
      setPermissions({ ...permissions, [key]: next });
      notify(`${label} ${next ? 'shared with trainers' : 'hidden from trainers'}`);
    },
    [permissions, notify],
  );

  /* --- Subscription ----------------------------------------------------- */

  const [autoRenew, setAutoRenew] = useState(true);

  const toggleAutoRenew = useCallback(() => {
    const next = !autoRenew;
    setAutoRenew(next);
    notify(next ? 'Auto-renew on' : 'Auto-renew off · you will be reminded 7 days before expiry');
  }, [autoRenew, notify]);

  /* --- Support ---------------------------------------------------------- */

  const [tickets, setTickets] = useState<readonly Ticket[]>(INITIAL_TICKETS);
  const [ticketDraft, setTicketDraft] = useState<TicketDraft>(EMPTY_TICKET);
  const [ticketError, setTicketError] = useState('');

  /**
   * A monotonic counter, not `INITIAL + tickets.length`.
   *
   * The list is prepended to and could be filtered later; a length-derived id
   * reissues a number the moment one is ever removed, and two reports sharing
   * an id is the kind of bug that only surfaces inside the support queue. A ref
   * because nothing renders it — it is the next id, not the current one.
   */
  const ticketSequence = useRef(NEXT_TICKET_NUMBER);

  const setTicketField = useCallback((key: TicketField, value: string) => {
    setTicketDraft((current) => ({ ...current, [key]: value }));
    // The error names a specific field; editing anything makes it stale.
    setTicketError('');
  }, []);

  const clearTicket = useCallback(() => {
    setTicketDraft(EMPTY_TICKET);
    setTicketError('');
  }, []);

  const submitTicket = useCallback(() => {
    const subject = ticketDraft.subject.trim();
    const body = ticketDraft.body.trim();

    if (!subject) {
      setTicketError('Add a one-line subject so we can route this to the right team.');
      return;
    }

    if (body.length < TICKET_BODY_MIN) {
      setTicketError(
        `Tell us a little more — at least a sentence about what happened (${body.length}/${TICKET_BODY_MIN} characters).`,
      );
      return;
    }

    const id = `WR-${ticketSequence.current}`;
    ticketSequence.current += 1;

    setTickets((current) => [
      {
        id,
        subject,
        // "High · blocks daily work" -> "high": the list shows the severity, not
        // the explanation that helped the owner choose it.
        meta: `${ticketDraft.category} · ${ticketDraft.priority.split(' ·')[0]?.toLowerCase() ?? 'normal'} · opened today`,
        state: 'Open',
      },
      ...current,
    ]);

    setTicketDraft(EMPTY_TICKET);
    setTicketError('');
    notify(`Report ${id} sent · we reply on your registered email`);
  }, [ticketDraft, notify]);

  /* --- Value ------------------------------------------------------------ */

  const value = useMemo<OwnerContextValue>(
    () => ({
      registerOpen,
      openRegister,
      closeRegister,
      registration,
      registrationErrors,
      setRegistrationField,
      submitRegistration,
      isReminded,
      remind,
      remindAll,
      gym,
      gymDirty,
      setGymField,
      saveGym,
      discardGym,
      rules,
      toggleRule,
      permissions,
      togglePermission,
      autoRenew,
      toggleAutoRenew,
      tickets,
      ticketDraft,
      ticketError,
      setTicketField,
      submitTicket,
      clearTicket,
    }),
    [
      registerOpen,
      openRegister,
      closeRegister,
      registration,
      registrationErrors,
      setRegistrationField,
      submitRegistration,
      isReminded,
      remind,
      remindAll,
      gym,
      gymDirty,
      setGymField,
      saveGym,
      discardGym,
      rules,
      toggleRule,
      permissions,
      togglePermission,
      autoRenew,
      toggleAutoRenew,
      tickets,
      ticketDraft,
      ticketError,
      setTicketField,
      submitTicket,
      clearTicket,
    ],
  );

  return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>;
}

export function useOwner(): OwnerContextValue {
  const context = useContext(OwnerContext);
  if (!context) throw new Error('useOwner must be used inside <OwnerProvider>');
  return context;
}

/**
 * The toast a not-yet-wired action fires.
 *
 * Every "Export", "Collect" and "Revoke" in the console has no endpoint behind
 * it. Routing them through one named hook keeps that honest and makes the set
 * of pending integrations a single grep, rather than scattering `notify(...)`
 * calls that look identical to the ones backed by real state.
 */
export function useDemoAction(): (message: string) => void {
  const { notify } = useToast();
  return notify;
}
