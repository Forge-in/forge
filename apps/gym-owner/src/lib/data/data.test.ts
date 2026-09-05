import { describe, expect, it } from 'vitest';

import {
  ATTENDANCE_ROWS,
  CHECK_INS_BY_HOUR,
  DOOR_FEED,
  FEE_ROWS,
  FEE_BUCKETS,
  GYM_FIELD_SPECS,
  GYM_FIELDS,
  HEATMAP_DAYS,
  HEATMAP_HOURS,
  HOUR_LABELS,
  MEMBERS,
  MEMBERSHIP_PLANS,
  MEMBER_TOTAL,
  OPERATING_RULES,
  OPERATING_RULE_SPECS,
  PAYMENT_HISTORY,
  PENDING_INVITES,
  PLAN_CARDS,
  REVENUE_BY_MODE,
  SHIFTS,
  STAFF,
  SUBSCRIPTION,
  TRAINER_DEVICES,
  TRAINER_OPTIONS,
  TRAINER_PERMISSIONS,
  TRAINER_PERMISSION_SPECS,
  WEEK,
  WEEKDAYS,
  sessionsFor,
} from './index';

/**
 * Integrity checks on the dataset itself.
 *
 * These are cheap and they catch the class of bug that no type can: a duplicate
 * key that makes React reuse the wrong row, a share that sums to more than the
 * whole, a spec list that has drifted out of step with the record it describes.
 * They also become the contract the real endpoints have to satisfy.
 */

function expectUniqueIds(rows: readonly { id: string }[], label: string) {
  const ids = rows.map((row) => row.id);
  expect(new Set(ids).size, `${label} has a duplicate id`).toBe(ids.length);
}

describe('identity', () => {
  it.each([
    ['members', MEMBERS],
    ['staff', STAFF],
    ['attendance rows', ATTENDANCE_ROWS],
    ['door feed', DOOR_FEED],
    ['trainer devices', TRAINER_DEVICES],
    ['pending invites', PENDING_INVITES],
    ['payment history', PAYMENT_HISTORY],
  ])('%s all have unique ids', (label, rows) => {
    expectUniqueIds(rows, label);
  });

  it('gives every fee row a unique id across all buckets', () => {
    const all = FEE_BUCKETS.flatMap((bucket) => FEE_ROWS[bucket]);
    expectUniqueIds(all, 'fee rows');
  });

  it('gives every session a unique id within its day and view', () => {
    for (const day of WEEKDAYS) {
      for (const view of ['Group', 'Personal'] as const) {
        expectUniqueIds(sessionsFor(day, view), `${day}/${view}`);
      }
    }
  });

  it('gives every membership plan and trainer option a unique id', () => {
    expectUniqueIds(MEMBERSHIP_PLANS, 'plans');
    expectUniqueIds(TRAINER_OPTIONS, 'trainers');
  });
});

describe('members', () => {
  it('never has more sample rows than the real member count', () => {
    expect(MEMBERS.length).toBeLessThanOrEqual(MEMBER_TOTAL);
  });

  it('has no two members sharing a phone number', () => {
    const phones = MEMBERS.map((member) => member.phone.replace(/\D/g, ''));
    expect(new Set(phones).size).toBe(phones.length);
  });

  it('keeps attendance within 0-100', () => {
    for (const member of MEMBERS) {
      expect(member.attendance).toBeGreaterThanOrEqual(0);
      expect(member.attendance).toBeLessThanOrEqual(100);
    }
  });

  /** A frozen membership is held, so there is nothing to owe and nothing to log. */
  it('gives a frozen membership no attendance and no balance', () => {
    for (const member of MEMBERS.filter((m) => m.status === 'Frozen')) {
      expect(member.attendance).toBe(0);
      expect(member.due).toBe(0);
    }
  });

  it('gives every overdue member a balance to chase', () => {
    for (const member of MEMBERS.filter((m) => m.status === 'Overdue')) {
      expect(member.due).toBeGreaterThan(0);
    }
  });

  it('covers every status the table can render', () => {
    const statuses = new Set(MEMBERS.map((member) => member.status));
    expect(statuses.size).toBeGreaterThanOrEqual(6);
  });
});

