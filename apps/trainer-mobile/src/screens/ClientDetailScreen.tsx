/**
 * Client detail — one client's adherence, trend and recent work.
 *
 * Two things the design could not express, being a static mock:
 *
 * - The screen renders the client that was actually tapped. The design wired every roster row
 *   to one hard-coded profile.
 * - The hero handles a missing or broken photo. The design used its authoring-tool image slot,
 *   which has no runtime equivalent; here an unset or failed photo falls back to a monogram
 *   rather than to an empty rectangle.
 */
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '../components/ui/AppText';
import {
  CircleButton,
  PrimaryButton,
  SecondaryButton,
  TextAction,
} from '../components/ui/controls';
import { Card, SectionHeader } from '../components/ui/primitives';
import { ProgressRing } from '../components/ui/ProgressRing';
import { useToast } from '../components/ui/ToastProvider';
import { findClient, type TrainerClient } from '../features/trainer/data';
import {
  formatPercent,
  initialsOf,
  programmeLabel,
  programmeProgress,
} from '../features/trainer/selectors';
import { useNavigation } from '../navigation/NavigationProvider';
import {
  goldRingGradient,
  gradientHorizontal,
  gradientVertical,
  mono,
  radii,
  sans,
  serif,
  useTheme,
  useThemedStyles,
  type Palette,
  type ThemeContextValue,
} from '../theme';

const ADHERENCE_RING_SIZE = 96;
const ADHERENCE_RADIUS_RATIO = 42 / 96;

/** The design's scrim over the hero photo, in literal rgba so it reads the same in both themes. */
const HERO_SCRIM = ['rgba(6,10,16,0.5)', 'rgba(6,10,16,0.05)', 'rgba(6,10,16,0.88)'] as const;
const HERO_SCRIM_LOCATIONS = [0, 0.42, 1] as const;

/** Hero text sits on the scrim, so it stays light-on-dark regardless of theme. */
const ON_SCRIM = '#F4F1EA';
const ON_SCRIM_MUTED = '#C9D0DA';

export function ClientDetailScreen({ clientId }: { clientId: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { navigate, goBack } = useNavigation();
  const { show } = useToast();

  const client = findClient(clientId);

  if (!client) {
    return (
      <View style={styles.missing}>
        <AppText style={styles.missingTitle} accessibilityRole="header">
          Client not found
        </AppText>
        <AppText style={styles.missingBody}>This profile is no longer on your roster.</AppText>
        <SecondaryButton
          label="Back to clients"
          onPress={() => navigate({ name: 'clients' })}
          style={styles.missingAction}
        />
      </View>
    );
  }

  const { profile } = client;
  const progress = programmeProgress(profile.week, profile.totalWeeks);

  return (
    <View>
      <ClientHero client={client} onBack={goBack} styles={styles} colors={colors} />

      {/* Adherence */}
      <Card style={styles.adherenceCard} radius={radii.cardLg}>
        <ProgressRing
          size={ADHERENCE_RING_SIZE}
          radiusRatio={ADHERENCE_RADIUS_RATIO}
          strokeWidth={7}
          progress={profile.adherence}
          trackColor={colors.line}
          gradient={goldRingGradient(colors)}
          accessibilityLabel={`Adherence ${formatPercent(profile.adherence)}`}
        >
          <View style={styles.adherenceCenter}>
            <AppText style={styles.adherenceValue}>{formatPercent(profile.adherence)}</AppText>
            <AppText style={styles.adherenceLabel}>Adherence</AppText>
          </View>
        </ProgressRing>

        <View style={styles.adherenceBody}>
          <View style={styles.progressBlock}>
            <View style={styles.progressHeader}>
              <AppText numberOfLines={1} style={styles.progressWeek}>
                {programmeLabel(profile.week, profile.totalWeeks)}
              </AppText>
              <AppText style={styles.progressPct}>{formatPercent(progress)}</AppText>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.line }]}>
              {progress > 0 ? (
                <LinearGradient
                  colors={[colors.goldDk, colors.goldLt]}
                  start={gradientHorizontal.start}
                  end={gradientHorizontal.end}
                  style={[styles.progressFill, { width: `${progress * 100}%` }]}
                />
              ) : null}
            </View>
          </View>
          <AppText numberOfLines={2} style={styles.nextLabel}>
            {profile.nextLabel}
          </AppText>
        </View>
      </Card>

      {/* Stats */}
      <Card style={styles.statStrip}>
        {profile.stats.map((stat, index) => (
          <View
            key={stat.label}
            style={[
              styles.statCell,
              {
                borderRightColor: index === profile.stats.length - 1 ? 'transparent' : colors.line,
              },
            ]}
          >
            <AppText style={styles.statLabel}>{stat.label}</AppText>
            <AppText numberOfLines={1} style={styles.statValue}>
              {stat.value}
            </AppText>
            <AppText
              numberOfLines={1}
              style={[styles.statDelta, { color: stat.tone === 'ok' ? colors.ok : colors.warn }]}
            >
              {stat.delta}
            </AppText>
          </View>
        ))}
      </Card>

      {/* Recent sessions */}
      <SectionHeader title="Recent sessions" style={styles.sectionHeader}>
        <TextAction
          label="Edit plan"
          onPress={() => navigate({ name: 'plans' })}
          accessibilityLabel={`Edit ${client.fullName}'s plan`}
        />
      </SectionHeader>

      <View style={styles.logList}>
        {profile.logs.map((log) => (
          <Card key={`${log.date}-${log.what}`} style={styles.logRow} radius={radii.log}>
            <AppText style={styles.logDate}>{log.date}</AppText>
            <AppText numberOfLines={1} style={styles.logWhat}>
              {log.what}
            </AppText>
            <AppText style={styles.logLoad}>{log.load}</AppText>
          </Card>
        ))}
      </View>

      <View style={styles.ctaRow}>
        <PrimaryButton
          label="Log progress"
          size="sm"
          onPress={() => show(`Progress sheet open for ${client.name}`)}
          style={styles.ctaPrimary}
          testID="log-progress"
        />
        <SecondaryButton
          label="Message"
          size="sm"
          onPress={() => show(`Message thread open · ${client.name}`)}
          style={styles.ctaSecondary}
          accessibilityLabel={`Message ${client.fullName}`}
        />
      </View>
    </View>
  );
}

