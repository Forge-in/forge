/**
 * Navigation context.
 *
 * Deliberately small: six screens with fixed Up destinations do not need a navigator, and
 * pulling one in would mean react-native-screens, gesture-handler and reanimated for a design
 * that has no transitions. Screens receive no navigator-specific props, so lifting this onto
 * Expo Router later is a mechanical change confined to this folder.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { BackHandler, Platform } from 'react-native';

import { INITIAL_ROUTE, parentOf, type Route, type TabRouteName } from './routes';

export interface NavigationContextValue {
  route: Route;
  navigate: (route: Route) => void;
  selectTab: (tab: TabRouteName) => void;
  /** Navigates to the current screen's Up destination. Returns false at a root. */
  goBack: () => boolean;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  children,
  initialRoute = INITIAL_ROUTE,
  onNavigate,
}: {
  children: ReactNode;
  initialRoute?: Route;
  /**
   * Fired before the route changes. The shell uses it to dismiss a leftover toast, which has
   * to happen *before* the new screen's own handler raises one — a handler that navigates and
   * then confirms ("Session started") must keep its message.
   */
  onNavigate?: () => void;
}) {
  const [route, setRoute] = useState<Route>(initialRoute);

  const navigate = useCallback(
    (next: Route) => {
      onNavigate?.();
      setRoute((current) => (routesEqual(current, next) ? current : next));
    },
    [onNavigate],
  );

  const selectTab = useCallback(
    (tab: TabRouteName) => {
      navigate({ name: tab });
    },
    [navigate],
  );

  const goBack = useCallback(() => {
    const parent = parentOf(route);
    if (!parent) return false;
    navigate(parent);
    return true;
  }, [navigate, route]);

  useEffect(() => {
    // iOS has no hardware back button, and subscribing there is a no-op that still costs a
    // listener; Android is the only platform this exists for.
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => subscription.remove();
  }, [goBack]);

  const value = useMemo<NavigationContextValue>(
    () => ({ route, navigate, selectTab, goBack }),
    [route, navigate, selectTab, goBack],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation must be used inside a <NavigationProvider>');
  return value;
}

function routesEqual(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false;
  if (a.name === 'clientDetail' && b.name === 'clientDetail') return a.clientId === b.clientId;
  return true;
}
