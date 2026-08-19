/**
 * Every tappable surface in the design.
 *
 * The design expresses interactivity with nothing but `cursor:pointer`, which has no mobile
 * equivalent. Each control here adds the two things a touch target needs and a mock does not:
 * a visible press state, and an accessibility role that tells a screen reader what it is.
 */
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { radii, useTheme, mono, sans } from '../../theme';
import { AppText } from './AppText';
import { GoldFill } from './primitives';

/** Opacity dip on press. Matches the weight of the design's hover treatment on the web mock. */
const PRESSED_OPACITY = 0.82;

const pressFeedback = ({ pressed }: { pressed: boolean }): ViewStyle =>
  pressed ? { opacity: PRESSED_OPACITY } : {};

/** Touch slop for the 38pt circular controls, bringing them up to the 44pt guideline. */
const CIRCLE_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;

export type ButtonSize = 'sm' | 'md' | 'lg';

/** Height, radius and label metrics per size, transcribed from the design's three CTA scales. */
const SIZES = {
  sm: { height: 58, radius: 29, fontSize: 14, tracking: 0.04 },
  md: { height: 60, radius: 30, fontSize: 15, tracking: 0.05 },
  lg: { height: 64, radius: 32, fontSize: 15, tracking: 0.05 },
} as const;

export interface ButtonProps {
  label: string;
  onPress: () => void;
  size?: ButtonSize;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
  testID?: string;
}

/** The gold CTA: "Start session", "Log set", "Publish week". */
export function PrimaryButton({
  label,
  onPress,
  size = 'md',
  style,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  testID,
}: ButtonProps) {
  const { colors, shadow } = useTheme();
  const metrics = SIZES[size];
  const glow = size === 'lg' ? shadow.glow14 : size === 'md' ? shadow.glow12b : shadow.glow12;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        { borderRadius: metrics.radius, boxShadow: glow },
        disabled ? styles.disabled : pressFeedback({ pressed }),
        style,
      ]}
    >
      <GoldFill
        style={[
          styles.center,
          { height: metrics.height, borderRadius: metrics.radius, paddingHorizontal: 18 },
        ]}
      >
        <AppText
          numberOfLines={1}
          style={[
            sans(metrics.fontSize, 600, { tracking: metrics.tracking }),
            { color: colors.onGold },
          ]}
        >
          {label}
        </AppText>
      </GoldFill>
    </Pressable>
  );
}

/** The quiet companion to a primary CTA: "Check in", "Message", "Assign", "Undo". */
export function SecondaryButton({
  label,
  onPress,
  size = 'md',
  style,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const metrics = SIZES[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.center,
        {
          height: metrics.height,
          borderRadius: metrics.radius,
          paddingHorizontal: 16,
          backgroundColor: colors.surf,
          borderWidth: 1,
          borderColor: colors.line2,
        },
        disabled ? styles.disabled : pressFeedback({ pressed }),
        style,
      ]}
    >
      <AppText numberOfLines={1} style={[sans(13.5, 500), { color: colors.ink }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

export type CircleButtonVariant = 'outline' | 'raised' | 'overlay';

export interface CircleButtonProps {
  /** The design uses single glyphs here: back arrows, chevrons, +/−. */
  glyph: string;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  fontSize?: number;
  variant?: CircleButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The circular glyph controls: header back arrows, the runner's station steppers and the
 * client-hero back button that floats over a photo.
 */
export function CircleButton({
  glyph,
  onPress,
  accessibilityLabel,
  size = 38,
  fontSize = 14,
  variant = 'outline',
  disabled = false,
  style,
  testID,
}: CircleButtonProps) {
  const { colors } = useTheme();

  const skin: ViewStyle =
    variant === 'raised'
      ? { backgroundColor: colors.raise }
      : variant === 'overlay'
        ? { backgroundColor: 'rgba(6,10,16,0.6)' }
        : { backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line2 };

  // The overlay button sits on a photo, so its glyph stays light regardless of theme.
  const glyphColor = variant === 'overlay' ? '#F4F1EA' : colors.sub;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      hitSlop={CIRCLE_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.center,
        { width: size, height: size, borderRadius: size / 2, flexShrink: 0 },
        skin,
        disabled ? styles.disabled : pressFeedback({ pressed }),
        style,
      ]}
    >
      <AppText style={[mono(fontSize), { color: glyphColor }]}>{glyph}</AppText>
    </Pressable>
  );
}

export interface ChipProps {
  label: string;
  onPress: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * The pill toggles: the roster filters and the theme switch.
 *
 * Selected chips take the gold fill; unselected ones sit on the surface with a hairline. Role
 * is `tab` so assistive tech announces the selected one as part of a set rather than as an
 * isolated button.
 */
export function Chip({
  label,
  onPress,
  selected = false,
  style,
  accessibilityLabel,
  testID,
}: ChipProps) {
  const { colors } = useTheme();

  const content = (
    <AppText
      numberOfLines={1}
      style={[
        mono(10, { tracking: 0.1, uppercase: true }),
        { color: selected ? colors.onGold : colors.sub },
      ]}
    >
      {label}
    </AppText>
  );

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [pressFeedback({ pressed }), style]}
    >
      {selected ? (
        <GoldFill style={[styles.chip, styles.center]}>{content}</GoldFill>
      ) : (
        <View
          style={[
            styles.chip,
            styles.center,
            { backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line2 },
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

/**
 * The header theme switch.
 *
 * Its label names the theme it switches *to*, so it is announced as an action rather than as
 * a statement of the current state.
 */
export function ThemeToggle({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors, toggleLabel, toggleTheme } = useTheme();

  return (
    <Pressable
      onPress={toggleTheme}
      testID="theme-toggle"
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${toggleLabel.toLowerCase()} theme`}
      style={({ pressed }) => [
        styles.center,
        styles.themeToggle,
        { backgroundColor: colors.surf, borderColor: colors.line2 },
        pressFeedback({ pressed }),
        style,
      ]}
    >
      <AppText style={[mono(9.5, { tracking: 0.1, uppercase: true }), { color: colors.sub }]}>
        {toggleLabel}
      </AppText>
    </Pressable>
  );
}

export interface TextActionProps {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The small gold uppercase links: "See all", "Review", "Edit plan", "+ Add exercise". */
export function TextAction({ label, onPress, accessibilityLabel, style, testID }: TextActionProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      hitSlop={CIRCLE_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [pressFeedback({ pressed }), style]}
    >
      <AppText style={[mono(9.5, { tracking: 0.12, uppercase: true }), { color: colors.gold }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

/**
 * A whole card that is itself a button — roster rows, agenda rows, attendance rows.
 *
 * Kept as one component so every list row gets the same press feedback and so the role is
 * declared once rather than at eleven call sites.
 */
export function PressableRow({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  style,
  testID,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  accessibilityState?: PressableProps['accessibilityState'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      style={({ pressed }) => [pressFeedback({ pressed }), style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  chip: {
    height: 40,
    paddingHorizontal: 17,
    borderRadius: radii.chip,
  },
  themeToggle: {
    height: 38,
    paddingHorizontal: 13,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexShrink: 0,
  },
});
