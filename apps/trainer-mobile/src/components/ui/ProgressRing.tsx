/**
 * The gilded progress dial.
 *
 * Three sizes of it carry the design: the Today dial (236px), the runner clock (226px) and the
 * client adherence ring (96px). All three are the same construction — a track circle, a
 * gradient arc driven by `stroke-dashoffset`, rotated -90deg so 0% starts at twelve o'clock —
 * so they share one component and differ only by props.
 *
 * The design's gold bloom is a CSS `filter: drop-shadow(...)`. That is reproduced here as a
 * wider, translucent copy of the arc drawn underneath rather than as an SVG filter: filter
 * primitives are the least-travelled path in react-native-svg, and a halo arc costs nothing
 * and cannot fail to render.
 */
import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { circumference, clamp01, ringOffset } from '../../features/trainer/selectors';

export interface ProgressRingProps {
  /** Outer box, in points. */
  size: number;
  /**
   * Ring radius as a fraction of `size`. The design insets the stroke from the viewBox edge
   * (r=104 in a 236 box), so this is passed explicitly rather than derived from the stroke.
   */
  radiusRatio: number;
  strokeWidth: number;
  /** 0..1. Values outside the range are clamped rather than drawn backwards. */
  progress: number;
  trackColor: string;
  /** Two or three gradient stops, light to dark. */
  gradient: readonly string[];
  gradientLocations?: readonly number[];
  /** Translucent colour for the bloom behind the arc. Omit for a flat ring. */
  glowColor?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const GLOW_SPREAD = 10;
const GLOW_OPACITY = 0.35;

export function ProgressRing({
  size,
  radiusRatio,
  strokeWidth,
  progress,
  trackColor,
  gradient,
  gradientLocations,
  glowColor,
  children,
  style,
  accessibilityLabel,
}: ProgressRingProps) {
  // React's useId contains colons, which are legal in an id but awkward inside `url(#...)`.
  const gradientId = `ring-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const safeProgress = clamp01(progress);
  const center = size / 2;
  const radius = size * radiusRatio;
  const length = circumference(radius);
  const offset = ringOffset(length, safeProgress);

  const stops = gradient.map((color, index) => (
    <Stop
      key={`${color}-${index}`}
      offset={`${(gradientLocations?.[index] ?? index / Math.max(1, gradient.length - 1)) * 100}%`}
      stopColor={color}
    />
  ));

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessible={accessibilityLabel !== undefined}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(safeProgress * 100) }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.rotated}>
        <Defs>
          <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {stops}
          </LinearGradient>
        </Defs>

        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />

        {glowColor && safeProgress > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={glowColor}
            strokeWidth={strokeWidth + GLOW_SPREAD}
            strokeLinecap="round"
            strokeDasharray={[length, length]}
            strokeDashoffset={offset}
            opacity={GLOW_OPACITY}
          />
        ) : null}

        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={[length, length]}
          strokeDashoffset={offset}
        />
      </Svg>

      {children === undefined ? null : (
        <View style={styles.overlay} pointerEvents="box-none">
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // 0% has to start at twelve o'clock, not three.
  rotated: { transform: [{ rotate: '-90deg' }] },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
