/**
 * Today — the trainer's home screen.
 *
 * Reads top to bottom as: who and when, the next session on a dial, the day in three numbers,
 * what is still to come, and finally the one thing worth acting on (clients slipping).
 */
import { useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppText } from '../components/ui/AppText';
import {
  PressableRow,
  PrimaryButton,
  SecondaryButton,
  TextAction,
  ThemeToggle,
} from '../components/ui/controls';
import { Card, InitialsAvatar, SectionHeader } from '../components/ui/primitives';
import { ProgressRing } from '../components/ui/ProgressRing';
import { PulseDot } from '../components/ui/PulseDot';
import { useToast } from '../components/ui/ToastProvider';
import {
  SESSION_DURATION_SECONDS,
  agenda,
  dayStats,
  heroAvatars,
  slippingCount,
  todaySession,
  trainer,
} from '../features/trainer/data';
import { useElapsed, useSession } from '../features/trainer/SessionProvider';
import { formatClock, formatDayLabel, sessionProgress } from '../features/trainer/selectors';
import { useNavigation } from '../navigation/NavigationProvider';
import {
  goldGradient,
  goldGradientLocations,
  gradientDiagonal,
  mono,
  radii,
  sans,
  serif,
  useTheme,
  useThemedStyles,
  type ThemeContextValue,
} from '../theme';

/**
 * How full the dial reads before a session starts.
 *
 * The design hard-codes `stroke-dashoffset: 196` against a 653.5 circumference, which is
 * exactly 70%. It is decorative — a dial that looks charged rather than empty — so it is named
 * here instead of being left as a magic offset.
 */
const IDLE_DIAL_PROGRESS = 0.7;

/** The design's dial at its intended width; smaller screens scale everything inside it. */
const DIAL_BASE_SIZE = 236;
const DIAL_RADIUS_RATIO = 104 / 236;
const DIAL_STROKE = 12;

