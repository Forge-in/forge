/**
 * Test environment for the trainer app.
 *
 * Only the native edges are stubbed — fonts, the splash screen, key-value storage and safe-area
 * insets. Everything above them (the reducer, the router, the theme, every screen) runs for
 * real, which is the point: these tests exercise the app, not a set of mocks.
 */
import type { ReactNode } from 'react';

// Fonts never load in Node. Reporting them as loaded lets the startup gate open so the tests
// see the app rather than the splash screen.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
  isLoaded: () => true,
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
  setOptions: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Deterministic zero insets, so layout assertions do not depend on a simulated device.
//
// Written out rather than pulled from `react-native-safe-area-context/jest/mock`: that file is
// TSX inside node_modules, and requiring it drags it into the app's TypeScript program, where it
// fails `tsc --noEmit` on its own unused import.
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    initialWindowMetrics: { insets, frame },
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
  };
});
