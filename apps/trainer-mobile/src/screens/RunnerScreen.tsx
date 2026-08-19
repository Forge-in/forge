/**
 * Runner — the live session screen.
 *
 * This is the one screen used with a phone in one hand and a stopwatch running, so it is also
 * the one where the touch targets are largest and the state is most guarded: sets clamp at the
 * station target, the station stepper stops at both ends, and the clock is derived from a
 * timestamp so it stays right across a screen lock.
 *
 * It hides the tab bar (see `showsTabBar`), which is why its CTAs sit lower than elsewhere.
 */
import { useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '../components/ui/AppText';
import {
  CircleButton,
  PressableRow,
  PrimaryButton,
  SecondaryButton,
} from '../components/ui/controls';
import { Card, GoldFill, SectionHeader, SectionNote } from '../components/ui/primitives';
import { ProgressRing } from '../components/ui/ProgressRing';
import { PulseDot } from '../components/ui/PulseDot';
import { useToast } from '../components/ui/ToastProvider';
import {
  SESSION_DURATION_SECONDS,
  SETS_PER_STATION,
  exercises,
  room,
  todaySession,
} from '../features/trainer/data';
import { useElapsed, useSession } from '../features/trainer/SessionProvider';
import { roomSize } from '../features/trainer/session-state';
import {
  formatClock,
  itemAt,
  sessionProgress,
  totalSetsLogged,
} from '../features/trainer/selectors';
import { useNavigation } from '../navigation/NavigationProvider';
import {
  goldGradient,
  goldGradientLocations,
  mono,
  radii,
  sans,
  serif,
  useTheme,
  useThemedStyles,
  type ThemeContextValue,
} from '../theme';

const RING_BASE_SIZE = 226;
const RING_RADIUS_RATIO = 100 / 226;
const RING_STROKE = 12;

export function RunnerScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors, shadow } = useTheme();
  const { navigate } = useNavigation();
  const { state, dispatch } = useSession();
  const elapsed = useElapsed();
  const { show } = useToast();
  const { width } = useWindowDimensions();

  const ringSize = Math.min(RING_BASE_SIZE, Math.round(width * 0.58));
  const ringScale = ringSize / RING_BASE_SIZE;

  const exercise = itemAt(exercises, state.exerciseIndex);
  const totalSets = totalSetsLogged(state.setsByClientId);
  const selected = room.find((client) => client.id === state.selectedClientId) ?? itemAt(room, 0);
  const selectedSets = state.setsByClientId[state.selectedClientId] ?? 0;

  const endSession = useCallback(() => {
    dispatch({ type: 'session/end', at: Date.now() });
    navigate({ name: 'today' });
    show(`Session logged · ${totalSets} sets across ${roomSize} clients`);
  }, [dispatch, navigate, show, totalSets]);

  const atFirstStation = state.exerciseIndex <= 0;
  const atLastStation = state.exerciseIndex >= exercises.length - 1;

  return (
    <View>
      <View style={styles.header}>
        <CircleButton
          glyph="←"
          onPress={() => navigate({ name: 'today' })}
          accessibilityLabel="Back to today"
          testID="runner-back"
        />
        <View style={styles.liveBadge}>
          <PulseDot color={colors.warn} durationMs={1400} />
          <AppText style={styles.liveLabel}>Live · {roomSize} in room</AppText>
        </View>
        <PressableRow
          onPress={endSession}
          accessibilityLabel="End session"
          accessibilityHint="Stops the clock and returns to today"
          style={styles.endButton}
          testID="end-session"
        >
          <AppText style={styles.endLabel}>End</AppText>
        </PressableRow>
      </View>

      <View style={styles.ringBlock}>
        <ProgressRing
          size={ringSize}
          radiusRatio={RING_RADIUS_RATIO}
          strokeWidth={RING_STROKE * ringScale}
          progress={sessionProgress(elapsed, SESSION_DURATION_SECONDS)}
          trackColor={colors.line}
          gradient={goldGradient(colors)}
          gradientLocations={goldGradientLocations}
          glowColor={colors.goldGlow}
          accessibilityLabel={`${formatClock(elapsed)} elapsed of ${todaySession.durationMinutes} minutes`}
        >
          <View style={styles.ringContent}>
            <AppText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[serif(60 * ringScale, { leading: 0.84 }), styles.clock]}
            >
              {formatClock(elapsed)}
            </AppText>
            <AppText
              style={[mono(9 * ringScale, { tracking: 0.16, uppercase: true }), styles.clockSub]}
            >
              of {todaySession.durationMinutes} min
            </AppText>
          </View>
        </ProgressRing>
      </View>

      <Card style={styles.exerciseCard} radius={radii.cardXl}>
        <View style={styles.stationRow}>
          <AppText style={styles.stationLabel}>
            Station {state.exerciseIndex + 1} of {exercises.length}
          </AppText>
          <View style={styles.stepper}>
            <CircleButton
              glyph="‹"
              variant="raised"
              disabled={atFirstStation}
              onPress={() => dispatch({ type: 'exercise/previous' })}
              accessibilityLabel="Previous station"
              testID="station-previous"
            />
            <CircleButton
              glyph="›"
              variant="raised"
              disabled={atLastStation}
              onPress={() => dispatch({ type: 'exercise/next' })}
              accessibilityLabel="Next station"
              testID="station-next"
            />
          </View>
        </View>
        <View style={styles.exerciseBody}>
          <AppText style={styles.exerciseName} accessibilityRole="header">
            {exercise.name}
          </AppText>
          <AppText style={styles.exerciseScheme}>{exercise.scheme}</AppText>
        </View>
      </Card>

      <SectionHeader title="In the room" style={styles.sectionHeader}>
        <SectionNote>{totalSets} sets logged</SectionNote>
      </SectionHeader>

      <View style={styles.roomGrid}>
        {room.map((client) => {
          const done = state.setsByClientId[client.id] ?? 0;
          const isSelected = state.selectedClientId === client.id;
          const body = (
            <>
              <AppText
                numberOfLines={1}
                style={[
                  styles.roomName,
                  { color: isSelected ? colors.onGold : done > 0 ? colors.ink : colors.muted },
                ]}
              >
                {client.name}
              </AppText>
              <AppText
                style={[
                  styles.roomSets,
                  { color: isSelected ? colors.onGold : done > 0 ? colors.ink : colors.muted },
                ]}
              >
                {done}/{SETS_PER_STATION}
              </AppText>
            </>
          );

          return (
            <PressableRow
              key={client.id}
              onPress={() => dispatch({ type: 'room/select', clientId: client.id })}
              accessibilityLabel={`${client.name}, ${done} of ${SETS_PER_STATION} sets`}
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.roomCell,
                isSelected ? { borderRadius: 29, boxShadow: shadow.glow10 } : null,
              ]}
              testID={`room-${client.id}`}
            >
              {isSelected ? (
                <GoldFill style={styles.roomInner}>{body}</GoldFill>
              ) : (
                <View
                  style={[
                    styles.roomInner,
                    { backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line },
                  ]}
                >
                  {body}
                </View>
              )}
            </PressableRow>
          );
        })}
      </View>

      <AppText style={styles.selectionSummary} testID="runner-selection">
        {selected.name} · {selectedSets} of {SETS_PER_STATION} sets on {exercise.name.toLowerCase()}
      </AppText>

      <View style={styles.ctaRow}>
        <PrimaryButton
          label="Log set"
          size="lg"
          disabled={selectedSets >= SETS_PER_STATION}
          onPress={() => dispatch({ type: 'room/logSet' })}
          accessibilityLabel={`Log a set for ${selected.name}`}
          style={styles.ctaPrimary}
          testID="log-set"
        />
        <SecondaryButton
          label="Undo"
          size="lg"
          disabled={selectedSets <= 0}
          onPress={() => dispatch({ type: 'room/undoSet' })}
          accessibilityLabel={`Undo the last set for ${selected.name}`}
          style={styles.ctaSecondary}
          testID="undo-set"
        />
      </View>
    </View>
  );
}

