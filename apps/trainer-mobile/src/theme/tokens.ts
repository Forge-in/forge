/**
 * Wrath Trainer design tokens.
 *
 * Transcribed 1:1 from the `Wrath Trainer v3` Claude design, whose two palettes live as
 * CSS custom properties on `:root` and `:root[data-trainer-theme="light"]`. React Native has
 * no cascade, so the same values are exported as plain objects and threaded through context
 * (see ThemeProvider) — that is the only structural change; every literal below is the
 * design's own.
 *
 * Two of the design's tokens are deliberately absent. `--desk` painted the canvas *behind* the
 * 390x844 phone frame, which has no equivalent on a real device. `--glow` drove the ambient
 * bloom behind the header, which was dropped after it rendered as a hard orb on-device — see
 * the note in App.tsx.
 */

export type ThemeName = 'dark' | 'light';

/** Every colour role the design defines. Keys mirror the CSS custom property names. */
export interface Palette {
  /** Screen background. */
  bg: string;
  /** Raised card surface. */
  surf: string;
  /** Surface one step above `surf` — avatar wells, icon discs. */
  raise: string;
  /** Hairline border, low contrast. */
  line: string;
  /** Hairline border, higher contrast — used on interactive outlines. */
  line2: string;
  /** De-emphasised text. */
  muted: string;
  /** Secondary text. */
  sub: string;
  /** Primary text. */
  ink: string;
  gold: string;
  goldLt: string;
  goldDk: string;
  /** Translucent gold used for faint fills and borders. */
  goldSoft: string;
  /** Foreground on top of a gold fill. */
  onGold: string;
  warn: string;
  ok: string;
  /** Heavy drop shadow. */
  shadow: string;
  /** Light drop shadow. */
  shadowSoft: string;
  /** Coloured glow cast by gold surfaces. */
  goldGlow: string;
}

export const palettes: Record<ThemeName, Palette> = {
  dark: {
    bg: '#0A0F17',
    surf: '#111925',
    raise: '#1B2533',
    line: '#1A2331',
    line2: '#2A3547',
    muted: '#6E7A8A',
    sub: '#9AA5B4',
    ink: '#F4F1EA',
    gold: '#DCC9A0',
    goldLt: '#F0E3C4',
    goldDk: '#B99A5E',
    goldSoft: 'rgba(228,211,172,0.14)',
    onGold: '#0A0F17',
    warn: '#C97A4A',
    ok: '#7FA88A',
    shadow: 'rgba(2,5,10,0.8)',
    shadowSoft: 'rgba(2,5,10,0.55)',
    goldGlow: 'rgba(220,201,160,0.26)',
  },
  light: {
    bg: '#F5F1EA',
    surf: '#FFFFFF',
    raise: '#F0EBE1',
    line: '#EAE4D9',
    line2: '#DED8CC',
    muted: '#6E6656',
    sub: '#55503F',
    ink: '#1A1712',
    gold: '#8F6F26',
    goldLt: '#BE9548',
    goldDk: '#5C4413',
    goldSoft: 'rgba(143,111,38,0.14)',
    onGold: '#FFF9EC',
    warn: '#9A4E1E',
    ok: '#3F6B4F',
    shadow: 'rgba(60,50,32,0.18)',
    shadowSoft: 'rgba(60,50,32,0.1)',
    goldGlow: 'rgba(124,95,31,0.2)',
  },
};

/**
 * The design's single gold fill: `linear-gradient(135deg, goldLt 0%, gold 52%, goldDk 100%)`.
 *
 * CSS 135deg runs top-left -> bottom-right, which is `start {0,0} -> end {1,1}` for
 * expo-linear-gradient. Returned as a tuple because LinearGradient's `colors` prop is typed
 * as a readonly tuple of at least two colours.
 */
export const goldGradient = (p: Palette): readonly [string, string, string] => [
  p.goldLt,
  p.gold,
  p.goldDk,
];

/** Colour stops for {@link goldGradient}, matching the design's 0% / 52% / 100%. */
export const goldGradientLocations = [0, 0.52, 1] as const;

/** `linear-gradient(140deg, goldLt, goldDk)` — avatar and score rings. */
export const goldRingGradient = (p: Palette): readonly [string, string] => [p.goldLt, p.goldDk];

export const gradientDiagonal = {
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const;

export const gradientHorizontal = {
  start: { x: 0, y: 0.5 },
  end: { x: 1, y: 0.5 },
} as const;

export const gradientVertical = {
  start: { x: 0.5, y: 0 },
  end: { x: 0.5, y: 1 },
} as const;

/** Corner radii used by the design, named by the component that owns them. */
export const radii = {
  card: 26,
  cardLg: 28,
  cardXl: 30,
  hero: 32,
  log: 24,
  pill: 19,
  chip: 20,
  badge: 14,
  toast: 22,
  tabBar: 34,
} as const;

/**
 * The design's box shadows. Written as CSS shadow strings for React Native's `boxShadow`
 * style prop, which RN 0.86 supports on both iOS and Android — unlike the legacy
 * `shadowOffset`/`shadowOpacity`/`shadowRadius` trio, which is iOS-only and would have
 * silently dropped every shadow on Android.
 */
export const shadows = (p: Palette) => ({
  /** `0 8px 24px shadowSoft` — roster rows, plan day cards. */
  soft: `0px 8px 24px ${p.shadowSoft}`,
  /** `0 10px 30px shadowSoft` — stat strips, adherence card. */
  soft10: `0px 10px 30px ${p.shadowSoft}`,
  /** `0 12px 34px shadowSoft` — the runner's exercise card. */
  soft12: `0px 12px 34px ${p.shadowSoft}`,
  /** `0 14px 40px shadowSoft` — the client detail hero. */
  soft14: `0px 14px 40px ${p.shadowSoft}`,
  /** `0 18px 44px shadow` — the floating tab bar. */
  hard: `0px 18px 44px ${p.shadow}`,
  /** `0 14px 36px shadow` — the toast. */
  toast: `0px 14px 36px ${p.shadow}`,
  /** `0 10px 26px goldGlow` — selected chips and week pills. */
  glow10: `0px 10px 26px ${p.goldGlow}`,
  /** `0 12px 30px goldGlow` — secondary gold CTAs. */
  glow12: `0px 12px 30px ${p.goldGlow}`,
  /** `0 12px 34px goldGlow` — the Today CTA. */
  glow12b: `0px 12px 34px ${p.goldGlow}`,
  /** `0 14px 36px goldGlow` — the full-width primary CTAs. */
  glow14: `0px 14px 36px ${p.goldGlow}`,
});

export type Shadows = ReturnType<typeof shadows>;
