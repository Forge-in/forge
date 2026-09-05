/**
 * The trainer session state machine.
 *
 * Kept as a plain reducer with no React in sight so the rules that actually matter — set
 * counts never exceeding the station target, the elapsed clock surviving a backgrounded app,
 * a waitlist promotion never double-counting — can be tested directly.
 *
 * The one substantive change from the design: elapsed time is stored as an anchor
 * (`baseSeconds` + `startedAt`) rather than as a counter incremented by `setInterval`. The
 * design's version loses time whenever the JS timer is throttled, which on a phone means every
 * time the trainer locks the screen mid-session — the exact moment the clock has to stay
 * right.
 */
import {
  SETS_PER_STATION,
  exercises,
  plan,
  planDays,
  room,
  roomClientIds,
  type ClientFilter,
} from './data';

export interface SessionState {
  /** True while the runner clock is advancing. */
  live: boolean;
  /** Seconds accrued before the current live stretch started. */
  baseSeconds: number;
  /** Epoch milliseconds at which the current live stretch started; null when paused. */
  startedAt: number | null;
  exerciseIndex: number;
  selectedClientId: string;
  setsByClientId: Record<string, number>;
  presentByClientId: Record<string, boolean>;
  promotedWaitlistIds: string[];
  filter: ClientFilter;
  /** Day key of the expanded plan card, or null when all are collapsed. */
  openPlanDay: string | null;
  week: number;
}

export type SessionAction =
  | { type: 'session/start'; at: number }
  | { type: 'session/end'; at: number }
  | { type: 'exercise/next' }
  | { type: 'exercise/previous' }
  | { type: 'room/select'; clientId: string }
  | { type: 'room/logSet' }
  | { type: 'room/undoSet' }
  | { type: 'roster/filter'; filter: ClientFilter }
  | { type: 'attendance/toggle'; clientId: string }
  | { type: 'waitlist/promote'; waitlistId: string }
  | { type: 'plan/toggleDay'; day: string }
  | { type: 'plan/selectWeek'; week: number };

/**
 * Opening state, transcribed from the design's `state = { ... }`.
 *
 * The 724 seconds and the pre-filled set counts are the design's own seeding: they exist so the
 * runner reads as a session already underway rather than an empty stopwatch.
 */
export const initialSessionState: SessionState = {
  live: false,
  baseSeconds: 724,
  startedAt: null,
  exerciseIndex: 1,
  selectedClientId: 'priya-sharma',
  setsByClientId: {
    'priya-sharma': 2,
    'arjun-kapoor': 2,
    'neha-desai': 0,
    'divya-patel': 1,
    'vikram-rao': 0,
    'sana-malik': 2,
  },
  presentByClientId: {
    'priya-sharma': true,
    'arjun-kapoor': true,
    'neha-desai': false,
    'divya-patel': true,
    'vikram-rao': false,
    'sana-malik': true,
  },
  promotedWaitlistIds: [],
  filter: 'All',
  openPlanDay: 'MON',
  week: 4,
};

/**
 * Seconds shown on the runner clock at instant `now`.
 *
 * The `Math.max(0, ...)` matters in practice: a device clock corrected backwards by NTP mid
 * session would otherwise subtract time from a running session.
 */
export function elapsedSeconds(state: SessionState, now: number): number {
  if (!state.live || state.startedAt === null) return state.baseSeconds;
  return state.baseSeconds + Math.max(0, Math.floor((now - state.startedAt) / 1000));
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const isRoomMember = (clientId: string) => roomClientIds.includes(clientId);

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'session/start':
      // Idempotent: tapping "Start session" twice must not restart the anchor and lose
      // the minutes already run.
      if (state.live) return state;
      return { ...state, live: true, startedAt: action.at };

    case 'session/end': {
      if (!state.live) return state;
      return {
        ...state,
        live: false,
        baseSeconds: elapsedSeconds(state, action.at),
        startedAt: null,
      };
    }

    case 'exercise/next': {
      const next = clamp(state.exerciseIndex + 1, 0, exercises.length - 1);
      return next === state.exerciseIndex ? state : { ...state, exerciseIndex: next };
    }

    case 'exercise/previous': {
      const next = clamp(state.exerciseIndex - 1, 0, exercises.length - 1);
      return next === state.exerciseIndex ? state : { ...state, exerciseIndex: next };
    }

    case 'room/select':
      if (!isRoomMember(action.clientId) || state.selectedClientId === action.clientId) {
        return state;
      }
      return { ...state, selectedClientId: action.clientId };

    case 'room/logSet': {
      const current = state.setsByClientId[state.selectedClientId] ?? 0;
      if (current >= SETS_PER_STATION) return state;
      return {
        ...state,
        setsByClientId: { ...state.setsByClientId, [state.selectedClientId]: current + 1 },
      };
    }

    case 'room/undoSet': {
      const current = state.setsByClientId[state.selectedClientId] ?? 0;
      if (current <= 0) return state;
      return {
        ...state,
        setsByClientId: { ...state.setsByClientId, [state.selectedClientId]: current - 1 },
      };
    }

    case 'roster/filter':
      return state.filter === action.filter ? state : { ...state, filter: action.filter };

    case 'attendance/toggle': {
      if (!isRoomMember(action.clientId)) return state;
      return {
        ...state,
        presentByClientId: {
          ...state.presentByClientId,
          [action.clientId]: !state.presentByClientId[action.clientId],
        },
      };
    }

    case 'waitlist/promote':
      // Promotion is one-way. Re-tapping a promoted row must not inflate the head count.
      if (state.promotedWaitlistIds.includes(action.waitlistId)) return state;
      return {
        ...state,
        promotedWaitlistIds: [...state.promotedWaitlistIds, action.waitlistId],
      };

    case 'plan/toggleDay': {
      const isOpen = state.openPlanDay === action.day;
      if (!isOpen && !planDays.some((day) => day.day === action.day)) return state;
      return { ...state, openPlanDay: isOpen ? null : action.day };
    }

    case 'plan/selectWeek': {
      const next = clamp(Math.round(action.week), 1, plan.totalWeeks);
      return next === state.week ? state : { ...state, week: next };
    }

    default:
      return state;
  }
}

/** Room size, used for the "N sets across M clients" summary when a session ends. */
export const roomSize = room.length;
