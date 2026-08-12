import type { Metadata, Viewport } from 'next';
import { Archivo, Archivo_Black, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { THEME_ATTRIBUTE, THEME_INIT_SCRIPT, DEFAULT_THEME } from '@/lib/theme';
import '../styles/globals.css';

/**
 * The four faces of the Wrath Core system. They are exposed as CSS variables and
 * consumed by `@forge/theme`, so no component ever names a font directly.
 */
const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
});

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-archivo-black',
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
    default: 'Wrath Core',
    template: '%s · Wrath Core',
  },
  description: 'The console behind every Wrath gym.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Matches the palette so the browser chrome does not flash white on load.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c121c' },
    { media: '(prefers-color-scheme: light)', color: '#f6f3ee' },
  ],
};

const fontVariables = [
  archivo.variable,
  archivoBlack.variable,
  instrumentSerif.variable,
  jetbrainsMono.variable,
].join(' ');

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      // The pre-paint script below rewrites this before React hydrates.
      {...{ [THEME_ATTRIBUTE]: DEFAULT_THEME }}
      className={`${fontVariables} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        {/* Runs before anything paints, so a light-theme user never sees a dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
