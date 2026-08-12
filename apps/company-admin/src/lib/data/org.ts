import type { AuditEntry } from './types';

/**
 * The mock "internal team" and its permissions matrix used to live here: seven people with
 * roles named Superadmin / Ops / Finance / Support, and a grid of what each could do.
 *
 * All of it was fiction. Forge has exactly ONE platform role, and /team now renders the real
 * `platform_admins` table from the API. A matrix documenting four roles that cannot be
 * granted is worse than none — it is a page people would plan around. When sub-roles become
 * real, that table should be generated from the roles themselves rather than hand-written.
 */

export const AUDIT: readonly AuditEntry[] = [
  {
    id: 'au-01',
    time: 'Today 09:42',
    kind: 'Invite',
    text: 'Invite sent to farah@tidalstrength.in',
    actor: 'S. Rathore',
    ip: '10.4.11.2',
  },
  {
    id: 'au-02',
    time: 'Today 09:20',
    kind: 'Billing',
    text: 'Retried failed payment for Forge & Field',
    actor: 'Y. Ali',
    ip: '10.4.9.8',
  },
  {
    id: 'au-03',
    time: 'Today 08:55',
    kind: 'Access',
    text: 'Signed in from a new device',
    actor: 'N. Bose',
    ip: '49.36.14.201',
  },
  {
    id: 'au-04',
    time: 'Yesterday 19:08',
    kind: 'Plan',
    text: 'Meridian Barbell moved Studio → Scale',
    actor: 'N. Bose',
    ip: '10.4.9.4',
  },
  {
    id: 'au-05',
    time: 'Yesterday 17:31',
    kind: 'Org',
    text: 'Ridgeline Gym flagged past due',
    actor: 'system',
    ip: '—',
  },
  {
    id: 'au-06',
    time: 'Yesterday 15:02',
    kind: 'Invite',
    text: 'Invite accepted by aditi@basecampath.in',
    actor: 'system',
    ip: '—',
  },
  {
    id: 'au-07',
    time: 'Yesterday 11:47',
    kind: 'Billing',
    text: 'Invoice WF-2026-0416 marked paid',
    actor: 'system',
    ip: '—',
  },
  {
    id: 'au-08',
    time: '11 Aug 22:10',
    kind: 'Access',
    text: '2FA disabled for arjun@wrathfitness.com',
    actor: 'S. Rathore',
    ip: '10.4.11.2',
  },
  {
    id: 'au-09',
    time: '11 Aug 16:26',
    kind: 'Org',
    text: 'Anvil Athletic subscription cancelled',
    actor: 'T. Menon',
    ip: '10.4.9.19',
  },
  {
    id: 'au-10',
    time: '11 Aug 14:03',
    kind: 'Plan',
    text: 'Enterprise seat cap raised to 150 for Atlas',
    actor: 'S. Rathore',
    ip: '10.4.11.2',
  },
  {
    id: 'au-11',
    time: '10 Aug 20:41',
    kind: 'Billing',
    text: 'Refund ₹11,000 issued to Halden Athletic Club',
    actor: 'Y. Ali',
    ip: '10.4.9.8',
  },
  {
    id: 'au-12',
    time: '10 Aug 09:12',
    kind: 'Invite',
    text: 'Invite revoked for owner@stonepathgym.in',
    actor: 'N. Bose',
    ip: '10.4.9.4',
  },
];
