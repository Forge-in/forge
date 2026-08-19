/**
 * Fixture data for the trainer surface.
 *
 * Every string here is the design's own. The shape differs in two deliberate ways:
 *
 * - Records are keyed by a stable `id` rather than by display name. The design used names as
 *   map keys ("Priya S."), which silently collapses two clients who share one.
 * - Each roster client carries a full `profile`. The design wired every roster row to a single
 *   authored profile (Neha Desai), so tapping "Vikram R." opened Neha's page. The five extra
 *   profiles follow the roster metadata the design already states — same shape, same tone — so
 *   that any row opens a coherent screen.
 *
 * Replacing this module with an API client is the intended next step; nothing outside it knows
 * these values are static.
 */

export type ClientTone = 'ok' | 'warn' | 'dim';
export type ClientGroup = 'active' | 'slipping' | 'lapsed';

export interface ClientStat {
  label: string;
  value: string;
  delta: string;
  tone: Extract<ClientTone, 'ok' | 'warn'>;
}

export interface ClientLog {
  date: string;
  what: string;
  load: string;
}

export interface ClientProfile {
  plan: string;
  /** Remote portrait for the detail hero. Unset in fixtures — the hero renders a monogram. */
  photoUri?: string;
  /** Adherence as a fraction in [0, 1]; the design renders it as a percentage. */
  adherence: number;
  /** Current week of the programme, or null when the client has no active plan. */
  week: number | null;
  totalWeeks: number | null;
  nextLabel: string;
  stats: ClientStat[];
  logs: ClientLog[];
}

export interface TrainerClient {
  id: string;
  /** Short label used in lists and the live room — the design's "Neha D." form. */
  name: string;
  fullName: string;
  meta: string;
  status: string;
  tone: ClientTone;
  group: ClientGroup;
  profile: ClientProfile;
}

export interface Exercise {
  name: string;
  scheme: string;
}

export interface PlanDay {
  day: string;
  title: string;
  meta: string;
  exercises: Exercise[];
}

export interface AgendaEntry {
  id: string;
  time: string;
  who: string;
  meta: string;
  badge: string | null;
  /** Marks the row the design paints with a warm gradient hairline. */
  hot: boolean;
}

export interface WaitlistEntry {
  id: string;
  name: string;
  meta: string;
}

export interface DayStat {
  label: string;
  value: string;
  /** The design tints only the show-rate figure gold. */
  accent: boolean;
}

export const trainer = {
  name: 'Rahul Mehra',
  initials: 'RM',
  unreadNotifications: 3,
} as const;

/** The class on the Today dial. */
export const todaySession = {
  title: 'HIIT Conditioning',
  startLabel: '9:00',
  durationMinutes: 45,
  location: 'studio',
  capacity: 8,
  booked: 6,
} as const;

export const SESSION_DURATION_SECONDS = todaySession.durationMinutes * 60;

/** Sets each client works through per station in the runner. */
export const SETS_PER_STATION = 3;

