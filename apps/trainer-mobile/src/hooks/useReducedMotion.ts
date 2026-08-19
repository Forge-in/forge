/**
 * Tracks the OS "reduce motion" setting.
 *
 * The design has two infinitely looping pulse dots. Looping animation is exactly what that
 * setting exists to stop, so every animated component here reads this hook and renders a
 * static equivalent when it is on.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduced(enabled);
      })
      .catch(() => {
        // Older platforms can reject rather than resolve false; motion stays on, which is
        // the same behaviour as before the check existed.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
