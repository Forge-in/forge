/**
 * Plans — the week picker and the day-by-day programme beneath it.
 *
 * The week strip scrolls the selected week into view on mount, which the design's static mock
 * did not need: at week 9 or later the selection would otherwise start off-screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '../components/ui/AppText';
import {
  PressableRow,
  PrimaryButton,
  SecondaryButton,
  TextAction,
  ThemeToggle,
} from '../components/ui/controls';
import { Card, GoldFill } from '../components/ui/primitives';
import { useToast } from '../components/ui/ToastProvider';
import { plan, planDays } from '../features/trainer/data';
import { useSession } from '../features/trainer/SessionProvider';
import {
  mono,
  radii,
  sans,
  serif,
  useTheme,
  useThemedStyles,
  type ThemeContextValue,
} from '../theme';

const WEEK_PILL_SIZE = 52;
const WEEK_GAP = 8;
const WEEK_STRIP_PADDING = 20;

const weeks = Array.from({ length: plan.totalWeeks }, (_, index) => index + 1);

export function PlansScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors, shadow } = useTheme();
  const { state, dispatch } = useSession();
  const { show } = useToast();
  const weekStrip = useRef<ScrollView>(null);
  // Captured on first render so the effect below runs once. Re-scrolling on every change
  // would fight a user who has dragged the strip themselves.
  const [weekOnMount] = useState(() => state.week);

  useEffect(() => {
    const offset = Math.max(0, (weekOnMount - 1) * (WEEK_PILL_SIZE + WEEK_GAP) - WEEK_PILL_SIZE);
    weekStrip.current?.scrollTo({ x: offset, animated: false });
  }, [weekOnMount]);

  const toggleDay = useCallback(
    (day: string) => dispatch({ type: 'plan/toggleDay', day }),
    [dispatch],
  );

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText style={styles.kicker}>{plan.kicker}</AppText>
          <AppText style={styles.title} accessibilityRole="header">
            {plan.title}
          </AppText>
        </View>
        <ThemeToggle />
      </View>

      <ScrollView
        ref={weekStrip}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekStrip}
        accessibilityRole="tablist"
      >
        {weeks.map((week) => {
          const selected = state.week === week;
          const body = (
            <>
              <AppText
                style={[styles.weekKicker, { color: selected ? colors.onGold : colors.sub }]}
              >
                WK
              </AppText>
              <AppText
                style={[styles.weekNumber, { color: selected ? colors.onGold : colors.sub }]}
              >
                {week}
              </AppText>
            </>
          );

          return (
            <PressableRow
              key={week}
              onPress={() => dispatch({ type: 'plan/selectWeek', week })}
              accessibilityLabel={`Week ${week}`}
              accessibilityState={{ selected }}
              testID={`week-${week}`}
              style={
                selected
                  ? { borderRadius: WEEK_PILL_SIZE / 2, boxShadow: shadow.glow10 }
                  : undefined
              }
            >
              {selected ? (
                <GoldFill style={styles.weekPill}>{body}</GoldFill>
              ) : (
                <View
                  style={[
                    styles.weekPill,
                    { backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line2 },
                  ]}
                >
                  {body}
                </View>
              )}
            </PressableRow>
          );
        })}
      </ScrollView>

      <View style={styles.dayList}>
        {planDays.map((day) => {
          const open = state.openPlanDay === day.day;

          return (
            <Card
              key={day.day}
              radius={radii.cardLg}
              borderColor={open ? colors.goldSoft : colors.line}
              style={styles.dayCard}
            >
              <PressableRow
                onPress={() => toggleDay(day.day)}
                accessibilityLabel={`${day.day}, ${day.title}. ${day.meta}`}
                accessibilityHint={
                  open ? 'Collapses the exercise list' : 'Expands the exercise list'
                }
                accessibilityState={{ expanded: open }}
                style={styles.dayHeader}
                testID={`plan-day-${day.day}`}
              >
                {open ? (
                  <GoldFill style={styles.dayDisc}>
                    <AppText style={[styles.dayLabel, { color: colors.onGold }]}>{day.day}</AppText>
                  </GoldFill>
                ) : (
                  <View style={[styles.dayDisc, { backgroundColor: colors.raise }]}>
                    <AppText style={[styles.dayLabel, { color: colors.muted }]}>{day.day}</AppText>
                  </View>
                )}

                <View style={styles.dayBody}>
                  <AppText numberOfLines={1} style={styles.dayTitle}>
                    {day.title}
                  </AppText>
                  <AppText numberOfLines={1} style={styles.dayMeta}>
                    {day.meta}
                  </AppText>
                </View>

                <View style={[styles.dayChevron, { backgroundColor: colors.raise }]}>
                  <AppText style={styles.dayChevronGlyph}>{open ? '−' : '+'}</AppText>
                </View>
              </PressableRow>

              {open ? (
                <View style={styles.exerciseList}>
                  {day.exercises.map((exercise, index) => (
                    <View
                      key={exercise.name}
                      style={[styles.exerciseRow, { borderTopColor: colors.line }]}
                    >
                      <View style={[styles.exerciseIndex, { backgroundColor: colors.goldSoft }]}>
                        <AppText style={[styles.exerciseIndexText, { color: colors.gold }]}>
                          {String(index + 1).padStart(2, '0')}
                        </AppText>
                      </View>
                      <AppText numberOfLines={1} style={styles.exerciseName}>
                        {exercise.name}
                      </AppText>
                      <AppText style={styles.exerciseScheme}>{exercise.scheme}</AppText>
                    </View>
                  ))}
                  <TextAction
                    label="+ Add exercise"
                    onPress={() => show(`Exercise picker · ${plan.libraryCount} in library`)}
                    accessibilityLabel={`Add an exercise to ${day.title}`}
                    style={[styles.addExercise, { borderTopColor: colors.line }]}
                  />
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>

      <View style={styles.ctaRow}>
        <PrimaryButton
          label="Publish week"
          size="sm"
          onPress={() => show(`Week ${state.week} published to ${plan.assignedCount} clients`)}
          style={styles.ctaPrimary}
          testID="publish-week"
        />
        <SecondaryButton
          label="Assign"
          size="sm"
          onPress={() => show('Assign plan · pick clients')}
          style={styles.ctaSecondary}
        />
      </View>
    </View>
  );
}

const createStyles = ({ colors, shadow }: ThemeContextValue) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 18,
    },
    headerText: { gap: 8, flexShrink: 1 },
    kicker: { ...mono(9.5, { tracking: 0.2, uppercase: true }), color: colors.gold },
    title: { ...serif(32, { leading: 1 }), color: colors.ink },

    weekStrip: {
      gap: WEEK_GAP,
      paddingHorizontal: WEEK_STRIP_PADDING,
      paddingBottom: 18,
    },
    weekPill: {
      width: WEEK_PILL_SIZE,
      height: WEEK_PILL_SIZE,
      borderRadius: WEEK_PILL_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    weekKicker: { ...mono(8, { tracking: 0.1 }), opacity: 0.7 },
    weekNumber: serif(19, { leading: 0.9 }),

    dayList: { gap: 9, paddingHorizontal: 20 },
    dayCard: { overflow: 'hidden', boxShadow: shadow.soft },
    dayHeader: {
      paddingVertical: 16,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    dayDisc: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    dayLabel: mono(10, { tracking: 0.06 }),
    dayBody: { flex: 1, gap: 6, minWidth: 0 },
    dayTitle: { ...sans(15.5, 600), color: colors.ink },
    dayMeta: { ...mono(10), color: colors.muted },
    dayChevron: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    dayChevronGlyph: { ...mono(13), color: colors.sub },

    exerciseList: { paddingHorizontal: 18, paddingBottom: 8 },
    exerciseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingVertical: 12,
      borderTopWidth: 1,
    },
    exerciseIndex: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    exerciseIndexText: mono(9),
    exerciseName: { ...sans(14), color: colors.ink, flex: 1, minWidth: 0 },
    exerciseScheme: { ...mono(10), color: colors.sub, flexShrink: 0 },
    addExercise: { paddingTop: 14, paddingBottom: 10, borderTopWidth: 1 },

    ctaRow: { flexDirection: 'row', gap: 10, paddingTop: 20, paddingHorizontal: 20 },
    ctaPrimary: { flex: 1 },
    ctaSecondary: { width: 112 },
  });