describe('charts', () => {
  it('lines the hourly check-in series up with its axis labels', () => {
    expect(CHECK_INS_BY_HOUR).toHaveLength(HOUR_LABELS.length);
  });

  it('gives every heatmap day one cell per band', () => {
    for (const day of HEATMAP_DAYS) {
      expect(day.cells, day.label).toHaveLength(HEATMAP_HOURS.length);
    }
  });

  it('keeps every heat level inside the ramp', () => {
    for (const day of HEATMAP_DAYS) {
      for (const cell of day.cells) {
        expect(cell).toBeGreaterThanOrEqual(0);
        expect(cell).toBeLessThanOrEqual(5);
      }
    }
  });

  it('marks exactly one heatmap day as today', () => {
    expect(HEATMAP_DAYS.filter((day) => day.today)).toHaveLength(1);
  });

  /** The split bar is a whole, so its slices must not claim more than 100%. */
  it('keeps the payment-mode shares at or under one', () => {
    const total = REVENUE_BY_MODE.reduce((sum, line) => sum + line.share, 0);
    expect(total).toBeLessThanOrEqual(1.0001);
    expect(total).toBeGreaterThan(0.9);
  });
});

describe('schedule', () => {
  it('has one week entry per weekday, in order', () => {
    expect(WEEK.map((entry) => entry.day)).toEqual([...WEEKDAYS]);
  });

  it('keeps a closed day genuinely empty, so the empty state is reachable', () => {
    const sunday = WEEK.find((entry) => entry.day === 'Sun');
    expect(sunday?.sessions).toBe(0);
    expect(sessionsFor('Sun', 'Group')).toEqual([]);
    expect(sessionsFor('Sun', 'Personal')).toEqual([]);
  });

  it('never lets a session hold more people than it has seats', () => {
    for (const day of WEEKDAYS) {
      for (const view of ['Group', 'Personal'] as const) {
        for (const session of sessionsFor(day, view)) {
          expect(session.capacity, session.name).toBeGreaterThan(0);
          expect(session.filled, session.name).toBeLessThanOrEqual(session.capacity);
          expect(session.filled, session.name).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('models a PT session as a single seat', () => {
    for (const session of sessionsFor('Wed', 'Personal')) {
      expect(session.capacity).toBe(1);
    }
  });

  it('leaves an unassigned session without a trainer, and vice versa', () => {
    for (const session of sessionsFor('Wed', 'Group')) {
      expect(session.trainer === null).toBe(session.status === 'Unassigned');
    }
  });

  it('keeps every shift bar inside the day and running forwards', () => {
    for (const shift of SHIFTS) {
      expect(shift.start, shift.name).toBeGreaterThanOrEqual(0);
      expect(shift.end, shift.name).toBeLessThanOrEqual(1);
      expect(shift.end, shift.name).toBeGreaterThan(shift.start);
    }
  });
});

describe('specs match their records', () => {
  it('describes every gym field exactly once, in field order', () => {
    expect(GYM_FIELD_SPECS.map((spec) => spec.key)).toEqual([...GYM_FIELDS]);
  });

  it('describes every operating rule exactly once', () => {
    expect(new Set(OPERATING_RULE_SPECS.map((spec) => spec.key))).toEqual(new Set(OPERATING_RULES));
  });

  it('describes every trainer permission exactly once', () => {
    expect(new Set(TRAINER_PERMISSION_SPECS.map((spec) => spec.key))).toEqual(
      new Set(TRAINER_PERMISSIONS),
    );
  });
});

describe('subscription', () => {
  it('never reports more seats used than the plan includes', () => {
    expect(SUBSCRIPTION.seatsUsed).toBeLessThanOrEqual(SUBSCRIPTION.seatsTotal);
  });

  it('never reports more members than the plan allows', () => {
    expect(SUBSCRIPTION.membersUsed).toBeLessThanOrEqual(SUBSCRIPTION.membersAllowed);
  });

  it('keeps the days left inside the billing cycle, so the ring cannot overrun', () => {
    expect(SUBSCRIPTION.daysLeft).toBeGreaterThanOrEqual(0);
    expect(SUBSCRIPTION.daysLeft).toBeLessThanOrEqual(SUBSCRIPTION.cycleDays);
  });

  it('prices the three tiers in ascending order', () => {
    const prices = PLAN_CARDS.map((plan) => plan.monthlyPrice);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  /** A credit note is the only negative line; everything else is a charge. */
  it('records a refund as a negative amount', () => {
    const refunds = PAYMENT_HISTORY.filter((payment) => payment.state === 'Refunded');
    expect(refunds.length).toBeGreaterThan(0);
    for (const refund of refunds) expect(refund.amount).toBeLessThan(0);
    for (const paid of PAYMENT_HISTORY.filter((p) => p.state !== 'Refunded')) {
      expect(paid.amount).toBeGreaterThan(0);
    }
  });
});
