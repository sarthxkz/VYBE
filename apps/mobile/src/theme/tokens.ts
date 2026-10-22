// Vybe design tokens. One place for color, type, spacing and shape.
// Palette: Electric Grape (brand), Sunset Coral (action/heat), Lime Pop (live/fresh).
// All text/background pairs below meet WCAG AA (>= 4.5:1) for body text.

export const palette = {
  grape50: '#F3F0FF',
  grape100: '#E4DCFF',
  grape500: '#6C4CF5',
  grape600: '#5536DB',
  grape900: '#221548',
  coral400: '#FF8566',
  coral500: '#FF6B4A',
  coral600: '#E5512F',
  lime400: '#C6F432',
  lime700: '#5E7A00',
  sky500: '#3EC6FF',
  amber500: '#FFB020',
  amber700: '#9A6200',
  red500: '#E5484D',
  green600: '#1F9D57',
  ink: '#14121F',
  ink2: '#2A2638',
  gray600: '#5F5A72',
  gray400: '#A29DB4',
  gray200: '#E7E3F2',
  gray100: '#F6F4FB',
  white: '#FFFFFF',
} as const;

export type ColorScheme = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  border: string;
  brand: string;
  brandText: string;
  brandSoft: string;
  /** Brand-colored text/links on bg or surface (AA-safe). */
  link: string;
  action: string;
  actionText: string;
  live: string;
  liveText: string;
  stale: string;
  danger: string;
  success: string;
  overlay: string;
};

export const light: ColorScheme = {
  bg: '#F7F6FB',
  surface: palette.white,
  surfaceAlt: palette.grape50,
  text: palette.ink,
  textMuted: palette.gray600,
  border: palette.gray200,
  brand: palette.grape500,
  brandText: palette.white,
  brandSoft: palette.grape100,
  link: palette.grape600,
  action: palette.coral500,
  actionText: palette.ink,
  live: palette.lime400,
  liveText: palette.lime700,
  stale: palette.amber700,
  danger: '#C62F35',
  success: palette.green600,
  overlay: 'rgba(20,18,31,0.55)',
};

export const dark: ColorScheme = {
  bg: '#0B0A12',
  surface: '#16141F',
  surfaceAlt: '#211D30',
  text: '#F4F2FA',
  textMuted: palette.gray400,
  border: '#2A2639',
  brand: '#7357F6',
  brandText: palette.white,
  brandSoft: '#2C2350',
  link: '#A896FF',
  action: palette.coral400,
  actionText: palette.ink,
  live: palette.lime400,
  liveText: palette.lime400,
  stale: palette.amber500,
  danger: '#FF6B70',
  success: '#3DD68C',
  overlay: 'rgba(0,0,0,0.6)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 12, md: 18, lg: 26, xl: 34, pill: 999 } as const;

export const font = {
  display: 'BricolageGrotesque_700Bold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const type = {
  hero: { fontFamily: font.displayHeavy, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
  heading: { fontFamily: font.display, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: font.body, fontSize: 12, lineHeight: 16 },
} as const;

export type TypeVariant = keyof typeof type;

export const shadow = {
  card: { shadowColor: '#14121F', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  float: { shadowColor: '#14121F', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  glow: { shadowColor: palette.grape500, shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
} as const;

/** Two-stop gradients (drawn with react-native-svg, so no extra native module). Text on them uses the solid token's color. */
export const gradient = {
  brand: ['#7B5CFF', palette.grape600],
  action: ['#FF9A6B', palette.coral500],
  aurora: [palette.grape500, '#B05CFF'],
  sunset: [palette.coral500, palette.amber500],
} as const satisfies Record<string, readonly [string, string]>;

/**
 * Motion. Springs for anything the finger touches (it should feel physical), timings for fades.
 * Everything is skipped when the phone asks for reduced motion.
 */
export const motion = {
  press: { damping: 15, stiffness: 400, mass: 0.6 },
  snappy: { damping: 20, stiffness: 260, mass: 0.8 },
  gentle: { damping: 18, stiffness: 140, mass: 1 },
  bouncy: { damping: 10, stiffness: 220, mass: 0.7 },
  /** Entrances: stiff and quick to settle, with a hint of overshoot. */
  pop: { damping: 17, stiffness: 380, mass: 0.7 },
  fast: 160,
  base: 260,
  slow: 420,
  /** Delay between items in a staggered list entrance. */
  stagger: 45,
} as const;
