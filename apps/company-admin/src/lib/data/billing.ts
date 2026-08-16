import type { Invoice } from './types';

export const INVOICES: readonly Invoice[] = [
  {
    id: 'WF-2026-0418',
    org: 'Atlas Performance Lab',
    period: 'Aug 2026',
    amount: '₹2,88,000',
    method: 'NEFT',
    status: 'Paid',
  },
  {
    id: 'WF-2026-0417',
    org: 'Summit Human Performance',
    period: 'Aug 2026',
    amount: '₹2,26,000',
    method: 'Autopay',
    status: 'Paid',
  },
  {
    id: 'WF-2026-0416',
    org: 'Northline Fitness Group',
    period: 'Aug 2026',
    amount: '₹1,44,000',
    method: 'Autopay',
    status: 'Paid',
  },
  {
    id: 'WF-2026-0415',
    org: 'Ironworks Strength Co.',
    period: 'Aug 2026',
    amount: '₹96,000',
    method: 'Autopay',
    status: 'Paid',
  },
  {
    id: 'WF-2026-0414',
    org: 'Basecamp Athletics',
    period: 'Aug 2026',
    amount: '₹80,000',
    method: 'UPI',
    status: 'Paid',
  },
  {
    id: 'WF-2026-0413',
    org: 'Meridian Barbell',
    period: 'Aug 2026',
    amount: '₹64,000',
    method: 'Autopay',
    status: 'Paid',
  },
  {
    id: 'WF-2026-0412',
    org: 'Kinetic Studios',
    period: 'Aug 2026',
    amount: '₹48,000',
    method: 'UPI',
    status: 'Pending',
  },
  {
    id: 'WF-2026-0411',
    org: 'Granite Fitness',
    period: 'Aug 2026',
    amount: '₹22,000',
    method: 'Card',
    status: 'Paid',
  },
  {
    id: 'WF-2026-0410',
    org: 'Forge & Field',
    period: 'Aug 2026',
    amount: '₹11,000',
    method: 'Card',
    status: 'Failed',
  },
  {
    id: 'WF-2026-0409',
    org: 'Ridgeline Gym',
    period: 'Aug 2026',
    amount: '₹11,000',
    method: 'Card',
    status: 'Failed',
  },
  {
    id: 'WF-2026-0408',
    org: 'Halden Athletic Club',
    period: 'Aug 2026',
    amount: '₹11,000',
    method: 'UPI',
    status: 'Paid',
  },
  {
    id: 'WF-2026-0407',
    org: 'Vantage Wellness',
    period: 'Aug 2026',
    amount: '₹0',
    method: '—',
    status: 'Trial',
  },
];

/** MRR in thousands of rupees, oldest month first. */
export const MRR_SERIES: readonly number[] = [
  612, 648, 671, 702, 735, 768, 796, 824, 861, 902, 948, 1006,
];

/** Single-letter month initials aligned to `MRR_SERIES`. */
export const MRR_MONTHS: readonly string[] = [
  'S',
  'O',
  'N',
  'D',
  'J',
  'F',
  'M',
  'A',
  'M',
  'J',
  'J',
  'A',
];
