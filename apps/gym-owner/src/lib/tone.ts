import type {
  DeviceState,
  DoorEvent,
  MemberStatus,
  PaymentState,
  SessionStatus,
  StaffStatus,
  TicketState,
  Tone,
} from './data/types';

/**
 * Status → colour, in exactly one place.
 *
 * Every lookup below is a `Record` over a closed union rather than a chain of
 * ternaries. That is the whole point: adding a status to `types.ts` breaks this
 * file at compile time and names every surface that has to learn about it,
 * where a ternary chain would silently fall through to the default and ship a
 * grey badge for a state that means "money is at risk".
 */

/* -------------------------------------------------------------------------- */
/* Tone → utility classes                                                     */
/* -------------------------------------------------------------------------- */

/** Badge surface: soft background plus its matching foreground. */
export const TONE_PILL: Readonly<Record<Tone, string>> = {
  neutral: 'bg-raise text-sub',
  gold: 'bg-gold-soft text-gold',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
};

/** Text-only, for a figure that carries its own status. */
export const TONE_TEXT: Readonly<Record<Tone, string>> = {
  neutral: 'text-ink',
  gold: 'text-gold',
  warn: 'text-warn',
  ok: 'text-ok',
};

/** The muted variant, for a supporting line rather than a headline figure. */
export const TONE_TEXT_SOFT: Readonly<Record<Tone, string>> = {
  neutral: 'text-sub',
  gold: 'text-gold',
  warn: 'text-warn',
  ok: 'text-ok',
};

/**
 * Meter and bar fills.
 *
 * `neutral` is a flat line colour rather than a gradient: only a figure the
 * owner should look at earns the gold ramp, and a chart where every bar is gold
 * has no focal point at all.
 */
export const TONE_FILL: Readonly<Record<Tone, string>> = {
  neutral: 'bg-line-strong',
  gold: 'ow-gold-fill',
  warn: 'bg-warn',
  ok: 'bg-ok',
};

/** Vertical fills, for column charts. */
export const TONE_FILL_V: Readonly<Record<Tone, string>> = {
  neutral: 'bg-line-strong',
  gold: 'ow-gold-fill-v',
  warn: 'bg-warn',
  ok: 'bg-ok',
};

/** A 8px legend square or status dot. */
export const TONE_DOT: Readonly<Record<Tone, string>> = {
  neutral: 'bg-line-strong',
  gold: 'bg-gold',
  warn: 'bg-warn',
  ok: 'bg-ok',
};

/** Border, for a card whose whole edge carries the state. */
export const TONE_BORDER: Readonly<Record<Tone, string>> = {
  neutral: 'border-line',
  gold: 'border-gold',
  warn: 'border-warn',
  ok: 'border-ok',
};

/* -------------------------------------------------------------------------- */
/* Domain status → tone                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A member's standing.
 *
 * `Expiring` is gold rather than warn deliberately: it is an opportunity to
 * renew, not a failure. `Unverified` is warn because the member is being turned
 * away at the door.
 */
export const MEMBER_STATUS_TONE: Readonly<Record<MemberStatus, Tone>> = {
  Active: 'ok',
  Overdue: 'warn',
  Expiring: 'gold',
  Trial: 'neutral',
  Frozen: 'neutral',
  Unverified: 'warn',
};

export const STAFF_STATUS_TONE: Readonly<Record<StaffStatus, Tone>> = {
  'On floor': 'ok',
  'On leave': 'warn',
  'Off shift': 'neutral',
};

/**
 * A scheduled session.
 *
 * `Waitlist` is neutral, not warn: a full class with people queuing is a good
 * problem, and colouring it like an incident buries the ones that are.
 */
export const SESSION_STATUS_TONE: Readonly<Record<SessionStatus, Tone>> = {
  Running: 'gold',
  Scheduled: 'neutral',
  Unassigned: 'warn',
  Cancelled: 'warn',
  Waitlist: 'neutral',
  'Low fill': 'neutral',
  Confirmed: 'neutral',
  'Fees due': 'warn',
};

export const DOOR_EVENT_TONE: Readonly<Record<DoorEvent, Tone>> = {
  In: 'ok',
  Out: 'neutral',
  Guest: 'neutral',
  Denied: 'warn',
  Error: 'warn',
};

export const DEVICE_STATE_TONE: Readonly<Record<DeviceState, Tone>> = {
  Active: 'ok',
  'On leave': 'neutral',
  Stale: 'warn',
  Invited: 'neutral',
};

export const PAYMENT_STATE_TONE: Readonly<Record<PaymentState, Tone>> = {
  Paid: 'ok',
  Failed: 'warn',
  Refunded: 'neutral',
};

export const TICKET_STATE_TONE: Readonly<Record<TicketState, Tone>> = {
  Open: 'warn',
  'In review': 'gold',
  Planned: 'gold',
  'Fix shipped': 'ok',
  Resolved: 'ok',
};
