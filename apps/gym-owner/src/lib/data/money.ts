import type {
  FeeBucket,
  FeeRow,
  FooterStat,
  PaymentRecord,
  PlanCard,
  RevenueScope,
  RevenueSeries,
  SplitLine,
} from './types';

/* -------------------------------------------------------------------------- */
/* Revenue series                                                             */
/* -------------------------------------------------------------------------- */

/** 6 AM to 10 PM, the hours the gym takes money in. Shared with the check-in chart. */
export const HOUR_LABELS = [
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
] as const;

const DAY_VALUES = [
  1400, 2600, 3900, 2400, 900, 700, 1100, 1500, 1900, 2600, 4400, 5200, 3600, 2100, 1300, 800, 400,
] as const;

const MONTH_VALUES = [
  22, 31, 26, 18, 9, 34, 29, 24, 33, 27, 21, 12, 38, 31, 28, 35, 22, 15, 41, 36, 30, 26, 19, 11, 44,
  38, 33, 29, 24, 17,
] as const;

/**
 * The financial year to date. The trailing zeros are months that have not
 * happened yet and are drawn as an empty stub rather than omitted, so the axis
 * stays a full year and August does not look like the end of time.
 */
const YEAR_VALUES = [612, 588, 701, 664, 742, 698, 771, 842, 0, 0, 0, 0] as const;

const YEAR_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

const MONTH_LABELS = MONTH_VALUES.map((_, index) => String(index + 1));

export const REVENUE_SERIES: Readonly<Record<RevenueScope, RevenueSeries>> = {
  Day: {
    values: DAY_VALUES,
    labels: HOUR_LABELS,
    labelEvery: 2,
    total: 34600,
    delta: '+8.4%',
    caption: 'Wed 19 Aug · 6 AM – 10 PM · 74 transactions',
  },
  Month: {
    values: MONTH_VALUES,
    labels: MONTH_LABELS,
    labelEvery: 4,
    total: 842500,
    delta: '+12.1%',
    caption: 'August 2026 · 1–19 Aug · 218 transactions',
  },
  Year: {
    values: YEAR_VALUES,
    labels: YEAR_LABELS,
    labelEvery: 1,
    total: 5618000,
    delta: '+21.6%',
    caption: 'FY 2026–27 · Apr to date · projection ₹92,40,000',
  },
};

export const REVENUE_SPLIT: readonly { label: string; amount: number; tone: 'gold' | 'neutral' }[] =
  [
    { label: 'Memberships', amount: 612000, tone: 'gold' },
    { label: 'Personal training', amount: 168500, tone: 'gold' },
    { label: 'Store & day passes', amount: 62000, tone: 'neutral' },
  ];

export const REVENUE_FOOTER: readonly FooterStat[] = [
  { label: 'Avg per member', value: '₹2,045', tone: 'neutral' },
  { label: 'New joins', value: '18 · ₹74,600', tone: 'neutral' },
  { label: 'Refunds & discounts', value: '− ₹11,400', tone: 'warn' },
  { label: 'GST payable', value: '₹1,51,650', tone: 'neutral' },
  { label: 'Unreconciled cash', value: '₹4,200', tone: 'warn' },
];

/**
 * Revenue by plan. `share` is the fraction of the WIDEST line, not of the
 * total: the card compares plans against each other, and shares of a total
 * would render every bar short enough to be unreadable.
 */
export const REVENUE_BY_PLAN: readonly SplitLine[] = [
  { label: 'Annual · all access', amount: 281000, share: 1, tone: 'gold' },
  { label: 'Quarterly', amount: 214500, share: 0.76, tone: 'neutral' },
  { label: 'Monthly', amount: 116500, share: 0.41, tone: 'neutral' },
  { label: 'Personal training', amount: 168500, share: 0.6, tone: 'neutral' },
  { label: 'Day passes & store', amount: 62000, share: 0.22, tone: 'neutral' },
];

/** Payment mode. Here `share` IS the share of the total — the bar is a whole. */
export const REVENUE_BY_MODE: readonly SplitLine[] = [
  { label: 'UPI', amount: 496000, share: 0.59, tone: 'gold' },
  { label: 'Card', amount: 198000, share: 0.24, tone: 'gold' },
  { label: 'Cash', amount: 114500, share: 0.13, tone: 'neutral' },
  { label: 'Bank / cheque', amount: 34000, share: 0.04, tone: 'neutral' },
];

