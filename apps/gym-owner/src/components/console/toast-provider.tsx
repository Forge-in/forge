'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** How long a toast stays up before it dismisses itself. */
const TOAST_DURATION_MS = 2600;

interface ToastContextValue {
  toast: string | null;
  notify: (message: string) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * The console's single notification channel.
 *
 * One toast at a time, replaced rather than queued: an owner clicking "Remind"
 * down a column of nine overdue members wants the last confirmation, not a
 * nine-deep backlog that keeps the strip on screen for half a minute.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // A toast outliving its provider would set state after unmount.
  useEffect(() => clearTimer, [clearTimer]);

  const notify = useCallback(
    (message: string) => {
      clearTimer();
      setToast(message);
      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, TOAST_DURATION_MS);
    },
    [clearTimer],
  );

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const value = useMemo<ToastContextValue>(
    () => ({ toast, notify, dismiss }),
    [toast, notify, dismiss],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
