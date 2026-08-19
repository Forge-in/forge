/**
 * The confirmation strip that slides in above the tab bar.
 *
 * The design renders it as a plain conditional block; here it fades and lifts into place so it
 * reads as arriving rather than blinking into existence — suppressed, like every other
 * animation in the app, when the OS asks for reduced motion.
 *
 * It is marked as a live region so TalkBack picks it up, and `pointerEvents="none"` so it never
 * swallows a tap meant for the CTA underneath.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { mono, radii, useTheme } from '../../theme';
import { AppText } from './AppText';

const ENTER_MS = 180;
const LIFT_PX = 10;

export function Toast({ message, bottom }: { message: string | null; bottom: number }) {
  const { colors, shadow } = useTheme();
  const reduceMotion = useReducedMotion();
  // Lazy state rather than a ref — see PulseDot: this value is read during render.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (message === null) {
      progress.setValue(0);
      return;
    }
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [message, progress, reduceMotion]);

  if (message === null) return null;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      testID="toast"
      style={[
        styles.container,
        {
          bottom,
          backgroundColor: colors.ink,
          boxShadow: shadow.toast,
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [LIFT_PX, 0],
              }),
            },
          ],
        },
      ]}
    >
      <AppText style={[styles.text, { color: colors.bg }]}>{message}</AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 22,
    right: 22,
    borderRadius: radii.toast,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  text: mono(10, { tracking: 0.04 }),
});
