/**
 * Non-interactive building blocks shared by the screens: the gold fill, the card shell, the
 * section header and the ringed initials avatar.
 *
 * Anything that responds to a tap lives in `controls.tsx` instead.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  goldGradient,
  goldGradientLocations,
  goldRingGradient,
  gradientDiagonal,
  radii,
  useTheme,
  mono,
  sans,
} from '../../theme';
import { AppText } from './AppText';

/**
 * The design's single gold fill, `linear-gradient(135deg, goldLt 0%, gold 52%, goldDk 100%)`.
 * Used for every primary action, every selected chip and the active tab disc.
 */
export function GoldFill({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={goldGradient(colors)}
      locations={goldGradientLocations}
      start={gradientDiagonal.start}
      end={gradientDiagonal.end}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}

/** The two-stop ring gradient the design uses around avatars and the present-count dial. */
export function GoldRingFill({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <LinearGradient
      colors={goldRingGradient(colors)}
      start={gradientDiagonal.start}
      end={gradientDiagonal.end}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}

export interface CardProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  /** Defaults to the low-contrast hairline; pass `colors.goldSoft` for the accented state. */
  borderColor?: string;
}

export function Card({ children, style, radius = radii.card, borderColor }: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: colors.surf,
          borderWidth: 1,
          borderColor: borderColor ?? colors.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** "Later today" / "Recent sessions" / "In the room" — an Archivo 600 title with an optional trailing note. */
export function SectionHeader({
  title,
  children,
  style,
}: {
  title: string;
  /** Trailing element: the design uses either a gold text action or a muted count. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sectionHeader, style]}>
      <AppText style={[headerText.title, { color: colors.ink }]} accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

/** A muted mono note sitting on the right of a section header. */
export function SectionNote({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  return <AppText style={[headerText.note, { color: colors.muted }, style]}>{children}</AppText>;
}

export interface InitialsAvatarProps {
  label: string;
  size: number;
  /** Gradient tuple for the gilded ring, or a flat colour for the muted one. */
  ring: readonly [string, string] | string;
  ringWidth: number;
  innerColor: string;
  textColor: string;
  fontSize?: number;
}

/**
 * A circular monogram inside a ring, built the way the design builds it: an outer circle with
 * padding acting as the ring, and an inner circle filled with the surface colour.
 */
export function InitialsAvatar({
  label,
  size,
  ring,
  ringWidth,
  innerColor,
  textColor,
  fontSize = 10.5,
}: InitialsAvatarProps) {
  const inner = (
    <View
      style={[
        styles.avatarInner,
        { borderRadius: (size - ringWidth * 2) / 2, backgroundColor: innerColor },
      ]}
    >
      <AppText numberOfLines={1} style={[mono(fontSize), { color: textColor }]}>
        {label}
      </AppText>
    </View>
  );

  const frame: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    padding: ringWidth,
    flexShrink: 0,
  };

  if (typeof ring === 'string') {
    return <View style={[frame, { backgroundColor: ring }]}>{inner}</View>;
  }

  return <GoldRingFill style={frame}>{inner}</GoldRingFill>;
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

const headerText = StyleSheet.create({
  title: sans(15, 600),
  note: mono(9.5, { tracking: 0.1, uppercase: true }),
});
