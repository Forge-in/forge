/**
 * Type system for the Wrath Trainer design.
 *
 * Three families carry the whole design: Archivo (UI), Instrument Serif (display numerals
 * and titles) and JetBrains Mono (labels, metadata, kickers).
 *
 * Two translations from the CSS are worth knowing about:
 *
 * 1. `font-weight` does nothing for a custom font in React Native — each weight is a
 *    separate font file and must be selected by family name. Hence `sans(size, 600)`
 *    resolves to the `Archivo_600SemiBold` face rather than setting `fontWeight`.
 * 2. CSS `letter-spacing` is in `em`; RN's `letterSpacing` is in points. The helpers take
 *    the design's em value and multiply by the font size, so the numbers below stay
 *    readable against the source.
 */
import { Platform, type TextStyle } from 'react-native';

// Imported one weight per subpath, NOT from the package root. Each `@expo-google-fonts`
// package's index re-exports every weight it ships with a bare `require()`, so importing from
// the root pulls all of them into the Metro graph — 36 TTFs and ~5 MB of assets for the five
// faces this design actually uses. The deep paths bundle only what is rendered.
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular';
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium';
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';

export const fontFamilies = {
  sans400: 'Archivo_400Regular',
  sans500: 'Archivo_500Medium',
  sans600: 'Archivo_600SemiBold',
  serif: 'InstrumentSerif_400Regular',
  mono: 'JetBrainsMono_400Regular',
} as const;

/**
 * The font map handed to `useFonts`.
 *
 * Only the faces the design actually paints are listed. The design's Google Fonts URL also
 * requests JetBrains Mono 500, but no rule in the document ever sets a weight on mono text,
 * so shipping that file would be dead weight in the bundle.
 */
export const fontAssets = {
  [fontFamilies.sans400]: Archivo_400Regular,
  [fontFamilies.sans500]: Archivo_500Medium,
  [fontFamilies.sans600]: Archivo_600SemiBold,
  [fontFamilies.serif]: InstrumentSerif_400Regular,
  [fontFamilies.mono]: JetBrainsMono_400Regular,
} as const;

type SansWeight = 400 | 500 | 600;

const sansFamily: Record<SansWeight, string> = {
  400: fontFamilies.sans400,
  500: fontFamilies.sans500,
  600: fontFamilies.sans600,
};

/**
 * Android reserves extra vertical room around glyphs based on the font's own metrics, which
 * fights every tight line height in this design (the 58px dial numeral is set at 0.84).
 * Turning it off is what makes the RN output match the browser.
 */
const trim: TextStyle = Platform.OS === 'android' ? { includeFontPadding: false } : {};

/** Rounds to 2dp so generated letter spacing does not carry float noise into snapshots. */
const px = (value: number) => Math.round(value * 100) / 100;

export interface TypeOptions {
  /** The design's `letter-spacing`, in `em`. */
  tracking?: number;
  /** The design's unitless `line-height`. Omit to let the font's own metrics decide. */
  leading?: number;
  uppercase?: boolean;
}

const build = (fontFamily: string, fontSize: number, options: TypeOptions = {}): TextStyle => {
  const { tracking, leading, uppercase } = options;
  return {
    fontFamily,
    fontSize,
    ...trim,
    ...(tracking === undefined ? null : { letterSpacing: px(fontSize * tracking) }),
    ...(leading === undefined ? null : { lineHeight: px(fontSize * leading) }),
    ...(uppercase ? { textTransform: 'uppercase' as const } : null),
  };
};

/** Archivo — body copy, names, section headings and button labels. */
export const sans = (fontSize: number, weight: SansWeight = 400, options: TypeOptions = {}) =>
  build(sansFamily[weight], fontSize, options);

/** Instrument Serif — display numerals and the large editorial titles. */
export const serif = (fontSize: number, options: TypeOptions = {}) =>
  build(fontFamilies.serif, fontSize, options);

/** JetBrains Mono — kickers, metadata, timestamps and pill labels. */
export const mono = (fontSize: number, options: TypeOptions = {}) =>
  build(fontFamilies.mono, fontSize, options);

/**
 * Ceiling for OS font scaling.
 *
 * The design is a dense, fixed-height phone layout; letting text grow without bound turns
 * every card into an overflowing one. 1.3 keeps large-text accessibility settings genuinely
 * useful while the layout still holds together.
 */
export const MAX_FONT_SCALE = 1.3;