export const UNRECONCILED_CASH_NOTE =
  'Cash collections must be reconciled at the desk each night. 2 entries unreconciled.';

export const PT_EARNERS: readonly { id: string; name: string; meta: string; amount: number }[] = [
  { id: 'pt-rahul', name: 'Rahul Mehra', meta: '38 sessions · 6 clients', amount: 76000 },
  { id: 'pt-simran', name: 'Simran Kaur', meta: '24 sessions · 5 clients', amount: 48000 },
  { id: 'pt-vikram', name: 'Vikram Joshi', meta: '22 sessions · 4 clients', amount: 44500 },
];

/* -------------------------------------------------------------------------- */
/* Fees and dues                                                              */
/* -------------------------------------------------------------------------- */

export const FEE_SUMMARY: readonly {
  label: string;
  amount: number;
  sub: string;
  tone: 'warn' | 'neutral' | 'gold';
}[] = [
  { label: 'Overdue', amount: 41200, sub: '9 members · oldest 21 days', tone: 'warn' },
  { label: 'Due this week', amount: 18600, sub: '7 members · reminders sent', tone: 'neutral' },
  {
    label: 'Upcoming 30 days',
    amount: 36500,
    sub: '14 members · 11 on auto-debit',
    tone: 'neutral',
  },
  { label: 'Collected in Aug', amount: 842500, sub: '89.7% collection rate', tone: 'gold' },
];

