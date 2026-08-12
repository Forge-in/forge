'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { Gym, Invite, PlanName } from '@/lib/data/types';
import { useToast } from './toast-provider';

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export const TRIAL_OPTIONS = [7, 14, 21, 30] as const;
export type TrialLength = (typeof TRIAL_OPTIONS)[number];

export interface PlatformSettings {
  legalName: string;
  supportEmail: string;
  trialDays: TrialLength;
  autoSuspend: boolean;
  weeklyDigest: boolean;
  ownerBilling: boolean;
}

export type SettingsToggle = 'autoSuspend' | 'weeklyDigest' | 'ownerBilling';

export interface InviteForm {
  org: string;
  city: string;
  sites: number;
  plan: PlanName;
  owner: string;
  email: string;
  note: string;
}

/** 1-3 collect the invite, 4 is the confirmation. */
export type InviteStep = 1 | 2 | 3 | 4;

const EMPTY_FORM: InviteForm = {
  org: '',
  city: '',
  sites: 1,
  plan: 'Scale',
  owner: '',
  email: '',
  note: '',
};

const INITIAL_INVITES: Invite[] = [
  {
    id: 'iv1',
    org: 'Stonepath Gym',
    email: 'owner@stonepathgym.in',
    plan: 'Studio',
    sent: 'Sent 2 days ago',
    token: 'k7m2xq',
  },
  {
    id: 'iv2',
    org: 'Cadence Movement',
    email: 'hello@cadencemovement.in',
    plan: 'Scale',
    sent: 'Sent 5 days ago',
    token: 'b3n8ru',
  },
];

const INITIAL_SETTINGS: PlatformSettings = {
  legalName: 'Wrath Fitness Technologies Pvt Ltd',
  supportEmail: 'support@wrathfitness.com',
  trialDays: 14,
  autoSuspend: true,
  weeklyDigest: true,
  ownerBilling: false,
};

export const SIGNUP_BASE_URL = 'https://app.wrathfitness.com/join';

/** Deliberately permissive: reject obvious typos, never a valid address. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* -------------------------------------------------------------------------- */
/* Context                                                                    */
/* -------------------------------------------------------------------------- */

interface ConsoleContextValue {
  /* Invites */
  invites: Invite[];
  revokeInvite: (invite: Invite) => void;
  resendInvite: (invite: Invite) => void;

  /* Suspensions */
  isSuspended: (gymId: string) => boolean;
  toggleSuspension: (gym: Gym) => void;

  /* Settings */
  settings: PlatformSettings;
  updateSetting: <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => void;
  flipToggle: (key: SettingsToggle) => void;

