import type {
  AttendanceRow,
  ClassSession,
  ClassView,
  DoorEntry,
  RoomUsage,
  SlippingMember,
  TrainerLoad,
  Weekday,
  WeekdaySummary,
} from './types';

/* -------------------------------------------------------------------------- */
/* Occupancy                                                                  */
/* -------------------------------------------------------------------------- */

export interface OccupancyRow {
  label: string;
  value: string;
  /** A supporting fact rather than a headcount — rendered one step back. */
  muted?: boolean;
}

export const OCCUPANCY: {
  now: number;
  capacity: number;
  rows: readonly OccupancyRow[];
} = {
  now: 68,
  capacity: 120,
  rows: [
    { label: 'Floor · weights', value: '41 people' },
    { label: 'Studio · HIIT class', value: '18 of 20' },
    { label: 'Cardio deck', value: '9 people' },
    { label: 'Longest stay', value: 'Kabir R · 1h 52m', muted: true },
  ],
};

/* -------------------------------------------------------------------------- */
/* Check-ins                                                                  */
/* -------------------------------------------------------------------------- */

export const ATTENDANCE_SUMMARY: readonly {
  label: string;
  value: string;
  sub: string;
  tone: 'neutral' | 'warn';
}[] = [
  { label: 'Check-ins today', value: '284', sub: '41 first-time visitors', tone: 'neutral' },
  { label: 'Daily average · Aug', value: '246', sub: '+18 vs July average', tone: 'neutral' },
  { label: 'Unique visitors · 7d', value: '318', sub: '77% of active members', tone: 'neutral' },
  {
    label: 'Class no-show rate',
    value: '12%',
    sub: '34 booked seats wasted this week',
    tone: 'warn',
  },
];

/** Check-ins per hour, 6 AM to 10 PM. Indexes line up with `HOUR_LABELS`. */
export const CHECK_INS_BY_HOUR = [
  22, 41, 63, 38, 12, 8, 14, 19, 26, 34, 58, 63, 41, 24, 15, 9, 4,
] as const;

export const HOURLY_CAPTION = 'Peak 6–8 PM · 63 in the busiest hour · capacity breached twice';

/** Row labels for the footfall heatmap — one per three-hour band. */
export const HEATMAP_HOURS = ['7a', '10a', '1p', '4p', '7p', '10p'] as const;

/**
 * Footfall intensity, 0-5, over the last seven days.
 *
 * Outer array is days (oldest first, so "today" lands on the right where the
 * eye ends up); inner array is the six bands in `HEATMAP_HOURS`.
 */
export const HEATMAP_DAYS: readonly {
  label: string;
  cells: readonly number[];
  today?: boolean;
}[] = [
  { label: 'Thu', cells: [3, 2, 1, 2, 4, 2] },
  { label: 'Fri', cells: [4, 2, 1, 3, 5, 2] },
  { label: 'Sat', cells: [3, 3, 2, 2, 5, 3] },
  { label: 'Sun', cells: [4, 2, 1, 2, 5, 2] },
  { label: 'Mon', cells: [3, 2, 2, 3, 4, 1] },
  { label: 'Tue', cells: [5, 4, 3, 3, 2, 1] },
  { label: 'Wed', cells: [2, 1, 1, 1, 1, 0], today: true },
];

export const DOOR_FEED: readonly DoorEntry[] = [
  {
    id: 'd-1',
    time: '7:42 PM',
    name: 'Meera Iyer',
    meta: 'Quarterly · face scan',
    event: 'In',
  },
  { id: 'd-2', time: '7:40 PM', name: 'Tanvi Desai', meta: 'PT with Rahul · QR', event: 'In' },
  {
    id: 'd-3',
    time: '7:38 PM',
    name: 'Priya Nair',
    meta: 'fees overdue 21 days',
    event: 'Denied',
  },
  {
    id: 'd-4',
    time: '7:35 PM',
    name: 'Walk-in · day pass',
    meta: 'collected ₹300 · desk',
    event: 'Guest',
  },
  { id: 'd-5', time: '7:31 PM', name: 'Aarav Shah', meta: 'checked out · 1h 14m', event: 'Out' },
  {
    id: 'd-6',
    time: '7:28 PM',
    name: 'Unknown card 4417',
    meta: 'no member match · desk alerted',
    event: 'Error',
  },
];

