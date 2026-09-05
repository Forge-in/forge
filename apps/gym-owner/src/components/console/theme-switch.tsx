'use client';

import { useTheme } from '@/components/theme/theme-provider';
import { THEME_SWITCH_LABEL } from '@/lib/theme';

/**
 * The top-bar appearance toggle.
 *
 * The visible word is the theme you would switch TO — "Ivory" while dark — which
 * is what the design shows and what makes the control self-explanatory at a
 * glance. That is ambiguous when read aloud with no colour to look at, so the
 * accessible name says the action and `aria-pressed` carries the state.
 */
export function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme();
  const target = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={theme === 'light'}
      aria-label={`Switch to the ${target} theme`}
      className="t-pill bg-surface border-line-strong text-sub ow-hoverable flex h-9 shrink-0 cursor-pointer items-center rounded-[18px] border px-[14px] whitespace-nowrap"
    >
      {THEME_SWITCH_LABEL[theme]}
    </button>
  );
}