  /* Invite drawer */
  inviteOpen: boolean;
  inviteStep: InviteStep;
  form: InviteForm;
  sentLink: string;
  sentTo: string;
  openInvite: () => void;
  closeInvite: () => void;
  setFormField: <K extends keyof InviteForm>(key: K, value: InviteForm[K]) => void;
  goBack: () => void;
  /** Advances the wizard. Returns true when the last step completed. */
  goNext: () => boolean;
  startAnother: () => void;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

function makeToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 6);
  }
  return Math.random().toString(36).slice(2, 8);
}

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const { notify } = useToast();

  const [invites, setInvites] = useState<Invite[]>(INITIAL_INVITES);
  const [suspended, setSuspended] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<PlatformSettings>(INITIAL_SETTINGS);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteStep, setInviteStep] = useState<InviteStep>(1);
  const [form, setForm] = useState<InviteForm>(EMPTY_FORM);
  const [sentLink, setSentLink] = useState('');
  const [sentTo, setSentTo] = useState('');

  /* --- Invites ---------------------------------------------------------- */

  const revokeInvite = useCallback(
    (invite: Invite) => {
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      notify('Invite revoked');
    },
    [notify],
  );

  const resendInvite = useCallback(
    (invite: Invite) => notify(`Invite resent to ${invite.email}`),
    [notify],
  );

  /* --- Suspensions ------------------------------------------------------ */

  const isSuspended = useCallback((gymId: string) => suspended[gymId] === true, [suspended]);

  const toggleSuspension = useCallback(
    (gym: Gym) => {
      const next = suspended[gym.id] !== true;
      setSuspended((current) => ({ ...current, [gym.id]: next }));
      notify(next ? `${gym.name} suspended` : `${gym.name} reinstated`);
    },
    [suspended, notify],
  );

  /* --- Settings --------------------------------------------------------- */

  const updateSetting = useCallback(
    <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const flipToggle = useCallback((key: SettingsToggle) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  /* --- Invite wizard ---------------------------------------------------- */

  /**
   * The step is mirrored in a ref because the wizard's transitions branch on it.
   * Two clicks landing in the same tick both read the same stale state value, and
   * on the send step that means two invites for one intent. The ref advances
   * synchronously, so the second click sees the step it is really on.
   */
  const stepRef = useRef<InviteStep>(1);

  const setStep = useCallback((next: InviteStep) => {
    stepRef.current = next;
    setInviteStep(next);
  }, []);

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setSentLink('');
    setSentTo('');
  }, []);

  const openInvite = useCallback(() => {
    setInviteOpen(true);
    setStep(1);
  }, [setStep]);

  const closeInvite = useCallback(() => {
    // Read the step before resetting it — `setStep` overwrites the ref.
    const wasComplete = stepRef.current === 4;

    setInviteOpen(false);
    setStep(1);

    // Closing a finished invite must not leave the sent organisation in the form:
    // reopening would prefill it and invite the same owner twice. Closing part-way
    // through keeps the draft, which is what someone stepping away expects.
    if (wasComplete) resetForm();
  }, [setStep, resetForm]);

  const setFormField = useCallback(<K extends keyof InviteForm>(key: K, value: InviteForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const startAnother = useCallback(() => {
    setStep(1);
    resetForm();
  }, [setStep, resetForm]);

  const goBack = useCallback(() => {
    const step = stepRef.current;

    if (step === 1) {
      closeInvite();
      return;
    }
    if (step < 4) {
      setStep((step - 1) as InviteStep);
    }
  }, [closeInvite, setStep]);

  const goNext = useCallback((): boolean => {
    const inviteStep = stepRef.current;

    if (inviteStep === 1) {
      if (!form.org.trim()) {
        notify('Give the organisation a name first');
        return false;
      }
      if (!Number.isFinite(form.sites) || form.sites < 1) {
        notify('An organisation needs at least one site');
        return false;
      }
      setStep(2);
      return false;
    }

    if (inviteStep === 2) {
      const email = form.email.trim();
      if (!email) {
        notify('An email address is required');
        return false;
      }
      if (!EMAIL_PATTERN.test(email)) {
        notify('That email address does not look right');
        return false;
      }
      setStep(3);
      return false;
    }

    if (inviteStep === 3) {
      const token = makeToken();
      const email = form.email.trim();

      setInvites((current) => [
        {
          id: `iv-${Date.now()}`,
          org: form.org.trim(),
          email,
          plan: form.plan,
          sent: 'Sent just now',
          token,
        },
        ...current,
      ]);
      setSentLink(`${SIGNUP_BASE_URL}/${token}`);
      setSentTo(email);
      setStep(4);
      return false;
    }

    // Step 4 — "Done". The caller navigates to the directory.
    setInviteOpen(false);
    setStep(1);
    resetForm();
    return true;
  }, [form, notify, setStep, resetForm]);

  const value = useMemo<ConsoleContextValue>(
    () => ({
      invites,
      revokeInvite,
      resendInvite,
      isSuspended,
      toggleSuspension,
      settings,
      updateSetting,
      flipToggle,
      inviteOpen,
      inviteStep,
      form,
      sentLink,
      sentTo,
      openInvite,
      closeInvite,
      setFormField,
      goBack,
      goNext,
      startAnother,
    }),
    [
      invites,
      revokeInvite,
      resendInvite,
      isSuspended,
      toggleSuspension,
      settings,
      updateSetting,
      flipToggle,
      inviteOpen,
      inviteStep,
      form,
      sentLink,
      sentTo,
      openInvite,
      closeInvite,
      setFormField,
      goBack,
      goNext,
      startAnother,
    ],
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleContextValue {
  const context = useContext(ConsoleContext);
  if (!context) throw new Error('useConsole must be used inside <ConsoleProvider>');
  return context;
}