export const SLIPPING_MEMBERS: readonly SlippingMember[] = [
  {
    id: 's-priya',
    name: 'Priya Nair',
    meta: 'last seen 18 days ago · 41%',
    action: 'Win-back message sent to Priya',
  },
  {
    id: 's-sana',
    name: 'Sana Qureshi',
    meta: 'frozen 12 days · medical',
    action: 'Check-in call logged for Sana',
  },
  {
    id: 's-arjun',
    name: 'Arjun Pillai',
    meta: 'last seen 11 days ago · ID pending',
    action: 'Reminder sent to Arjun',
  },
  {
    id: 's-devansh',
    name: 'Devansh Gupta',
    meta: '8 PT sessions unused, expiring',
    action: 'Trainer asked to reschedule Devansh',
  },
];

export const ATTENDANCE_ROWS: readonly AttendanceRow[] = [
  {
    id: 'a-kabir',
    name: 'Kabir Rao',
    visits: 26,
    averageStay: '1h 48m',
    consistency: 92,
    tag: 'Top 5%',
    tone: 'gold',
  },
  {
    id: 'a-tanvi',
    name: 'Tanvi Desai',
    visits: 24,
    averageStay: '1h 22m',
    consistency: 88,
    tag: 'Consistent',
    tone: 'ok',
  },
  {
    id: 'a-aarav',
    name: 'Aarav Shah',
    visits: 23,
    averageStay: '1h 05m',
    consistency: 86,
    tag: 'Consistent',
    tone: 'ok',
  },
  {
    id: 'a-yash',
    name: 'Yash Kulkarni',
    visits: 17,
    averageStay: '52m',
    consistency: 64,
    tag: 'Watch',
    tone: 'neutral',
  },
  {
    id: 'a-devansh',
    name: 'Devansh Gupta',
    visits: 14,
    averageStay: '48m',
    consistency: 58,
    tag: 'Watch',
    tone: 'neutral',
  },
  {
    id: 'a-priya',
    name: 'Priya Nair',
    visits: 5,
    averageStay: '34m',
    consistency: 41,
    tag: 'Churn risk',
    tone: 'warn',
  },
  {
    // Null rather than 0: the membership is held, so there is nothing to measure.
    id: 'a-sana',
    name: 'Sana Qureshi',
    visits: null,
    averageStay: '—',
    consistency: null,
    tag: 'Frozen',
    tone: 'neutral',
  },
];

/* -------------------------------------------------------------------------- */
/* Classes and sessions                                                       */
/* -------------------------------------------------------------------------- */

export const WEEK: readonly WeekdaySummary[] = [
  { day: 'Thu', date: '13', sessions: 6 },
  { day: 'Fri', date: '14', sessions: 6 },
  { day: 'Sat', date: '15', sessions: 5 },
  // The gym is shut on Sunday — the empty-day state has to be reachable.
  { day: 'Sun', date: '16', sessions: 0 },
  { day: 'Mon', date: '17', sessions: 6 },
  { day: 'Tue', date: '18', sessions: 6 },
  { day: 'Wed', date: '19', sessions: 6 },
];

/** The day the dataset is written against — today, and the default selection. */
export const CURRENT_DAY: Weekday = 'Wed';
export const CURRENT_DATE_LABEL = '19 Aug';

