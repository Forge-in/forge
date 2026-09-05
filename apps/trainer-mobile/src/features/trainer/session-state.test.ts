import { SETS_PER_STATION, exercises, plan } from './data';
import {
  elapsedSeconds,
  initialSessionState,
  sessionReducer,
  type SessionState,
} from './session-state';

const at = (state: SessionState, action: Parameters<typeof sessionReducer>[1]) =>
  sessionReducer(state, action);

const START = 1_700_000_000_000;

describe('the elapsed clock', () => {
  it('reports the stored base while paused, ignoring the wall clock', () => {
    expect(elapsedSeconds(initialSessionState, START + 60_000)).toBe(724);
  });

  it('advances from the anchor once live', () => {
    const live = at(initialSessionState, { type: 'session/start', at: START });
    expect(elapsedSeconds(live, START + 30_000)).toBe(754);
  });

  it('keeps counting across a gap the JS timer never ticked through', () => {
    // The app was backgrounded for ten minutes: no interval fired, but the clock must be right
    // on the very first frame after the resume.
    const live = at(initialSessionState, { type: 'session/start', at: START });
    expect(elapsedSeconds(live, START + 600_000)).toBe(724 + 600);
  });

  it('never runs backwards when the device clock is corrected', () => {
    const live = at(initialSessionState, { type: 'session/start', at: START });
    expect(elapsedSeconds(live, START - 45_000)).toBe(724);
  });
});

describe('starting and ending a session', () => {
  it('anchors the clock on start', () => {
    const live = at(initialSessionState, { type: 'session/start', at: START });
    expect(live.live).toBe(true);
    expect(live.startedAt).toBe(START);
  });

  it('is idempotent, so a double tap does not reset the anchor', () => {
    const first = at(initialSessionState, { type: 'session/start', at: START });
    const second = at(first, { type: 'session/start', at: START + 90_000 });
    expect(second).toBe(first);
    expect(elapsedSeconds(second, START + 90_000)).toBe(724 + 90);
  });

  it('freezes the accrued time on end', () => {
    const live = at(initialSessionState, { type: 'session/start', at: START });
    const ended = at(live, { type: 'session/end', at: START + 120_000 });
    expect(ended.live).toBe(false);
    expect(ended.startedAt).toBeNull();
    expect(ended.baseSeconds).toBe(724 + 120);
    expect(elapsedSeconds(ended, START + 999_999)).toBe(724 + 120);
  });

  it('ignores an end while already stopped', () => {
    expect(at(initialSessionState, { type: 'session/end', at: START })).toBe(initialSessionState);
  });

  it('resumes from where it stopped', () => {
    const live = at(initialSessionState, { type: 'session/start', at: START });
    const ended = at(live, { type: 'session/end', at: START + 60_000 });
    const restarted = at(ended, { type: 'session/start', at: START + 500_000 });
    expect(elapsedSeconds(restarted, START + 530_000)).toBe(724 + 60 + 30);
  });
});

describe('stations', () => {
  it('steps forward and back', () => {
    const next = at(initialSessionState, { type: 'exercise/next' });
    expect(next.exerciseIndex).toBe(2);
    expect(at(next, { type: 'exercise/previous' }).exerciseIndex).toBe(1);
  });

  it('stops at the last station', () => {
    let state = initialSessionState;
    for (let i = 0; i < 20; i += 1) state = at(state, { type: 'exercise/next' });
    expect(state.exerciseIndex).toBe(exercises.length - 1);
  });

  it('stops at the first station', () => {
    let state = initialSessionState;
    for (let i = 0; i < 20; i += 1) state = at(state, { type: 'exercise/previous' });
    expect(state.exerciseIndex).toBe(0);
  });

  it('returns the same object when already at a bound, so nothing re-renders', () => {
    const first = { ...initialSessionState, exerciseIndex: 0 };
    expect(at(first, { type: 'exercise/previous' })).toBe(first);
  });
});