export function TodayScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { state, dispatch } = useSession();
  const elapsed = useElapsed();
  const { show } = useToast();
  const { width } = useWindowDimensions();

  const dialSize = Math.min(DIAL_BASE_SIZE, Math.round(width * 0.605));
  const dialScale = dialSize / DIAL_BASE_SIZE;

  const live = state.live;
  const progress = live ? sessionProgress(elapsed, SESSION_DURATION_SECONDS) : IDLE_DIAL_PROGRESS;

  const startSession = useCallback(() => {
    if (state.live) {
      navigate({ name: 'runner' });
      return;
    }
    dispatch({ type: 'session/start', at: Date.now() });
    navigate({ name: 'runner' });
    show(`Session started · ${todaySession.startLabel} HIIT`);
  }, [dispatch, navigate, show, state.live]);

  const dayLabel = formatDayLabel(new Date());

  return (
    <View>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <InitialsAvatar
            label={trainer.initials}
            size={42}
            ring={[colors.goldLt, colors.goldDk]}
            ringWidth={1.5}
            innerColor={colors.surf}
            textColor={colors.gold}
          />
          <View style={styles.headerText}>
            <AppText style={styles.dayLabel}>{dayLabel}</AppText>
            <AppText numberOfLines={1} style={styles.trainerName}>
              {trainer.name}
            </AppText>
          </View>
        </View>

        <View style={styles.headerActions}>
          <ThemeToggle />
          <PressableRow
            onPress={() =>
              show(`${trainer.unreadNotifications} unread · nudges and booking requests`)
            }
            accessibilityLabel={`Notifications, ${trainer.unreadNotifications} unread`}
            style={styles.notificationButton}
            testID="notifications"
          >
            <AppText style={styles.notificationCount}>{trainer.unreadNotifications}</AppText>
          </PressableRow>
        </View>
      </View>

      {/* Dial */}
      <View style={styles.dialBlock}>
        <View style={styles.dialKickerRow}>
          <PulseDot color={colors.gold} durationMs={1800} />
          <AppText style={styles.dialKicker}>
            {live ? 'In session now' : 'Starts in 19 min'}
          </AppText>
        </View>

        <ProgressRing
          size={dialSize}
          radiusRatio={DIAL_RADIUS_RATIO}
          strokeWidth={DIAL_STROKE * dialScale}
          progress={progress}
          trackColor={colors.line}
          gradient={goldGradient(colors)}
          gradientLocations={goldGradientLocations}
          glowColor={colors.goldGlow}
          accessibilityLabel={
            live
              ? `Session in progress, ${formatClock(elapsed)} elapsed of ${todaySession.durationMinutes} minutes`
              : `${todaySession.title} starts at ${todaySession.startLabel}`
          }
        >
          <View style={[styles.dialContent, { paddingHorizontal: 34 * dialScale }]}>
            <AppText
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[serif(58 * dialScale, { leading: 0.84, tracking: -0.01 }), styles.dialBig]}
            >
              {live ? formatClock(elapsed) : todaySession.startLabel}
            </AppText>
            <AppText
              numberOfLines={1}
              style={[sans(14.5 * dialScale, 600, { tracking: 0.02 }), styles.dialTitle]}
            >
              {todaySession.title}
            </AppText>
            <AppText
              numberOfLines={1}
              style={[mono(9.5 * dialScale, { tracking: 0.14, uppercase: true }), styles.dialSub]}
            >
              {live
                ? `elapsed of ${todaySession.durationMinutes} min`
                : `${todaySession.durationMinutes} min · ${todaySession.location}`}
            </AppText>
          </View>
        </ProgressRing>

        <View style={styles.bookedRow}>
          <View style={styles.avatarStack}>
            {heroAvatars.map((avatar, index) => (
              <View
                key={avatar.key}
                style={[
                  styles.stackAvatar,
                  {
                    backgroundColor: avatar.overflow ? colors.surf : colors.raise,
                    borderColor: colors.bg,
                    marginLeft: index === 0 ? 0 : -9,
                  },
                ]}
              >
                <AppText
                  style={[
                    mono(9),
                    {
                      color: avatar.accent
                        ? colors.gold
                        : avatar.overflow
                          ? colors.muted
                          : colors.sub,
                    },
                  ]}
                >
                  {avatar.label}
                </AppText>
              </View>
            ))}
          </View>
          <AppText style={styles.bookedLabel}>
            {todaySession.booked} of {todaySession.capacity} booked
          </AppText>
        </View>

        <View style={styles.ctaRow}>
          <PrimaryButton
            label={live ? 'Open runner' : 'Start session'}
            onPress={startSession}
            style={styles.ctaPrimary}
            accessibilityHint={
              live ? 'Returns to the live session' : 'Starts the session and opens the runner'
            }
            testID="start-session"
          />
          <SecondaryButton
            label="Check in"
            onPress={() => navigate({ name: 'attendance' })}
            style={styles.ctaSecondary}
            accessibilityHint="Opens the check-in list for this class"
            testID="go-attendance"
          />
        </View>
      </View>

      {/* Day stats */}
      <Card style={styles.statStrip}>
        {dayStats.map((stat, index) => (
          <View
            key={stat.label}
            style={[
              styles.statCell,
              {
                borderRightColor: index === dayStats.length - 1 ? 'transparent' : colors.line,
              },
            ]}
          >
            <AppText style={[styles.statValue, { color: stat.accent ? colors.gold : colors.ink }]}>
              {stat.value}
            </AppText>
            <AppText style={styles.statLabel}>{stat.label}</AppText>
          </View>
        ))}
      </Card>

      {/* Agenda */}
      <SectionHeader title="Later today" style={styles.sectionHeader}>
        <TextAction
          label="See all"
          onPress={() => show(`Full schedule · ${agenda.length} sessions today`)}
          accessibilityLabel="See all of today's sessions"
        />
      </SectionHeader>

      <View style={styles.agendaList}>
        {agenda.map((entry) => {
          const [hour, minute] = entry.time.split(':');
          const row = (
            <View style={[styles.agendaInner, { backgroundColor: colors.surf }]}>
              <View style={[styles.agendaTime, { backgroundColor: colors.raise }]}>
                <AppText style={styles.agendaHour}>{hour}</AppText>
                <AppText style={styles.agendaMinute}>{minute}</AppText>
              </View>
              <View style={styles.agendaBody}>
                <AppText numberOfLines={1} style={styles.agendaWho}>
                  {entry.who}
                </AppText>
                <AppText numberOfLines={1} style={styles.agendaMeta}>
                  {entry.meta}
                </AppText>
              </View>
              {entry.badge ? (
                <AppText
                  style={[
                    styles.agendaBadge,
                    { backgroundColor: colors.warn, color: colors.onGold },
                  ]}
                >
                  {entry.badge}
                </AppText>
              ) : (
                <AppText style={styles.agendaChevron}>›</AppText>
              )}
            </View>
          );

          return (
            <PressableRow
              key={entry.id}
              onPress={() => show(`${entry.who} · session detail`)}
              accessibilityLabel={`${entry.time}, ${entry.who}. ${entry.meta}${entry.badge ? `. ${entry.badge}` : ''}`}
              testID={`agenda-${entry.id}`}
            >
              {entry.hot ? (
                <LinearGradient
                  colors={HOT_SHELL}
                  locations={HOT_SHELL_LOCATIONS}
                  start={gradientDiagonal.start}
                  end={gradientDiagonal.end}
                  style={styles.agendaShell}
                >
                  {row}
                </LinearGradient>
              ) : (
                <View style={[styles.agendaShell, { backgroundColor: colors.line }]}>{row}</View>
              )}
            </PressableRow>
          );
        })}
      </View>

      {/* Slipping prompt */}
      <PressableRow
        onPress={() => navigate({ name: 'clients' })}
        accessibilityLabel={`${slippingCount} clients slipping this week. Review`}
        style={styles.slippingWrapper}
        testID="slipping-prompt"
      >
        <Card style={styles.slippingCard}>
          <View style={styles.slippingBody}>
            <View style={[styles.slippingBadge, { backgroundColor: colors.raise }]}>
              <AppText style={[styles.slippingCount, { color: colors.warn }]}>
                {slippingCount}
              </AppText>
            </View>
            <AppText numberOfLines={2} style={styles.slippingText}>
              clients slipping this week
            </AppText>
          </View>
          <AppText style={[styles.slippingAction, { color: colors.gold }]}>Review</AppText>
        </Card>
      </PressableRow>
    </View>
  );
}

