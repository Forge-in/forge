/**
 * The owner console's domain shapes.
 *
 * These describe what a thing IS, never how it looks. The source design carries
 * a colour on every row — `pillBg`, `capFill`, `dueFg` — which is fine for a
 * static mock and wrong for an application: it puts a palette decision in the
 * data, so a theme change becomes a data migration and a status can be styled
 * two different ways in two different tables without anything failing.
 *
 * Here the data carries a *status*, and `lib/tone.ts` maps a status to a tone
 * exactly once. Add a status and TypeScript names every mapping that has to
 * learn about it.
 */

/* -------------------------------------------------------------------------- */
/* Presentation vocabulary                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The four meanings any coloured surface in the console can carry.
 *
 * `gold` is the brand's "notable", not "good" — a full class and a renewing
 * plan are both gold. `ok` is specifically "nothing to do here".
 */
export const TONES = ['neutral', 'gold', 'warn', 'ok'] as const;
export type Tone = (typeof TONES)[number];

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

export const MEMBER_STATUSES = [
  'Active',
  'Overdue',
  'Expiring',
  'Trial',
  'Frozen',
  'Unverified',
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** The chips above the member table: every status, plus a cross-cutting one. */
export const MEMBER_FILTERS = ['All', 'Dues', ...MEMBER_STATUSES] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

export interface Member {
  id: string;
  name: string;
  /** Stored in the display grouping the desk reads it in: "98204 11238". */
  phone: string;
  plan: string;
  planMeta: string;
  status: MemberStatus;
  /** Attendance over the rolling 30 days, 0-100. `0` means a frozen membership. */
  attendance: number;
  /** Outstanding balance in rupees. `0` means nothing owed. */
  due: number;
  dueMeta: string;
  lastSeen: string;
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

export const STAFF_GROUPS = ['Trainers', 'Front desk', 'Cleaning', 'Manager'] as const;
export type StaffGroup = (typeof STAFF_GROUPS)[number];

export const STAFF_FILTERS = ['All', ...STAFF_GROUPS] as const;
export type StaffFilter = (typeof STAFF_FILTERS)[number];

export const STAFF_STATUSES = ['On floor', 'On leave', 'Off shift'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  group: StaffGroup;
  status: StaffStatus;
  shift: string;
  access: string;
  /** Trainer-app pairing, or null for staff with no app seat. */
  device: string | null;
  attendance: string;
  /** A condition the owner has to act on. Raises the card's border. */
  warning?: string;
}

export interface ShiftBar {
  name: string;
  role: string;
  /** Fractions of the 5am-11pm day the bar spans, both 0..1. */
  start: number;
  end: number;
  label: string;
  /** A gap in cover the owner has to fill. */
  uncovered?: boolean;
  /** The one bar drawn in gold, so the strip has a focal point. */
  lead?: boolean;
}

export interface PayrollLine {
  label: string;
  meta: string;
  amount: number;
  /** Deductions are shown as a negative and read as an exception. */
  deduction?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Classes and sessions                                                       */
/* -------------------------------------------------------------------------- */

export const CLASS_VIEWS = ['Group', 'Personal'] as const;
export type ClassView = (typeof CLASS_VIEWS)[number];

export const WEEKDAYS = ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const SESSION_STATUSES = [
  'Running',
  'Scheduled',
  'Unassigned',
  'Cancelled',
  'Waitlist',
  'Low fill',
  'Confirmed',
  'Fees due',
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface ClassSession {
  id: string;
  /** 24-hour "HH:MM", so it sorts as a string and formats without a Date. */
  time: string;
  durationMinutes: number;
  name: string;
  /** Null when nobody is assigned — the case the whole screen exists to surface. */
  trainer: string | null;
  room: string | null;
  filled: number;
  capacity: number;
  status: SessionStatus;
  /** Extra text a status needs, e.g. how many are waitlisted. */
  statusDetail?: string;
  /** The row action: "Roster", "Assign", "Collect". */
  action: string;
}

export interface WeekdaySummary {
  day: Weekday;
  /** Day of the month, as displayed. */
  date: string;
  /** Sessions scheduled. `0` renders as "closed". */
  sessions: number;
}

export interface TrainerLoad {
  name: string;
  /** Hours rostered this week, or null while on leave. */
  hours: number | null;
  /** The contractual weekly cap. Exceeding it is what turns the bar warn. */
  capHours: number;
}

export interface RoomUsage {
  name: string;
  booked: number;
  slots: number;
}

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

export const REVENUE_SCOPES = ['Day', 'Month', 'Year'] as const;
export type RevenueScope = (typeof REVENUE_SCOPES)[number];

export interface RevenueSeries {
  values: readonly number[];
  labels: readonly string[];
  /** Label every nth bar, so a 30-bar month does not print 30 numbers. */
  labelEvery: number;
  total: number;
  delta: string;
  caption: string;
}

export interface SplitLine {
  label: string;
  amount: number;
  /** Share of the widest line, 0..1, for the meter. */
  share: number;
  tone: Tone;
}

export interface FooterStat {
  label: string;
  value: string;
  tone: Tone;
}

export const FEE_BUCKETS = ['Overdue', 'This week', 'Upcoming'] as const;
export type FeeBucket = (typeof FEE_BUCKETS)[number];

export interface FeeRow {
  id: string;
  name: string;
  phone: string;
  amount: number;
  amountMeta: string;
  dueLabel: string;
  plan: string;
  state: string;
}

/* -------------------------------------------------------------------------- */
/* Attendance                                                                 */
/* -------------------------------------------------------------------------- */

export const DOOR_EVENTS = ['In', 'Out', 'Guest', 'Denied', 'Error'] as const;
export type DoorEvent = (typeof DOOR_EVENTS)[number];

export interface DoorEntry {
  id: string;
  time: string;
  name: string;
  meta: string;
  event: DoorEvent;
}

export interface AttendanceRow {
  id: string;
  name: string;
  /** Null for a frozen membership: "no visits" and "not counted" differ. */
  visits: number | null;
  averageStay: string;
  /** Consistency 0-100, or null while frozen. */
  consistency: number | null;
  tag: string;
  tone: Tone;
}

export interface SlippingMember {
  id: string;
  name: string;
  meta: string;
  /** The verb for the nudge, so the toast can be specific. */
  action: string;
}

/* -------------------------------------------------------------------------- */
/* Subscription (the gym's own Wrath plan)                                    */
/* -------------------------------------------------------------------------- */

export const WRATH_PLANS = ['Wrath Core', 'Wrath Pro', 'Wrath Elite'] as const;
export type WrathPlan = (typeof WRATH_PLANS)[number];

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface PlanCard {
  name: WrathPlan;
  monthlyPrice: number;
  tag?: string;
  features: readonly PlanFeature[];
}

export const PAYMENT_STATES = ['Paid', 'Failed', 'Refunded'] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export interface PaymentRecord {
  id: string;
  date: string;
  invoice: string;
  plan: string;
  /** Negative for a credit note. */
  amount: number;
  state: PaymentState;
  method: string;
  action: string;
  note: string;
}

/* -------------------------------------------------------------------------- */
/* Trainer mobile                                                             */
/* -------------------------------------------------------------------------- */

export const DEVICE_STATES = ['Active', 'On leave', 'Stale', 'Invited'] as const;
export type DeviceState = (typeof DEVICE_STATES)[number];

export interface TrainerDevice {
  id: string;
  name: string;
  role: string;
  device: string;
  version: string;
  lastSync: string;
  state: DeviceState;
  /** The state-specific primary action: "Sessions", "Force sync", "Remind". */
  action: string;
}

export const TRAINER_PERMISSIONS = ['clients', 'plans', 'attendance', 'fees', 'revenue'] as const;
export type TrainerPermission = (typeof TRAINER_PERMISSIONS)[number];

export interface PermissionSpec {
  key: TrainerPermission;
  label: string;
  meta: string;
}

export interface PendingInvite {
  id: string;
  name: string;
  meta: string;
  expired: boolean;
}

/* -------------------------------------------------------------------------- */
/* Support                                                                    */
/* -------------------------------------------------------------------------- */

export const TICKET_CATEGORIES = [
  'Bug report',
  'Feature suggestion',
  'Billing question',
  'Trainer app issue',
  'Data correction',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_PRIORITIES = [
  'Low',
  'Normal',
  'High · blocks daily work',
  'Critical · gym cannot operate',
] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATES = ['Open', 'In review', 'Planned', 'Fix shipped', 'Resolved'] as const;
export type TicketState = (typeof TICKET_STATES)[number];

export interface Ticket {
  id: string;
  subject: string;
  meta: string;
  state: TicketState;
}

/* -------------------------------------------------------------------------- */
/* Gym profile                                                                */
/* -------------------------------------------------------------------------- */

export const GYM_FIELDS = [
  'name',
  'legal',
  'phone',
  'email',
  'address',
  'gstin',
  'hours',
  'capacity',
] as const;
export type GymField = (typeof GYM_FIELDS)[number];

export type GymProfile = Record<GymField, string>;

export const OPERATING_RULES = ['autoLock', 'requireId', 'guestPass', 'sms', 'biometric'] as const;
export type OperatingRule = (typeof OPERATING_RULES)[number];

export type OperatingRules = Record<OperatingRule, boolean>;

export interface RuleSpec {
  key: OperatingRule;
  label: string;
  meta: string;
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

export const PAY_MODES = ['Cash', 'UPI', 'Card', 'Pay later'] as const;
export type PayMode = (typeof PAY_MODES)[number];

export interface MembershipPlanOption {
  id: string;
  label: string;
  /** `0` for the free trial, which is why the amount is not parsed from the label. */
  amount: number;
}

export interface TrainerOption {
  id: string;
  label: string;
  /** Set when the trainer cannot start immediately. */
  unavailableNote?: string;
}