describe('logging sets', () => {
  it('increments the selected client only', () => {
    const logged = at(initialSessionState, { type: 'room/logSet' });
    expect(logged.setsByClientId['priya-sharma']).toBe(3);
    expect(logged.setsByClientId['arjun-kapoor']).toBe(2);
  });

  it('clamps at the station target', () => {
    let state = initialSessionState;
    for (let i = 0; i < 10; i += 1) state = at(state, { type: 'room/logSet' });
    expect(state.setsByClientId['priya-sharma']).toBe(SETS_PER_STATION);
  });

  it('clamps undo at zero', () => {
    let state = at(initialSessionState, { type: 'room/select', clientId: 'neha-desai' });
    for (let i = 0; i < 5; i += 1) state = at(state, { type: 'room/undoSet' });
    expect(state.setsByClientId['neha-desai']).toBe(0);
  });

  it('undoes a logged set', () => {
    const logged = at(initialSessionState, { type: 'room/logSet' });
    expect(at(logged, { type: 'room/undoSet' }).setsByClientId['priya-sharma']).toBe(2);
  });

  it('refuses to select someone who is not in the room', () => {
    const state = at(initialSessionState, { type: 'room/select', clientId: 'not-a-client' });
    expect(state).toBe(initialSessionState);
  });
});

describe('attendance', () => {
  it('toggles a client in and back out', () => {
    const checkedIn = at(initialSessionState, {
      type: 'attendance/toggle',
      clientId: 'neha-desai',
    });
    expect(checkedIn.presentByClientId['neha-desai']).toBe(true);
    expect(
      at(checkedIn, { type: 'attendance/toggle', clientId: 'neha-desai' }).presentByClientId[
        'neha-desai'
      ],
    ).toBe(false);
  });

  it('ignores a client who is not booked into the class', () => {
    expect(at(initialSessionState, { type: 'attendance/toggle', clientId: 'ghost' })).toBe(
      initialSessionState,
    );
  });
});

describe('waitlist promotion', () => {
  it('promotes once', () => {
    const promoted = at(initialSessionState, {
      type: 'waitlist/promote',
      waitlistId: 'rohan-tiwari',
    });
    expect(promoted.promotedWaitlistIds).toEqual(['rohan-tiwari']);
  });

  it('is one-way, so a second tap cannot inflate the head count', () => {
    const once = at(initialSessionState, { type: 'waitlist/promote', waitlistId: 'rohan-tiwari' });
    expect(at(once, { type: 'waitlist/promote', waitlistId: 'rohan-tiwari' })).toBe(once);
  });
});

describe('the plan screen', () => {
  it('collapses the open day when it is tapped again', () => {
    expect(at(initialSessionState, { type: 'plan/toggleDay', day: 'MON' }).openPlanDay).toBeNull();
  });

  it('opens a different day', () => {
    expect(at(initialSessionState, { type: 'plan/toggleDay', day: 'WED' }).openPlanDay).toBe('WED');
  });

  it('ignores a day that is not in the plan', () => {
    expect(at(initialSessionState, { type: 'plan/toggleDay', day: 'SUN' })).toBe(
      initialSessionState,
    );
  });

  it('clamps the week to the length of the programme', () => {
    expect(at(initialSessionState, { type: 'plan/selectWeek', week: 99 }).week).toBe(
      plan.totalWeeks,
    );
    expect(at(initialSessionState, { type: 'plan/selectWeek', week: 0 }).week).toBe(1);
  });
});

describe('the roster filter', () => {
  it('changes the filter', () => {
    expect(at(initialSessionState, { type: 'roster/filter', filter: 'Lapsed' }).filter).toBe(
      'Lapsed',
    );
  });

  it('is a no-op when the filter is already selected', () => {
    expect(at(initialSessionState, { type: 'roster/filter', filter: 'All' })).toBe(
      initialSessionState,
    );
  });
});

it('never mutates the state it is given', () => {
  const snapshot = JSON.parse(JSON.stringify(initialSessionState)) as SessionState;
  at(initialSessionState, { type: 'room/logSet' });
  at(initialSessionState, { type: 'attendance/toggle', clientId: 'neha-desai' });
  at(initialSessionState, { type: 'session/start', at: START });
  expect(initialSessionState).toEqual(snapshot);
});
