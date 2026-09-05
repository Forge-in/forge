/**
 * The breathing status dot beside "In session now" and "Live · 6 in room".
 *
 * Reproduces the design's `@keyframes gpulse` (opacity 0.9 -> 0.35 -> 0.9). Driven natively so
 * it never competes with the JS thread while the runner clock is ticking, and skipped entirely
 * when the OS asks for reduced motion — an indefinite loop is precisely what that setting is
 * meant to silence.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';

const PEAK_OPACITY = 0.9;
const TROUGH_OPACITY = 0.35;

export interface PulseDotProps {
  color: string;
  /** Full cycle length in ms — 1800 on Today, 1400 in the runner. */
  durationMs: number;
  size?: number;
}

export function PulseDot({ color, durationMs, size = 6 }: PulseDotProps) {
  const reduceMotion = useReducedMotion();
  // Lazy state, not a ref: the value is read during render to drive the style, and a ref read
  // in render is exactly what `react-hooks/refs` forbids.
  const [opacity] = useState(() => new Animated.Value(PEAK_OPACITY));

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(PEAK_OPACITY);
      return;
    }

    const half = durationMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: TROUGH_OPACITY,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: PEAK_OPACITY,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [durationMs, opacity, reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: { flexShrink: 0 },
});
