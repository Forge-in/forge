/**
 * The floating tab bar.
 *
 * The design draws each tab icon as a bare 13px div whose border-radius does the identifying:
 * a rounded square for Today, a circle for Clients, a near-square for Plans. That is kept
 * verbatim — it is the design's visual language, not a placeholder for real icons — and the
 * meaning is carried for assistive tech by the label and the `tab` role instead.
 */
import { StyleSheet, View } from 'react-native';

import { TAB_LABELS, TAB_ROUTES, type TabRouteName } from '../../navigation/routes';
import { mono, radii, useTheme } from '../../theme';
import { AppText } from '../ui/AppText';
import { GoldFill } from '../ui/primitives';
import { PressableRow } from '../ui/controls';

/** Icon corner radius per tab — the design's `radius` field. */
const ICON_RADIUS: Record<TabRouteName, number> = {
  today: 4,
  clients: 6.5,
  plans: 2,
};

const ICON_SIZE = 13;
const DISC_SIZE = 38;

export interface TabBarProps {
  activeTab: TabRouteName | null;
  onSelect: (tab: TabRouteName) => void;
  /** Distance from the bottom of the screen, already adjusted for the safe area. */
  bottom: number;
}

export function TabBar({ activeTab, onSelect, bottom }: TabBarProps) {
  const { colors, shadow } = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      testID="tab-bar"
      style={[
        styles.bar,
        {
          bottom,
          backgroundColor: colors.surf,
          borderColor: colors.goldSoft,
          boxShadow: shadow.hard,
        },
      ]}
    >
      {TAB_ROUTES.map((tab) => {
        const selected = activeTab === tab;
        const icon = (
          <View
            style={[
              styles.icon,
              {
                borderRadius: ICON_RADIUS[tab],
                backgroundColor: selected ? colors.onGold : 'transparent',
                borderColor: selected ? colors.onGold : colors.muted,
              },
            ]}
          />
        );

        return (
          <PressableRow
            key={tab}
            onPress={() => onSelect(tab)}
            accessibilityLabel={TAB_LABELS[tab]}
            accessibilityState={{ selected }}
            style={styles.tab}
            testID={`tab-${tab}`}
          >
            {selected ? (
              <GoldFill style={[styles.disc, styles.center]}>{icon}</GoldFill>
            ) : (
              <View style={[styles.disc, styles.center]}>{icon}</View>
            )}
            <AppText style={[styles.label, { color: selected ? colors.gold : colors.muted }]}>
              {TAB_LABELS[tab]}
            </AppText>
          </PressableRow>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 68,
    borderRadius: radii.tabBar,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderWidth: 2,
  },
  label: mono(8.5, { tracking: 0.1, uppercase: true }),
});