export const clients: TrainerClient[] = [
  {
    id: 'priya-sharma',
    name: 'Priya S.',
    fullName: 'Priya Sharma',
    meta: 'Strength · wk 7 of 12',
    status: 'On track',
    tone: 'ok',
    group: 'active',
    profile: {
      plan: 'Strength Base · assigned by you',
      adherence: 0.91,
      week: 7,
      totalWeeks: 12,
      nextLabel: 'Next session today, 10:30',
      stats: [
        { label: 'Weight', value: '61.0 kg', delta: '−0.6 mo', tone: 'ok' },
        { label: 'Squat 1RM', value: '84 kg', delta: '+8 mo', tone: 'ok' },
        { label: 'Sessions', value: '21', delta: 'none missed', tone: 'ok' },
      ],
      logs: [
        { date: '12 Aug', what: 'Upper push', load: 'Bench 47×6' },
        { date: '10 Aug', what: 'Squat focus', load: 'Squat 72×5' },
        { date: '08 Aug', what: 'Posterior chain', load: 'Deadlift 82×4' },
        { date: '06 Aug', what: 'Conditioning', load: 'Row 2 km' },
      ],
    },
  },
  {
    id: 'arjun-kapoor',
    name: 'Arjun K.',
    fullName: 'Arjun Kapoor',
    meta: 'Fat loss · wk 3 of 8',
    status: '2 missed',
    tone: 'warn',
    group: 'slipping',
    profile: {
      plan: 'Fat Loss Block · assigned by you',
      adherence: 0.64,
      week: 3,
      totalWeeks: 8,
      nextLabel: 'Next session today, 10:30',
      stats: [
        { label: 'Weight', value: '88.2 kg', delta: '−2.4 mo', tone: 'ok' },
        { label: 'Squat 1RM', value: '95 kg', delta: '+2 mo', tone: 'ok' },
        { label: 'Sessions', value: '9', delta: '2 missed', tone: 'warn' },
      ],
      logs: [
        { date: '11 Aug', what: 'Conditioning', load: 'Intervals 8×1' },
        { date: '08 Aug', what: 'Missed — work', load: '—' },
        { date: '06 Aug', what: 'Full body', load: 'Squat 90×5' },
        { date: '04 Aug', what: 'Missed — travel', load: '—' },
      ],
    },
  },
  {
    id: 'neha-desai',
    name: 'Neha D.',
    fullName: 'Neha Desai',
    meta: 'Lower body · wk 4 of 12',
    status: 'On track',
    tone: 'ok',
    group: 'active',
    profile: {
      plan: 'Lower Body Build · assigned by you',
      adherence: 0.82,
      week: 4,
      totalWeeks: 12,
      nextLabel: 'Next session today, 12:00',
      stats: [
        { label: 'Weight', value: '58.4 kg', delta: '−1.2 mo', tone: 'ok' },
        { label: 'Squat 1RM', value: '72 kg', delta: '+6 mo', tone: 'ok' },
        { label: 'Sessions', value: '14', delta: '2 missed', tone: 'warn' },
      ],
      logs: [
        { date: '11 Aug', what: 'Posterior chain', load: 'Deadlift 70×5' },
        { date: '09 Aug', what: 'Squat focus', load: 'Squat 60×6' },
        { date: '07 Aug', what: 'Unilateral + core', load: 'Split sq 8 ea' },
        { date: '04 Aug', what: 'Missed — travel', load: '—' },
      ],
    },
  },
  {
    id: 'divya-patel',
    name: 'Divya P.',
    fullName: 'Divya Patel',
    meta: 'Onboarding · no plan yet',
    status: 'Needs plan',
    tone: 'warn',
    group: 'slipping',
    profile: {
      plan: 'No plan assigned yet',
      adherence: 0,
      week: null,
      totalWeeks: null,
      nextLabel: 'Assessment booked, 14 Aug',
      stats: [
        { label: 'Weight', value: '66.1 kg', delta: 'baseline', tone: 'ok' },
        { label: 'Squat 1RM', value: '—', delta: 'not tested', tone: 'warn' },
        { label: 'Sessions', value: '1', delta: 'intake only', tone: 'warn' },
      ],
      logs: [{ date: '05 Aug', what: 'Intake + movement screen', load: '—' }],
    },
  },
  {
    id: 'vikram-rao',
    name: 'Vikram R.',
    fullName: 'Vikram Rao',
    meta: 'Strength · paused',
    status: 'Lapsed',
    tone: 'dim',
    group: 'lapsed',
    profile: {
      plan: 'Strength Base · paused 18 Jul',
      adherence: 0.23,
      week: 5,
      totalWeeks: 12,
      nextLabel: 'Unconfirmed today, 19:30',
      stats: [
        { label: 'Weight', value: '79.5 kg', delta: '+1.8 mo', tone: 'warn' },
        { label: 'Squat 1RM', value: '110 kg', delta: 'no change', tone: 'warn' },
        { label: 'Sessions', value: '6', delta: '5 missed', tone: 'warn' },
      ],
      logs: [
        { date: '18 Jul', what: 'Squat focus', load: 'Squat 100×3' },
        { date: '15 Jul', what: 'Missed — injury', load: '—' },
        { date: '11 Jul', what: 'Posterior chain', load: 'Deadlift 120×3' },
      ],
    },
  },
  {
    id: 'sana-malik',
    name: 'Sana M.',
    fullName: 'Sana Malik',
    meta: 'Conditioning · wk 9 of 12',
    status: 'On track',
    tone: 'ok',
    group: 'active',
    profile: {
      plan: 'Conditioning Cycle · assigned by you',
      adherence: 0.88,
      week: 9,
      totalWeeks: 12,
      nextLabel: 'Next session today, 09:00',
      stats: [
        { label: 'Weight', value: '54.7 kg', delta: '−0.4 mo', tone: 'ok' },
        { label: 'Squat 1RM', value: '65 kg', delta: '+4 mo', tone: 'ok' },
        { label: 'Sessions', value: '26', delta: '1 missed', tone: 'ok' },
      ],
      logs: [
        { date: '12 Aug', what: 'Intervals', load: 'Row 5×500' },
        { date: '10 Aug', what: 'Full body', load: 'Clean 40×5' },
        { date: '08 Aug', what: 'Conditioning', load: 'Bike 20 min' },
        { date: '05 Aug', what: 'Unilateral + core', load: 'Lunge 12 ea' },
      ],
    },
  },
];

