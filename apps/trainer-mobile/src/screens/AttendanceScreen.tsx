/**
 * Check-in — who has arrived, and who is queued behind them.
 *
 * The attendance rows are checkboxes rather than buttons: a trainer tapping down a list needs
 * a screen reader to say "checked"/"not checked", not "button".
 */
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../components/ui/AppText';
import { CircleButton, PressableRow, PrimaryButton } from '../components/ui/controls';
import {
  Card,
  GoldFill,
  GoldRingFill,
  SectionHeader,
  SectionNote,
} from '../components/ui/primitives';
import { useToast } from '../components/ui/ToastProvider';
import { room, todaySession, waitlist, type WaitlistEntry } from '../features/trainer/data';
import { useSession } from '../features/trainer/SessionProvider';
import { presentCount } from '../features/trainer/selectors';
import { useNavigation } from '../navigation/NavigationProvider';
import {
  mono,
  radii,
  sans,
  serif,
  useTheme,
  useThemedStyles,
  type ThemeContextValue,
} from '../theme';

export function AttendanceScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { state, dispatch } = useSession();
  const { show } = useToast();

  const present = presentCount(state.presentByClientId, state.promotedWaitlistIds);

  const startSession = useCallback(() => {
    if (state.live) {
      navigate({ name: 'runner' });
      return;
    }
    dispatch({ type: 'session/start', at: Date.now() });
    navigate({ name: 'runner' });
    show(`Session started · ${todaySession.startLabel} HIIT`);
  }, [dispatch, navigate, show, state.live]);

  const promote = useCallback(
    (entry: WaitlistEntry) => {
      dispatch({ type: 'waitlist/promote', waitlistId: entry.id });
      show(`${entry.name} promoted from waitlist`);
    },
    [dispatch, show],
  );

  return (
    <View>
      <View style={styles.header}>
        <CircleButton
          glyph="←"
          onPress={() => navigate({ name: 'today' })}
          accessibilityLabel="Back to today"
          testID="attendance-back"
        />
        <AppText style={styles.headerLabel} accessibilityRole="header">
          Check in · {todaySession.startLabel} AM
        </AppText>
      </View>

      <Card style={styles.classCard} radius={radii.cardXl}>
        <View style={styles.classText}>
          <AppText style={styles.className}>{todaySession.title}</AppText>
          <AppText style={styles.classMeta}>Cap {todaySession.capacity} · set by gym owner</AppText>
        </View>
        <GoldRingFill style={styles.presentRing}>
          <View style={[styles.presentInner, { backgroundColor: colors.bg }]}>
            <AppText style={styles.presentCount} testID="present-count">
              {present}
            </AppText>
            <AppText style={styles.presentLabel}>Present</AppText>
          </View>
        </GoldRingFill>
      </Card>

      <View style={styles.list}>
        {room.map((client) => {
          const checked = Boolean(state.presentByClientId[client.id]);
          return (
            <PressableRow
              key={client.id}
              onPress={() => dispatch({ type: 'attendance/toggle', clientId: client.id })}
              accessibilityLabel={client.fullName}
              accessibilityState={{ checked }}
              testID={`attendance-${client.id}`}
            >
              <Card
                style={styles.attendanceRow}
                borderColor={checked ? colors.goldSoft : colors.line}
              >
                {checked ? (
                  <GoldFill style={styles.checkbox}>
                    <AppText style={[styles.tick, { color: colors.onGold }]}>✓</AppText>
                  </GoldFill>
                ) : (
                  <View
                    style={[styles.checkbox, styles.checkboxEmpty, { borderColor: colors.line2 }]}
                  />
                )}
                <View style={styles.rowBody}>
                  <AppText
                    numberOfLines={1}
                    style={[styles.rowName, { color: checked ? colors.ink : colors.sub }]}
                  >
                    {client.name}
                  </AppText>
                  <AppText numberOfLines={1} style={styles.rowMeta}>
                    {checked ? 'Checked in' : 'Booked · not arrived'}
                  </AppText>
                </View>
              </Card>
            </PressableRow>
          );
        })}
      </View>

      <SectionHeader title="Waitlist" style={styles.sectionHeader}>
        <SectionNote>{waitlist.length} queued</SectionNote>
      </SectionHeader>

      <View style={styles.list}>
        {waitlist.map((entry, index) => {
          const promoted = state.promotedWaitlistIds.includes(entry.id);
          return (
            <Card key={entry.id} style={styles.waitlistRow}>
              <View style={[styles.position, { backgroundColor: colors.raise }]}>
                <AppText style={styles.positionText}>{index + 1}</AppText>
              </View>
              <View style={styles.rowBody}>
                <AppText numberOfLines={1} style={[styles.rowName, { color: colors.ink }]}>
                  {entry.name}
                </AppText>
                <AppText numberOfLines={1} style={styles.rowMeta}>
                  {entry.meta}
                </AppText>
              </View>
              <PressableRow
                onPress={() => promote(entry)}
                accessibilityLabel={
                  promoted
                    ? `${entry.name} already added`
                    : `Promote ${entry.name} from the waitlist`
                }
                accessibilityState={{ disabled: promoted }}
                testID={`promote-${entry.id}`}
                style={styles.promoteWrapper}
              >
                {promoted ? (
                  <View style={[styles.promote, { backgroundColor: colors.ok }]}>
                    <AppText style={[styles.promoteLabel, { color: colors.onGold }]}>Added</AppText>
                  </View>
                ) : (
                  <GoldFill style={styles.promote}>
                    <AppText style={[styles.promoteLabel, { color: colors.onGold }]}>
                      Promote
                    </AppText>
                  </GoldFill>
                )}
              </PressableRow>
            </Card>
          );
        })}
      </View>

      <View style={styles.ctaBlock}>
        <PrimaryButton
          label={state.live ? 'Open runner' : 'Start session'}
          size="lg"
          onPress={startSession}
          testID="attendance-start"
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
      gap: 13,
      paddingHorizontal: 22,
      paddingTop: 18,
      paddingBottom: 20,
    },
    headerLabel: {
      ...mono(9.5, { tracking: 0.18, uppercase: true }),
      color: colors.muted,
      flexShrink: 1,
    },

    classCard: {
      marginHorizontal: 20,
      marginBottom: 14,
      padding: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 14,
      boxShadow: shadow.soft12,
    },
    classText: { gap: 9, flexShrink: 1 },
    className: { ...serif(27, { leading: 1 }), color: colors.ink },
    classMeta: { ...mono(10), color: colors.muted },
    presentRing: {
      width: 82,
      height: 82,
      borderRadius: 41,
      padding: 2,
      flexShrink: 0,
    },
    presentInner: {
      width: '100%',
      height: '100%',
      borderRadius: 39,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 1,
    },
    presentCount: { ...serif(30, { leading: 0.85 }), color: colors.ink },
    presentLabel: {
      ...mono(7.5, { tracking: 0.14, uppercase: true }),
      color: colors.muted,
    },

    list: { gap: 9, paddingHorizontal: 20 },
    attendanceRow: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    checkbox: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    checkboxEmpty: { borderWidth: 1.5 },
    tick: mono(12),
    rowBody: { flex: 1, gap: 6, minWidth: 0 },
    rowName: sans(15, 500),
    rowMeta: { ...mono(10), color: colors.muted },

    sectionHeader: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 14 },
    waitlistRow: {
      paddingVertical: 13,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    position: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    positionText: { ...mono(10), color: colors.muted },
    promoteWrapper: { flexShrink: 0 },
    promote: {
      height: 38,
      paddingHorizontal: 15,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    promoteLabel: mono(9.5, { tracking: 0.1, uppercase: true }),

    ctaBlock: { paddingTop: 22, paddingHorizontal: 20 },
  });
