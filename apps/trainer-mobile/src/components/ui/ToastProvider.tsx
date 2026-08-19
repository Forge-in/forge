/**
 * Transient confirmation messages.
 *
 * Mirrors the design's `say()` helper: one message at a time, replacing any message already on
 * screen, auto-dismissing after 2.6s. It lives in its own provider rather than in session state
 * because it is pure view ephemera — nothing in the domain should have to know a toast is up.
 *
 * The message is also announced to screen readers, which the design (being a visual mock) had
 * no way to do. A toast that only exists visually is invisible confirmation for anyone using
 * VoiceOver or TalkBack.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';

export const TOAST_DURATION_MS = 2600;

export interface ToastContextValue {
  message: string | null;
  show: (message: string) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setMessage(null);
  }, [clearTimer]);

  const show = useCallback(
    (next: string) => {
      clearTimer();
      setMessage(next);
      AccessibilityInfo.announceForAccessibility(next);
      timer.current = setTimeout(() => {
        timer.current = null;
        setMessage(null);
      }, TOAST_DURATION_MS);
    },
    [clearTimer],
  );

  // Without this, a toast raised immediately before unmount leaves a timer holding a setState
  // on a torn-down tree.
  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo<ToastContextValue>(() => ({ message, show, hide }), [message, show, hide]);

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside a <ToastProvider>');
  return value;
}