export const FEE_ROWS: Readonly<Record<FeeBucket, readonly FeeRow[]>> = {
  Overdue: [
    {
      id: 'f-priya',
      name: 'Priya Nair',
      phone: '99678 40921',
      amount: 2300,
      amountMeta: 'Monthly · Jul cycle',
      dueLabel: '21 days overdue',
      plan: 'Monthly · Gym',
      state: 'Access paused',
    },
    {
      id: 'f-devansh',
      name: 'Devansh Gupta',
      phone: '97021 66540',
      amount: 5600,
      amountMeta: '₹2,000 part-paid of ₹7,600',
      dueLabel: '4 days overdue',
      plan: 'Monthly + PT',
      state: 'Partial',
    },
    {
      id: 'f-arjun',
      name: 'Arjun Pillai',
      phone: '88907 41266',
      amount: 2300,
      amountMeta: 'first invoice unpaid',
      dueLabel: '2 days overdue',
      plan: 'Monthly · Gym',
      state: 'Unverified',
    },
    {
      id: 'f-sneha',
      name: 'Sneha Kale',
      phone: '99872 30145',
      amount: 6300,
      amountMeta: 'auto-debit failed twice',
      dueLabel: '9 days overdue',
      plan: 'Quarterly · Gym',
      state: 'Mandate failed',
    },
  ],
  'This week': [
    {
      id: 'f-ishita',
      name: 'Ishita Menon',
      phone: '98675 22084',
      amount: 2600,
      amountMeta: 'renewal invoice sent',
      dueLabel: 'due 22 Aug',
      plan: 'Monthly · Gym + Group',
      state: 'Invoice sent',
    },
    {
      id: 'f-rohit',
      name: 'Rohit Verma',
      phone: '96543 90012',
      amount: 2300,
      amountMeta: 'trial converts',
      dueLabel: 'due 24 Aug',
      plan: 'Trial → Monthly',
      state: 'Trial ending',
    },
  ],
  Upcoming: [
    {
      id: 'f-yash',
      name: 'Yash Kulkarni',
      phone: '97655 20117',
      amount: 2300,
      amountMeta: 'auto-debit scheduled',
      dueLabel: 'due 31 Aug',
      plan: 'Monthly · Gym',
      state: 'Auto-debit',
    },
    {
      id: 'f-neha',
      name: 'Neha Bhatt',
      phone: '98191 63402',
      amount: 6300,
      amountMeta: 'auto-debit scheduled',
      dueLabel: 'due 12 Sep',
      plan: 'Quarterly · Cardio',
      state: 'Auto-debit',
    },
    {
      id: 'f-aarav',
      name: 'Aarav Shah',
      phone: '98204 11238',
      amount: 7200,
      amountMeta: 'renewal quote',
      dueLabel: 'due 14 Oct',
      plan: 'Quarterly · Gym + Cardio',
      state: 'Scheduled',
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* The gym's own Wrath subscription                                           */
/* -------------------------------------------------------------------------- */

export const SUBSCRIPTION = {
  gymId: 'IRH-2291',
  renewsOn: '12 Sep 2026',
  /** Days remaining of the billing cycle, and its length — drives the ring. */
  daysLeft: 24,
  cycleDays: 31,
  membersUsed: 412,
  membersAllowed: 500,
  seatsUsed: 4,
  seatsTotal: 6,
  extraSeatPrice: 999,
  /** Inclusive of 18% GST — the figure actually charged to the card. */
  nextCharge: 9439,
  cardLast4: '4417',
  cardMeta: 'HDFC · 09/28',
  mandateLimit: 8000,
  billingAddress:
    'Ironhold Wellness LLP · Survey 41, Baner Road, Pune 411045 · GSTIN 27AABCI1234K1ZV',
} as const;

export const PLAN_CARDS: readonly PlanCard[] = [
  {
    name: 'Wrath Core',
    monthlyPrice: 2999,
    features: [
      { label: 'Members, fees & check-ins', included: true },
      { label: 'Classes and staff roles', included: true },
      { label: 'Trainer mobile app', included: false },
      { label: 'PT plan library', included: false },
    ],
  },
  {
    name: 'Wrath Pro',
    monthlyPrice: 7999,
    features: [
      { label: 'Everything in Core', included: true },
      { label: 'Trainer mobile · 6 seats', included: true },
      { label: 'Plan builder & session runner', included: true },
      { label: 'Priority support', included: true },
    ],
  },
  {
    name: 'Wrath Elite',
    monthlyPrice: 14999,
    tag: 'Best for chains',
    features: [
      { label: 'Everything in Pro', included: true },
      { label: 'Unlimited trainer seats', included: true },
      { label: 'Multi-branch rollup & cohort analytics', included: true },
      { label: 'Dedicated success manager', included: true },
    ],
  },
];

export const PAYMENT_HISTORY: readonly PaymentRecord[] = [
  {
    id: 'INV-1214',
    date: '12 Aug 2026',
    invoice: 'INV-1214',
    plan: 'Wrath Pro · monthly',
    amount: 9439,
    state: 'Paid',
    method: 'Card 4417',
    action: 'Invoice',
    note: 'INV-1214 downloaded',
  },
  {
    id: 'INV-1213',
    date: '11 Aug 2026',
    invoice: 'INV-1213',
    plan: 'Wrath Pro · monthly',
    amount: 9439,
    state: 'Failed',
    method: 'Card 4417',
    action: 'Retry',
    note: 'Retried on 12 Aug and succeeded · nothing owed',
  },
  {
    id: 'INV-1209',
    date: '05 Aug 2026',
    invoice: 'INV-1209',
    plan: '2 extra trainer seats',
    amount: 2358,
    state: 'Paid',
    method: 'UPI',
    action: 'Invoice',
    note: 'INV-1209 downloaded',
  },
  {
    id: 'INV-1183',
    date: '12 Jul 2026',
    invoice: 'INV-1183',
    plan: 'Wrath Pro · monthly',
    amount: 9439,
    state: 'Paid',
    method: 'Card 4417',
    action: 'Invoice',
    note: 'INV-1183 downloaded · GST corrected 28 Jul',
  },
  {
    id: 'CRN-0042',
    date: '18 Jun 2026',
    invoice: 'CRN-0042',
    plan: 'Refund · duplicate charge',
    amount: -9439,
    state: 'Refunded',
    method: 'Card 4417',
    action: 'Note',
    note: 'Refunded in 4 working days · credit note CRN-0042',
  },
  {
    id: 'INV-1147',
    date: '12 Jun 2026',
    invoice: 'INV-1147',
    plan: 'Wrath Core · monthly',
    amount: 3539,
    state: 'Paid',
    method: 'UPI',
    action: 'Invoice',
    note: 'INV-1147 downloaded',
  },
];
