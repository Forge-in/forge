import type { Metadata, Viewport } from 'next';
import { Archivo, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { THEME_ATTRIBUTE } from '@/lib/theme';
import { readThemePreference } from '@/lib/theme-server';
import '../styles/globals.css';

/**
 * The three faces of the owner console. Exposed as CSS variables and consumed
 * by `owner-theme.css`, so no component ever names a font directly.
 *
 * `display: 'swap'` on all three: the dashboard is read, not admired, and a
 * blocked first paint costs more than one reflow.
 */
const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-instrument-serif',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Wrath Owner Console',
    template: '%s · Wrath',
  },
  description: 'Run your gym: members, fees, classes, staff and check-ins.',
  /**
   * A private dashboard behind a login. Indexing it would only ever surface a
   * sign-in page, and `follow: false` keeps crawlers off the deep links the
   * console generates.
   */
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Matches the palette so the browser chrome does not flash white on load.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0f17' },
    { media: '(prefers-color-scheme: light)', color: '#f5f1ea' },
  ],
};

const fontVariables = [archivo.variable, instrumentSerif.variable, jetbrainsMono.variable].join(
  ' ',
);

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  /**
   * Read on the server, from the cookie, so the correct palette is in the FIRST
   * BYTE of HTML.
   *
   * The alternative — render a default and correct it with a pre-paint script —
   * looks equivalent and is not: React 19 reconciles `<html>` during hydration
   * and strips attributes it did not itself render, so the script's correction
   * was measurably wiped for one frame on every full page load. Rendering the
   * attribute here means React's output already matches the DOM.
   */
  const theme = await readThemePreference();

  return (
    <html
      lang="en"
      {...{ [THEME_ATTRIBUTE]: theme }}
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="min-h-dvh">
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
