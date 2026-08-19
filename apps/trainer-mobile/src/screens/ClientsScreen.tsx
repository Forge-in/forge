/**
 * Clients — the roster, filterable by how well each client is keeping up.
 *
 * One addition to the design: an empty state. The design's three filters always match at least
 * one of its six fixture clients, so the case never surfaced there; against a real roster
 * "Lapsed" returning nothing is the good outcome, and it should say so rather than render a
 * blank screen.
 */
import { StyleSheet, View } from 'react-native';

import { AppText } from '../components/ui/AppText';
import { Chip, PressableRow, ThemeToggle } from '../components/ui/controls';
import { Card, InitialsAvatar } from '../components/ui/primitives';
import {
  clientFilters,
  clients,
  type ClientTone,
  type TrainerClient,
} from '../features/trainer/data';
import { useSession } from '../features/trainer/SessionProvider';
import { filterClients, initialsOf } from '../features/trainer/selectors';
import { useNavigation } from '../navigation/NavigationProvider';
import {
  mono,
  radii,
  sans,
  serif,
  useTheme,
  useThemedStyles,
  type Palette,
  type ThemeContextValue,
} from '../theme';

/** Pill colours per tone, exactly as the design branches on them. */
function pillColors(tone: ClientTone, colors: Palette) {
  switch (tone) {
    case 'warn':
      return { color: colors.onGold, backgroundColor: colors.warn, borderColor: 'transparent' };
    case 'ok':
      return { color: colors.ok, backgroundColor: 'transparent', borderColor: colors.line2 };
    case 'dim':
    default:
      return { color: colors.muted, backgroundColor: 'transparent', borderColor: colors.line2 };
  }
}

export function ClientsScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { state, dispatch } = useSession();

  const visible = filterClients(clients, state.filter);

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText style={styles.kicker}>
            {visible.length} of {clients.length} shown
          </AppText>
          <AppText style={styles.title} accessibilityRole="header">
            Your clients
          </AppText>
        </View>
        <ThemeToggle />
      </View>

      <View style={styles.filters} accessibilityRole="tablist">
        {clientFilters.map((filter) => (
          <Chip
            key={filter}
            label={filter}
            selected={state.filter === filter}
            onPress={() => dispatch({ type: 'roster/filter', filter })}
            accessibilityLabel={`${filter} clients`}
            testID={`filter-${filter.toLowerCase()}`}
          />
        ))}
      </View>

      <View style={styles.list}>
        {visible.length === 0 ? (
          <Card style={styles.empty}>
            <AppText style={styles.emptyTitle}>Nobody here</AppText>
            <AppText style={styles.emptyBody}>
              No clients match the {state.filter.toLowerCase()} filter right now.
            </AppText>
          </Card>
        ) : (
          visible.map((client) => (
            <RosterRow
              key={client.id}
              client={client}
              onPress={() => navigate({ name: 'clientDetail', clientId: client.id })}
              styles={styles}
              colors={colors}
            />
          ))
        )}
      </View>
    </View>
  );
}

function RosterRow({
  client,
  onPress,
  styles,
  colors,
}: {
  client: TrainerClient;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: Palette;
}) {
  const gilded = client.tone === 'ok';

  return (
    <PressableRow
      onPress={onPress}
      accessibilityLabel={`${client.fullName}. ${client.meta}. ${client.status}`}
      accessibilityHint="Opens this client's profile"
      testID={`client-${client.id}`}
    >
      <Card style={styles.row}>
        <InitialsAvatar
          label={initialsOf(client.name)}
          size={44}
          ring={gilded ? [colors.goldLt, colors.goldDk] : colors.line2}
          ringWidth={gilded ? 1.5 : 1}
          innerColor={colors.raise}
          textColor={gilded ? colors.gold : colors.sub}
        />
        <View style={styles.rowBody}>
          <AppText numberOfLines={1} style={styles.rowName}>
            {client.name}
          </AppText>
          <AppText numberOfLines={1} style={styles.rowMeta}>
            {client.meta}
          </AppText>
        </View>
        <AppText style={[styles.rowPill, pillColors(client.tone, colors)]}>{client.status}</AppText>
      </Card>
    </PressableRow>
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
      paddingBottom: 20,
    },
    headerText: { gap: 8, flexShrink: 1 },
    kicker: { ...mono(9.5, { tracking: 0.2, uppercase: true }), color: colors.gold },
    title: { ...serif(34, { leading: 0.95 }), color: colors.ink },

    filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 18 },

    list: { gap: 9, paddingHorizontal: 20 },
    row: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      boxShadow: shadow.soft,
    },
    rowBody: { flex: 1, gap: 6, minWidth: 0 },
    rowName: { ...sans(15, 500), color: colors.ink },
    rowMeta: { ...mono(10), color: colors.muted },
    rowPill: {
      ...mono(9, { tracking: 0.08, uppercase: true }),
      borderRadius: radii.badge,
      borderWidth: 1,
      paddingVertical: 5,
      paddingHorizontal: 10,
      overflow: 'hidden',
      flexShrink: 0,
    },

    empty: { paddingVertical: 26, paddingHorizontal: 20, gap: 8, alignItems: 'center' },
    emptyTitle: { ...sans(15, 600), color: colors.ink },
    emptyBody: { ...mono(10.5), color: colors.muted, textAlign: 'center' },
  });