const GROUP_SESSIONS: readonly ClassSession[] = [
  {
    id: 'g-hiit',
    time: '06:00',
    durationMinutes: 60,
    name: 'HIIT Conditioning',
    trainer: 'Rahul Mehra',
    room: 'Studio A',
    filled: 18,
    capacity: 20,
    status: 'Running',
    action: 'Roster',
  },
  {
    id: 'g-strength',
    time: '07:30',
    durationMinutes: 45,
    name: 'Strength Foundations',
    trainer: null,
    room: null,
    filled: 14,
    capacity: 18,
    status: 'Unassigned',
    action: 'Assign',
  },
  {
    id: 'g-yoga',
    time: '09:00',
    durationMinutes: 60,
    name: 'Yoga Flow',
    trainer: 'Anjali Rane',
    room: 'Studio B',
    filled: 12,
    capacity: 15,
    status: 'Scheduled',
    action: 'Roster',
  },
  {
    id: 'g-crossfit',
    time: '17:30',
    durationMinutes: 50,
    name: 'CrossFit Circuit',
    trainer: 'Rahul Mehra',
    room: 'Rig',
    filled: 20,
    capacity: 20,
    status: 'Waitlist',
    statusDetail: '3 waitlist',
    action: 'Waitlist',
  },
  {
    id: 'g-zumba',
    time: '19:00',
    durationMinutes: 45,
    name: 'Zumba',
    trainer: 'Vikram Joshi',
    room: 'Studio B',
    filled: 6,
    capacity: 25,
    status: 'Low fill',
    action: 'Promote',
  },
  {
    id: 'g-core',
    time: '20:30',
    durationMinutes: 60,
    name: 'Core & Mobility',
    trainer: 'Simran Kaur',
    room: 'Studio A',
    filled: 0,
    capacity: 16,
    status: 'Cancelled',
    action: 'Restore',
  },
];

const PT_SESSIONS: readonly ClassSession[] = [
  {
    id: 'p-tanvi',
    time: '08:00',
    durationMinutes: 60,
    name: 'PT · Tanvi Desai',
    trainer: 'Rahul Mehra',
    room: 'Floor',
    filled: 1,
    capacity: 1,
    status: 'Confirmed',
    action: 'Notes',
  },
  {
    id: 'p-devansh',
    time: '11:00',
    durationMinutes: 60,
    name: 'PT · Devansh Gupta',
    trainer: 'Vikram Joshi',
    room: 'Floor',
    filled: 1,
    capacity: 1,
    status: 'Fees due',
    action: 'Collect',
  },
  {
    id: 'p-kabir',
    time: '16:00',
    durationMinutes: 45,
    name: 'PT · Kabir Rao',
    trainer: 'Rahul Mehra',
    room: 'Rig',
    filled: 1,
    capacity: 1,
    status: 'Confirmed',
    action: 'Notes',
  },
  {
    id: 'p-sneha',
    time: '18:15',
    durationMinutes: 60,
    name: 'PT · new lead (Sneha)',
    trainer: null,
    room: null,
    filled: 0,
    capacity: 1,
    status: 'Unassigned',
    action: 'Assign',
  },
];

/**
 * The schedule for a day.
 *
 * Only Wednesday and the closed Sunday are modelled; every other weekday shows
 * Wednesday's roster, which is what a weekly template actually produces. Sunday
 * returns an empty list rather than falling through, because the empty state is
 * a real screen and not an error.
 */
export function sessionsFor(day: Weekday, view: ClassView): readonly ClassSession[] {
  if (day === 'Sun') return [];
  return view === 'Group' ? GROUP_SESSIONS : PT_SESSIONS;
}

export const TRAINER_LOAD: readonly TrainerLoad[] = [
  { name: 'Rahul Mehra', hours: 34, capHours: 30 },
  { name: 'Simran Kaur', hours: null, capHours: 30 },
  { name: 'Vikram Joshi', hours: 18, capHours: 34 },
  { name: 'Anjali Rane · freelance', hours: 9, capHours: 34 },
];

export const TRAINER_LOAD_NOTE = 'Rahul is over the 30 h/week cap. Move 2 sessions to Vikram.';

export const ROOMS: readonly RoomUsage[] = [
  { name: 'Studio A', booked: 11, slots: 14 },
  { name: 'Studio B', booked: 6, slots: 14 },
  { name: 'Rig / functional', booked: 13, slots: 14 },
];

/** Above this share, a room is at practical capacity and reads warn. */
export const ROOM_PRESSURE_THRESHOLD = 0.9;

export const WAITLIST = {
  people: 7,
  note: 'CrossFit 5:30 PM is the bottleneck 4 days a week. A second slot at 6:45 PM would clear it.',
  action: 'CrossFit 6:45 PM slot drafted · assign a trainer to publish',
} as const;