/**
 * The warm hairline on the overlapping-bookings row. These are literal rgba values in the
 * design — the same in both themes — rather than the `warn` token, so they stay literal here.
 */
const HOT_SHELL = ['rgba(201,122,74,0.6)', 'rgba(201,122,74,0.12)'] as const;
const HOT_SHELL_LOCATIONS = [0, 0.6] as const;

const createStyles = ({ colors, shadow }: ThemeContextValue) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 22,
      paddingTop: 20,
      paddingBottom: 16,
    },
    headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
    headerText: { gap: 5, flexShrink: 1 },
    dayLabel: {
      ...mono(9.5, { tracking: 0.18, uppercase: true }),
      color: colors.muted,
    },
    trainerName: { ...sans(16, 600), color: colors.ink },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
    notificationButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surf,
      borderWidth: 1,
      borderColor: colors.goldSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notificationCount: { ...mono(10.5), color: colors.gold },

    dialBlock: {
      alignItems: 'center',
      gap: 18,
      paddingHorizontal: 22,
      paddingTop: 6,
      paddingBottom: 24,
    },
    dialKickerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    dialKicker: {
      ...mono(9.5, { tracking: 0.2, uppercase: true }),
      color: colors.gold,
    },
    dialContent: { alignItems: 'center', justifyContent: 'center', gap: 7 },
    dialBig: { color: colors.ink, textAlign: 'center' },
    dialTitle: { color: colors.ink, textAlign: 'center' },
    dialSub: { color: colors.muted, textAlign: 'center' },

    bookedRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatarStack: { flexDirection: 'row', alignItems: 'center' },
    stackAvatar: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bookedLabel: {
      ...mono(10, { tracking: 0.1, uppercase: true }),
      color: colors.muted,
    },

    ctaRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
    ctaPrimary: { flex: 1 },
    ctaSecondary: { width: 104 },

    statStrip: {
      marginHorizontal: 20,
      marginBottom: 4,
      flexDirection: 'row',
      boxShadow: shadow.soft10,
    },
    statCell: {
      flex: 1,
      paddingVertical: 17,
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 7,
      borderRightWidth: 1,
    },
    statValue: { ...serif(27, { leading: 0.85 }) },
    statLabel: {
      ...mono(8.5, { tracking: 0.12, uppercase: true }),
      color: colors.muted,
      textAlign: 'center',
    },

    sectionHeader: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 14 },
    agendaList: { gap: 9, paddingHorizontal: 20 },
    agendaShell: { borderRadius: radii.card, padding: 1 },
    agendaInner: {
      borderRadius: radii.card - 1,
      paddingVertical: 15,
      paddingHorizontal: 17,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    agendaTime: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    agendaHour: { ...mono(11.5), color: colors.ink },
    agendaMinute: { ...mono(8.5), color: colors.muted },
    agendaBody: { flex: 1, gap: 6, minWidth: 0 },
    agendaWho: { ...sans(14.5, 500), color: colors.ink },
    agendaMeta: { ...mono(10), color: colors.muted },
    agendaBadge: {
      ...mono(9, { tracking: 0.1, uppercase: true }),
      borderRadius: radii.badge,
      paddingVertical: 5,
      paddingHorizontal: 10,
      overflow: 'hidden',
      flexShrink: 0,
    },
    agendaChevron: { ...mono(13), color: colors.muted, flexShrink: 0 },

    slippingWrapper: { marginTop: 20, marginHorizontal: 20 },
    slippingCard: {
      paddingVertical: 16,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    slippingBody: { flexDirection: 'row', alignItems: 'center', gap: 13, flexShrink: 1 },
    slippingBadge: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    slippingCount: serif(19),
    slippingText: { ...mono(10.5), color: colors.sub, flexShrink: 1 },
    slippingAction: {
      ...mono(9.5, { tracking: 0.12, uppercase: true }),
      flexShrink: 0,
    },
  });