/**
 * Everyone booked into today's class — the design's `ROOM`, which is exactly the roster.
 * Derived rather than duplicated so the two can never drift apart.
 */
export const roomClientIds: string[] = clients.map((client) => client.id);

/** The same list as `roomClientIds`, resolved to clients — what the runner and check-in render. */
export const room: TrainerClient[] = clients.filter((client) => roomClientIds.includes(client.id));

export const exercises: Exercise[] = [
  { name: 'Rower', scheme: '500 m · hard pace' },
  { name: 'Kettlebell Swing', scheme: '20 reps · 16 kg' },
  { name: 'Box Jump', scheme: '15 reps · 24 in' },
  { name: 'Sled Push', scheme: '20 m · 40 kg' },
  { name: 'Battle Rope', scheme: '40 sec · max effort' },
];

export const plan = {
  title: 'Lower Body Build',
  kicker: 'Plan · 4 clients',
  assignedCount: 4,
  totalWeeks: 12,
  libraryCount: 240,
} as const;

export const planDays: PlanDay[] = [
  {
    day: 'MON',
    title: 'Squat Focus',
    meta: '5 exercises · 52 min',
    exercises: [
      { name: 'Back Squat', scheme: '4 × 6 · 60 kg' },
      { name: 'Romanian Deadlift', scheme: '3 × 10 · 45 kg' },
      { name: 'Walking Lunge', scheme: '3 × 12 each' },
      { name: 'Leg Curl', scheme: '3 × 12 · 25 kg' },
      { name: 'Calf Raise', scheme: '4 × 15' },
    ],
  },
  {
    day: 'WED',
    title: 'Posterior Chain',
    meta: '4 exercises · 45 min',
    exercises: [
      { name: 'Deadlift', scheme: '4 × 5 · 70 kg' },
      { name: 'Hip Thrust', scheme: '3 × 10 · 50 kg' },
      { name: 'Back Extension', scheme: '3 × 12' },
      { name: 'Farmer Carry', scheme: '3 × 30 m' },
    ],
  },
  {
    day: 'FRI',
    title: 'Unilateral + Core',
    meta: '5 exercises · 48 min',
    exercises: [
      { name: 'Bulgarian Split Squat', scheme: '3 × 8 each' },
      { name: 'Step Up', scheme: '3 × 10 each' },
      { name: 'Cable Pull-through', scheme: '3 × 12' },
      { name: 'Plank', scheme: '3 × 45 sec' },
      { name: 'Dead Bug', scheme: '3 × 10 each' },
    ],
  },
];

export const agenda: AgendaEntry[] = [
  {
    id: 'agenda-1030',
    time: '10:30',
    who: 'Priya S. + Arjun K.',
    meta: 'Two 1-on-1s · at your cap',
    badge: 'Overlap',
    hot: true,
  },
  {
    id: 'agenda-1200',
    time: '12:00',
    who: 'Neha D.',
    meta: 'Lower body · week 4 of 12',
    badge: null,
    hot: false,
  },
  {
    id: 'agenda-1700',
    time: '17:00',
    who: 'Strength Circuit',
    meta: 'Full · 2 on waitlist',
    badge: null,
    hot: false,
  },
  {
    id: 'agenda-1930',
    time: '19:30',
    who: 'Vikram R.',
    meta: 'Unconfirmed · nudge sent 2d ago',
    badge: null,
    hot: false,
  },
];

export const dayStats: DayStat[] = [
  { value: '5', label: 'Sessions', accent: false },
  { value: '19', label: 'Clients in', accent: false },
  { value: '82%', label: 'Show rate', accent: true },
];

export const waitlist: WaitlistEntry[] = [
  { id: 'rohan-tiwari', name: 'Rohan T.', meta: 'Queued 08:12 · notify on open' },
  { id: 'meera-joshi', name: 'Meera J.', meta: 'Queued 08:40 · notify on open' },
];

/** The overlapping stack under the Today dial. The final chip is an overflow count. */
export const heroAvatars = [
  { key: 'ps', label: 'PS', accent: true, overflow: false },
  { key: 'ak', label: 'AK', accent: false, overflow: false },
  { key: 'nd', label: 'ND', accent: false, overflow: false },
  { key: 'more', label: '+3', accent: false, overflow: true },
] as const;

export const clientFilters = ['All', 'Slipping', 'Lapsed'] as const;
export type ClientFilter = (typeof clientFilters)[number];

/** Clients the design counts as "slipping this week" on the Today prompt. */
export const slippingCount = clients.filter((client) => client.group === 'slipping').length;

export function findClient(id: string): TrainerClient | undefined {
  return clients.find((client) => client.id === id);
}