const createStyles = ({ colors, shadow }: ThemeContextValue) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 16,
    },
    liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    liveLabel: {
      ...mono(9.5, { tracking: 0.16, uppercase: true }),
      color: colors.sub,
    },
    endButton: {
      height: 38,
      paddingHorizontal: 15,
      borderRadius: radii.pill,
      backgroundColor: colors.surf,
      borderWidth: 1,
      borderColor: colors.line2,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    endLabel: { ...mono(9.5, { tracking: 0.1, uppercase: true }), color: colors.ink },

    ringBlock: { alignItems: 'center', paddingTop: 2, paddingHorizontal: 20, paddingBottom: 20 },
    ringContent: { alignItems: 'center', gap: 6, paddingHorizontal: 20 },
    clock: { color: colors.ink, textAlign: 'center' },
    clockSub: { color: colors.muted, textAlign: 'center' },

    exerciseCard: { marginHorizontal: 20, padding: 20, gap: 16, boxShadow: shadow.soft12 },
    stationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    stationLabel: {
      ...mono(9.5, { tracking: 0.14, uppercase: true }),
      color: colors.muted,
      flexShrink: 1,
    },
    stepper: { flexDirection: 'row', gap: 8, flexShrink: 0 },
    exerciseBody: { gap: 8 },
    exerciseName: { ...serif(30, { leading: 1 }), color: colors.ink },
    exerciseScheme: { ...mono(10.5, { tracking: 0.06 }), color: colors.gold },

    sectionHeader: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 14 },
    roomGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 9,
      paddingHorizontal: 20,
    },
    roomCell: { flexBasis: '48%', flexGrow: 1 },
    roomInner: {
      height: 58,
      borderRadius: 29,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    roomName: { ...sans(13.5, 500), flexShrink: 1 },
    roomSets: { ...mono(10.5), opacity: 0.8, flexShrink: 0 },

    selectionSummary: {
      ...mono(10),
      color: colors.sub,
      textAlign: 'center',
      paddingTop: 18,
      paddingBottom: 14,
      paddingHorizontal: 24,
    },

    ctaRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
    ctaPrimary: { flex: 1 },
    ctaSecondary: { width: 96 },
  });