function ClientHero({
  client,
  onBack,
  styles,
  colors,
}: {
  client: TrainerClient;
  onBack: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: Palette;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUri = client.profile.photoUri;
  const showPhoto = photoUri !== undefined && !photoFailed;

  return (
    <View style={[styles.hero, { backgroundColor: colors.raise }]}>
      {showPhoto ? (
        <Image
          source={{ uri: photoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setPhotoFailed(true)}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
      ) : (
        <View style={styles.heroPlaceholder} accessibilityElementsHidden>
          <AppText style={[styles.heroMonogram, { color: colors.goldSoft }]}>
            {initialsOf(client.fullName)}
          </AppText>
        </View>
      )}

      <LinearGradient
        colors={HERO_SCRIM}
        locations={HERO_SCRIM_LOCATIONS}
        start={gradientVertical.start}
        end={gradientVertical.end}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <CircleButton
        glyph="←"
        variant="overlay"
        onPress={onBack}
        accessibilityLabel="Back to clients"
        style={styles.heroBack}
        testID="client-back"
      />

      <View style={styles.heroText} pointerEvents="none">
        <AppText style={styles.heroName} accessibilityRole="header">
          {client.fullName}
        </AppText>
        <AppText numberOfLines={2} style={styles.heroPlan}>
          {client.profile.plan}
        </AppText>
      </View>
    </View>
  );
}

const createStyles = ({ colors, shadow }: ThemeContextValue) =>
  StyleSheet.create({
    hero: {
      marginTop: 12,
      marginHorizontal: 20,
      height: 232,
      borderRadius: radii.hero,
      overflow: 'hidden',
      boxShadow: shadow.soft14,
    },
    heroPlaceholder: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroMonogram: serif(96, { leading: 1 }),
    heroBack: { position: 'absolute', top: 14, left: 14 },
    heroText: { position: 'absolute', left: 20, right: 20, bottom: 18, gap: 7 },
    heroName: { ...serif(31, { leading: 0.98 }), color: ON_SCRIM },
    heroPlan: { ...mono(10), color: ON_SCRIM_MUTED },

    adherenceCard: {
      marginTop: 12,
      marginHorizontal: 20,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 18,
      boxShadow: shadow.soft10,
    },
    adherenceCenter: { alignItems: 'center', gap: 1 },
    adherenceValue: { ...serif(26, { leading: 0.85 }), color: colors.ink },
    adherenceLabel: {
      ...mono(7.5, { tracking: 0.14, uppercase: true }),
      color: colors.muted,
    },
    adherenceBody: { flex: 1, gap: 12, minWidth: 0 },
    progressBlock: { gap: 7 },
    progressHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    progressWeek: {
      ...mono(9.5, { tracking: 0.1, uppercase: true }),
      color: colors.sub,
      flexShrink: 1,
    },
    progressPct: { ...mono(9.5), color: colors.muted, flexShrink: 0 },
    progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row' },
    progressFill: { borderRadius: 3, height: '100%' },
    nextLabel: { ...mono(10), color: colors.muted },

    statStrip: { marginTop: 12, marginHorizontal: 20, flexDirection: 'row' },
    statCell: {
      flex: 1,
      paddingVertical: 16,
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 6,
      borderRightWidth: 1,
    },
    statLabel: {
      ...mono(8.5, { tracking: 0.12, uppercase: true }),
      color: colors.muted,
      textAlign: 'center',
    },
    statValue: { ...sans(15.5, 600), color: colors.ink },
    statDelta: mono(9),

    sectionHeader: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 14 },
    logList: { gap: 9, paddingHorizontal: 20 },
    logRow: {
      paddingVertical: 14,
      paddingHorizontal: 17,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
    },
    logDate: { ...mono(10), color: colors.muted, width: 46, flexShrink: 0 },
    logWhat: { ...sans(14, 500), color: colors.ink, flex: 1, minWidth: 0 },
    logLoad: { ...mono(10), color: colors.sub, flexShrink: 0 },

    ctaRow: { flexDirection: 'row', gap: 10, paddingTop: 20, paddingHorizontal: 20 },
    ctaPrimary: { flex: 1 },
    ctaSecondary: { width: 112 },

    missing: { paddingTop: 60, paddingHorizontal: 24, gap: 12, alignItems: 'center' },
    missingTitle: { ...serif(28, { leading: 1 }), color: colors.ink },
    missingBody: { ...mono(10.5), color: colors.muted, textAlign: 'center' },
    missingAction: { marginTop: 8, minWidth: 180 },
  });
