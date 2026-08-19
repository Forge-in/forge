/**
 * React binding for the session reducer, plus the ticking clock the runner needs.
 *
 * The clock is a `now` timestamp rather than a counter. Combined with the anchor stored in
 * `SessionState`, that makes elapsed time correct even when the interval does not fire —
 * which is the normal case on iOS the moment the app is backgrounded. The AppState listener
 * exists so the very first frame after a resume is already right, instead of showing a stale
 * clock for up to a second.
 *
 * Session state and elapsed time are deliberately TWO contexts. They change at completely
 * different rates: the state only when something is tapped, the clock every second while a
 * session is live. Merging them into one value made every mounted screen re-render once a
 * second during a live session — including Clients and Plans, which never show a clock.
 * Splitting them means only the screens that actually display the time pay for it.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import {
  elapsedSeconds,
  initialSessionState,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from './session-state';

export interface SessionContextValue {
  state: SessionState;
  dispatch: (action: SessionAction) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Seconds on the runner clock. Separate context — see the note at the top of this file. */
const ElapsedContext = createContext<number | null>(null);

/**
 * A `Date.now()` value that refreshes every `intervalMs` while `active`, and immediately
 * whenever the app returns to the foreground.
 */
function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;

    const sync = () => setNow(Date.now());
    sync();

    const interval = setInterval(sync, intervalMs);
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') sync();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [active, intervalMs]);

  return now;
}

export function SessionProvider({
  children,
  initialState = initialSessionState,
}: {
  children: ReactNode;
  initialState?: SessionState;
}) {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const now = useNow(state.live);

  // Memoised on `state` alone, so a clock tick does not invalidate it. `children` is a stable
  // element from the caller, so React skips the subtree and only ElapsedContext consumers
  // re-render on a tick.
  const sessionValue = useMemo<SessionContextValue>(() => ({ state, dispatch }), [state]);

  return (
    <SessionContext.Provider value={sessionValue}>
      <ElapsedContext.Provider value={elapsedSeconds(state, now)}>
        {children}
      </ElapsedContext.Provider>
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a <SessionProvider>');
  return value;
}

/**
 * Seconds elapsed in the current session.
 *
 * Only call this from a screen that actually shows the time — subscribing re-renders that
 * component every second while a session is live.
 */
export function useElapsed(): number {
  const value = useContext(ElapsedContext);
  if (value === null) throw new Error('useElapsed must be used inside a <SessionProvider>');
  return value;
}
