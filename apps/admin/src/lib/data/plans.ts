import type { FeatureRow, PlanTier } from './types';

export const PLAN_TIERS: readonly PlanTier[] = [
  {
    id: 'Studio',
    name: 'STUDIO',
    tag: 'Single site',
    price: '₹11,000',
    featured: false,
    rows: [
      { label: 'Sites', value: '1' },
      { label: 'Staff seats', value: '10' },
      { label: 'Members', value: 'Unlimited' },
      { label: 'Class booking', value: 'Included' },
      { label: 'Payments', value: 'UPI, card' },
      { label: 'Support', value: 'Email' },
    ],
  },
  {
    id: 'Scale',
    name: 'SCALE',
    tag: 'Most common',
    price: '₹16,000',
    featured: true,
    rows: [
      { label: 'Sites', value: 'Up to 10' },
      { label: 'Staff seats', value: '50' },
      { label: 'Members', value: 'Unlimited' },
      { label: 'Class booking', value: 'Included' },
      { label: 'Payments', value: '+ Autopay, NEFT' },
      { label: 'Support', value: 'Priority' },
    ],
  },
  {
    id: 'Enterprise',
    name: 'ENTERPRISE',
    tag: 'Multi-region',
    price: '₹21,000',
    featured: false,
    rows: [
      { label: 'Sites', value: 'Unlimited' },
      { label: 'Staff seats', value: '150+' },
      { label: 'Members', value: 'Unlimited' },
      { label: 'Class booking', value: 'Included + API' },
      { label: 'Payments', value: 'All + invoicing' },
      { label: 'Support', value: 'Named CSM' },
    ],
  },
];

export const FEATURE_MATRIX: readonly FeatureRow[] = [
  { name: 'Member & user management', studio: 'Yes', scale: 'Yes', enterprise: 'Yes' },
  { name: 'Trainer mobile app', studio: 'Yes', scale: 'Yes', enterprise: 'Yes' },
  { name: 'Class scheduling', studio: 'Yes', scale: 'Yes', enterprise: 'Yes' },
  { name: 'Multi-site rollups', studio: '—', scale: 'Yes', enterprise: 'Yes' },
  { name: 'Custom membership plans', studio: '3', scale: 'Unlimited', enterprise: 'Unlimited' },
  { name: 'Automated dunning', studio: '—', scale: 'Yes', enterprise: 'Yes' },
  { name: 'SSO / SAML', studio: '—', scale: '—', enterprise: 'Yes' },
  { name: 'Open API & webhooks', studio: '—', scale: 'Read', enterprise: 'Read + write' },
  { name: 'Data residency choice', studio: '—', scale: '—', enterprise: 'Yes' },
];

/** Price per site per month, used by the invite wizard's plan picker. */
export const PLAN_PRICE_LABEL: Readonly<Record<PlanTier['id'], string>> = {
  Studio: '₹11,000 / site',
  Scale: '₹16,000 / site',
  Enterprise: '₹21,000 / site',
};
