/**
 * Persistence for the trainer's theme choice.
 *
 * The design used `localStorage` under `wrath-trainer-theme`; the key is kept so the two
 * surfaces stay recognisably the same product. Both calls swallow their errors on purpose:
 * a device with a full or unavailable key-value store should fall back to the default theme,
 * never fail to launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ThemeName } from './tokens';

export const THEME_STORAGE_KEY = 'wrath-trainer-theme';

const isThemeName = (value: unknown): value is ThemeName => value === 'dark' || value === 'light';

export async function readStoredTheme(): Promise<ThemeName | null> {
  try {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return isThemeName(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function writeStoredTheme(theme: ThemeName): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Losing the preference is survivable; crashing on a storage fault is not.
  }
}
