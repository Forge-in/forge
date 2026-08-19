/**
 * Wrath Trainer.
 *
 * The shell the design describes: one scroll container holding whichever screen is active, and
 * a floating tab bar and a toast layered over it.
 *
 * The design's ambient gold bloom behind the header is deliberately NOT reproduced. As a CSS
 * radial-gradient on a 390x844 mock it read as a soft wash; drawn as an SVG gradient on a real
 * device it landed as a hard-edged orb over the header, so it was removed rather than shipped
 * looking broken. Restoring it means re-adding the component and the `glow` palette token.
 *
 * Three further things replace parts of the design that only made sense as a browser mock:
 *
 * - The simulated status bar (9:41, signal bars, battery) and the drawn home indicator are
 *   gone. The device supplies both; drawing a second, fake one is the classic mock-to-app
 *   mistake. Safe-area insets take their place, so the layout is correct on a notched phone
 *   and on one without.
 * - Scroll position resets when the route changes, which a static mock had no way to get wrong.
 * - Fonts and the stored theme are resolved behind the splash screen, so the first painted
 *   frame is already the right typeface at the right theme rather than a flash of neither.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { TabBar } from './components/navigation/TabBar';
import { Toast } from './components/ui/Toast';
import { ToastProvider, useToast } from './components/ui/ToastProvider';
import { SessionProvider } from './features/trainer/SessionProvider';
import { NavigationProvider, useNavigation } from './navigation/NavigationProvider';
import { activeTabFor, showsTabBar } from './navigation/routes';
import { AttendanceScreen } from './screens/AttendanceScreen';
import { ClientDetailScreen } from './screens/ClientDetailScreen';
import { ClientsScreen } from './screens/ClientsScreen';
import { PlansScreen } from './screens/PlansScreen';
import { RunnerScreen } from './screens/RunnerScreen';
import { TodayScreen } from './screens/TodayScreen';
import { ThemeProvider, fontAssets, useTheme } from './theme';

/** Height of the floating tab bar, and the gaps the design leaves around it. */
const TAB_BAR_HEIGHT = 68;
const TAB_BAR_INSET = 26;
const CONTENT_GAP = 24;
const TOAST_GAP = 16;

// Kept up until fonts and the stored theme have both resolved. The rejection is ignored on
// purpose: it only ever means the splash screen was already hidden, which is not a failure.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StartupGate>
          <ToastProvider>
            <SessionProvider>
              <NavigationHost>
                <TrainerShell />
              </NavigationHost>
            </SessionProvider>
          </ToastProvider>
        </StartupGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * Holds the splash screen until the app can paint its final appearance.
 *
 * A font load failure is not treated as fatal — the app renders in the platform's default
 * typeface, which is far better than a permanently blank splash on a device that could not
 * decompress a TTF.
 */
function StartupGate({ children }: { children: ReactNode }) {
  const { ready: themeReady } = useTheme();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const canRender = themeReady && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (canRender) void SplashScreen.hideAsync().catch(() => undefined);
  }, [canRender]);

  return canRender ? <>{children}</> : null;
}

/**
 * Bridges the toast into navigation so that moving between screens clears any message left
 * over from the previous one — while a handler that navigates *and then* raises a toast (as
 * "Start session" does) still shows it.
 */
function NavigationHost({ children }: { children: ReactNode }) {
  const { hide } = useToast();
  return <NavigationProvider onNavigate={hide}>{children}</NavigationProvider>;
}

function TrainerShell() {
  const { colors, name } = useTheme();
  const { route, selectTab } = useNavigation();
  const { message } = useToast();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);

  const tabsVisible = showsTabBar(route);
  const tabBarBottom = Math.max(insets.bottom, TAB_BAR_INSET);
  const contentBottom = tabsVisible
    ? tabBarBottom + TAB_BAR_HEIGHT + CONTENT_GAP
    : insets.bottom + CONTENT_GAP;
  // Constant, exactly as the design has it: the toast block sits OUTSIDE the tab-bar
  // conditional at a fixed `bottom:110px`. Tying it to tab visibility drops it onto the
  // runner's "Log set" button, which is the one screen where the CTA is being tapped
  // repeatedly and must never be covered.
  const toastBottom = tabBarBottom + TAB_BAR_HEIGHT + TOAST_GAP;

  // A new screen starts at the top. Without this, opening a client from halfway down the
  // roster lands mid-way down their profile.
  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [route]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView
        ref={scroller}
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: contentBottom }}
        showsVerticalScrollIndicator={false}
      >
        <ActiveScreen />
      </ScrollView>

      <Toast message={message} bottom={toastBottom} />

      {tabsVisible ? (
        <TabBar activeTab={activeTabFor(route)} onSelect={selectTab} bottom={tabBarBottom} />
      ) : null}

      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

function ActiveScreen() {
  const { route } = useNavigation();

  switch (route.name) {
    case 'today':
      return <TodayScreen />;
    case 'clients':
      return <ClientsScreen />;
    case 'clientDetail':
      return <ClientDetailScreen clientId={route.clientId} />;
    case 'plans':
      return <PlansScreen />;
    case 'runner':
      return <RunnerScreen />;
    case 'attendance':
      return <AttendanceScreen />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
});
