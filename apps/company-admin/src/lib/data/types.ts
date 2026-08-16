/**
 * Domain types for the Wrath Core admin console.
 *
 * These describe the shape the console renders. When the API lands, the fixtures
 * in this folder get replaced by fetches that return exactly these types — no
 * component has to change.
 */

export const PLAN_NAMES = ['Studio', 'Scale', 'Enterprise'] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

export const GYM_STATUSES = ['Active', 'Trial', 'Past due', 'Churned'] as const;
export type GymStatus = (typeof GYM_STATUSES)[number];

export const INVOICE_STATUSES = ['Paid', 'Pending', 'Failed', 'Trial'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Anything that can drive a status dot, including the client-only "Suspended". */
export type StatusLabel = GymStatus | InvoiceStatus | 'Suspended';

export const AUDIT_KINDS = ['Invite', 'Billing', 'Plan', 'Org', 'Access'] as const;
export type AuditKind = (typeof AUDIT_KINDS)[number];

export interface Gym {
  id: string;
  name: string;
  city: string;
  plan: PlanName;
  sites: number;
  members: number;
  seatsUsed: number;
  seatsTotal: number;
  /** Monthly recurring revenue in rupees. */
  mrr: number;
  status: GymStatus;
  /** Month the account started, e.g. "Mar 2023". */
  since: string;
  owner: string;
  email: string;
  /** 0-100 composite account health. */
  health: number;
  lastSeen: string;
  trainers: number;
  /** Owner app build the account was last seen on. */
  app: string;
}

export interface GymSite {
  name: string;
  members: number;
  checkInsToday: number;
  state: string;
}

export interface Invoice {
  id: string;
  org: string;
  period: string;
  /** Pre-formatted for display; the API will send minor units instead. */
  amount: string;
  method: string;
  status: InvoiceStatus;
}

export interface AuditEntry {
  id: string;
  time: string;
  kind: AuditKind;
  text: string;
  actor: string;
  ip: string;
}

export interface PlanTierRow {
  label: string;
  value: string;
}

export interface PlanTier {
  id: PlanName;
  /** Display name, set in the design's all-caps voice. */
  name: string;
  tag: string;
  price: string;
  /** The recommended tier gets the accent border. */
  featured: boolean;
  rows: PlanTierRow[];
}

export interface FeatureRow {
  name: string;
  studio: string;
  scale: string;
  enterprise: string;
}

export interface Invite {
  id: string;
  org: string;
  email: string;
  plan: PlanName;
  sent: string;
  token: string;
}
