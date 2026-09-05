import type {
  PayrollLine,
  PendingInvite,
  ShiftBar,
  StaffMember,
  Ticket,
  TrainerDevice,
} from './types';

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

export const STAFF: readonly StaffMember[] = [
  {
    id: 'st-rahul',
    name: 'Rahul Mehra',
    role: 'Head trainer',
    group: 'Trainers',
    status: 'On floor',
    shift: '6 AM – 2 PM',
    access: 'Full trainer app + roster',
    device: 'Paired · iPhone 14',
    attendance: '26 of 26 days',
  },
  {
    id: 'st-simran',
    name: 'Simran Kaur',
    role: 'Trainer',
    group: 'Trainers',
    status: 'On leave',
    shift: '2 PM – 10 PM',
    access: 'Trainer app only',
    device: 'Paired · Pixel 7a',
    attendance: '22 of 26 days',
    warning: 'On leave till 22 Aug · 3 classes need cover',
  },
  {
    id: 'st-vikram',
    name: 'Vikram Joshi',
    role: 'Trainer',
    group: 'Trainers',
    status: 'On floor',
    shift: '2 PM – 10 PM',
    access: 'Trainer app only',
    device: 'Stale · 9 h ago',
    attendance: '25 of 26 days',
    warning: 'App not synced in 9 hours · 6 sessions pending',
  },
  {
    id: 'st-farhan',
    name: 'Farhan Ali',
    role: 'Front desk',
    group: 'Front desk',
    status: 'On floor',
    shift: '6 AM – 2 PM',
    access: 'Check-ins, fee collection, day passes',
    device: null,
    attendance: '26 of 26 days',
  },
  {
    id: 'st-divya',
    name: 'Divya Menon',
    role: 'Front desk',
    group: 'Front desk',
    status: 'Off shift',
    shift: '4 PM – 10 PM',
    access: 'Check-ins, fee collection',
    device: null,
    attendance: '24 of 26 days',
    warning: 'Desk unmanned 2 – 4 PM today',
  },
  {
    id: 'st-ramesh',
    name: 'Ramesh Yadav',
    role: 'Cleaning',
    group: 'Cleaning',
    status: 'Off shift',
    shift: '5 AM – 9 AM',
    access: 'Attendance punch only',
    device: null,
    attendance: '25 of 26 days',
    warning: 'Police verification expires 28 Aug',
  },
  {
    id: 'st-anita',
    name: 'Anita Kamble',
    role: 'Cleaning',
    group: 'Cleaning',
    status: 'On floor',
    shift: '9 PM – 11 PM',
    access: 'Attendance punch only',
    device: null,
    attendance: '26 of 26 days',
  },
];

/** The coverage strip runs 5 AM to 11 PM — the hours the building is open. */
export const SHIFT_TICKS = ['5a', '8a', '11a', '2p', '5p', '8p', '11p'] as const;

export const SHIFTS: readonly ShiftBar[] = [
  {
    name: 'Rahul Mehra',
    role: 'Head trainer',
    start: 0.04,
    end: 0.42,
    label: '6a – 2p',
    lead: true,
  },
  { name: 'Vikram Joshi', role: 'Trainer', start: 0.42, end: 0.82, label: '2p – 10p' },
  { name: 'Farhan Ali', role: 'Front desk', start: 0.04, end: 0.4, label: '6a – 2p' },
  {
    // Starts at 4p, so the desk is unmanned from 2p — the gap the card calls out.
    name: 'Divya Menon',
    role: 'Front desk',
    start: 0.58,
    end: 0.88,
    label: '4p – 10p',
    uncovered: true,
  },
  { name: 'Ramesh Yadav', role: 'Cleaning', start: 0, end: 0.18, label: '5a – 9a' },
];

export const SHIFT_GAP_NOTE = 'Gap 2–4 PM at the front desk';

export const PAYROLL_TOTAL = 214000;
export const PAYROLL_DUE = 'due 1 Sep';

export const PAYROLL: readonly PayrollLine[] = [
  { label: 'Trainers · 3', meta: 'incl. ₹24,000 PT incentive', amount: 138000 },
  { label: 'Front desk · 2', meta: 'fixed salary', amount: 46000 },
  { label: 'Cleaning · 2', meta: 'fixed salary', amount: 30000 },
  { label: 'Unpaid leave', meta: 'Simran · 4 days', amount: -4600, deduction: true },
];

/* -------------------------------------------------------------------------- */
/* Trainer mobile                                                             */
/* -------------------------------------------------------------------------- */

export const TRAINER_APP_STATS = {
  sessionsLogged: 148,
  sessionsNote: '96% logged from the app, 4% entered at the desk',
  staleDevices: 1,
  staleNote: 'Vikram’s phone last synced 9 h ago · offline sessions pending',
} as const;

export const TRAINER_DEVICES: readonly TrainerDevice[] = [
  {
    id: 'dev-rahul',
    name: 'Rahul Mehra',
    role: 'Head trainer · 6 clients',
    device: 'iPhone 14',
    version: 'app 2.4.1',
    lastSync: '2 min ago',
    state: 'Active',
    action: 'Sessions',
  },
  {
    id: 'dev-simran',
    name: 'Simran Kaur',
    role: 'Trainer · 5 clients',
    device: 'Pixel 7a',
    version: 'app 2.4.1',
    lastSync: '3 days ago',
    state: 'On leave',
    action: 'Sessions',
  },
  {
    id: 'dev-vikram',
    name: 'Vikram Joshi',
    role: 'Trainer · 4 clients',
    device: 'Redmi Note 12',
    version: 'app 2.2.0 · update due',
    lastSync: '9 h ago · offline',
    state: 'Stale',
    action: 'Force sync',
  },
  {
    id: 'dev-anjali',
    name: 'Anjali Rane',
    role: 'Freelance · yoga',
    device: 'not paired',
    version: 'invite sent 17 Aug',
    lastSync: '—',
    state: 'Invited',
    action: 'Remind',
  },
];

export const PENDING_INVITES: readonly PendingInvite[] = [
  {
    id: 'inv-anjali',
    name: 'Anjali Rane',
    meta: 'sent 17 Aug · expires in 5 days',
    expired: false,
  },
  { id: 'inv-naveen', name: 'Naveen Shetty', meta: 'sent 11 Aug · expired', expired: true },
];

export const INVITE_NOTE =
  'Invites expire in 7 days. A revoked seat frees up immediately, and the trainer’s logged sessions stay in your records.';

/** Shown on the upsell when trainer mobile is not on the plan. */
export const LOCKED_PERKS: readonly string[] = [
  '6 trainer seats',
  'Live session runner',
  'Plan builder & client history',
  'Attendance from the floor',
];

/* -------------------------------------------------------------------------- */
/* Support                                                                    */
/* -------------------------------------------------------------------------- */

export const INITIAL_TICKETS: readonly Ticket[] = [
  {
    id: 'WR-2481',
    subject: 'Cash entries missing from daily revenue',
    meta: 'Bug · high · opened 17 Aug · 2 replies',
    state: 'In review',
  },
  {
    id: 'WR-2465',
    subject: 'Let desk staff issue day passes without owner PIN',
    meta: 'Suggestion · opened 11 Aug',
    state: 'Planned',
  },
  {
    id: 'WR-2402',
    subject: 'Trainer app not syncing on Redmi devices',
    meta: 'Trainer app · critical · opened 2 Aug',
    state: 'Fix shipped',
  },
  {
    id: 'WR-2388',
    subject: 'GST breakup wrong on invoice INV-1183',
    meta: 'Billing · opened 28 Jul',
    state: 'Resolved',
  },
];

/**
 * The next ticket number.
 *
 * A counter rather than `2482 + tickets.length`: the list is prepended to, so
 * the length-based form reissues an id the moment a ticket is ever removed
 * from it.
 */
export const NEXT_TICKET_NUMBER = 2482;

export const SUPPORT_FACTS: readonly { label: string; value: string }[] = [
  { label: 'First response', value: 'under 4 working hours' },
  { label: 'Your average', value: '2 h 10 m' },
  { label: 'Escalation line', value: '+91 80 4718 2200' },
];

export const SHIPPED_FROM_REPORTS: readonly { label: string; meta: string }[] = [
  { label: 'Partial fee payments', meta: 'from WR-2201 · shipped Jun 2026' },
  { label: 'Offline check-in queue', meta: 'from WR-2402 · shipped Aug 2026' },
  { label: 'Staff document expiry alerts', meta: 'from WR-2310 · shipped Jul 2026' },
];

/** Minimum body length before a report can be filed. */
export const TICKET_BODY_MIN = 20;
