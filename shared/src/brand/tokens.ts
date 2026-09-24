/**
 * Beacon brand identity — the single source of truth for colors.
 * Both the mobile app (NativeWind CSS variables) and the dashboard
 * (Tailwind CSS variables) are generated from these tokens.
 */
export const BRAND = {
  name: 'Beacon',
  nameAr: 'منارة',
  tagline: 'Signals that matter, right on time.',
  taglineAr: 'إشعارات مهمة، في وقتها تماماً.',
} as const;

export const COLOR_TOKEN_NAMES = [
  'background',
  'surface',
  'surface-muted',
  'border',
  'text',
  'text-muted',
  'text-subtle',
  'primary',
  'primary-foreground',
  'primary-soft',
  'secondary',
  'secondary-soft',
  'accent',
  'accent-soft',
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'error',
  'error-soft',
  'info',
  'info-soft',
  'overlay',
] as const;

export type ColorTokenName = (typeof COLOR_TOKEN_NAMES)[number];
export type ColorPalette = Record<ColorTokenName, string>;
export type ColorScheme = 'light' | 'dark';

export const palettes: Record<ColorScheme, ColorPalette> = {
  light: {
    background: '#F6F6FA',
    surface: '#FFFFFF',
    'surface-muted': '#EFEFF5',
    border: '#E4E4EE',
    text: '#12131C',
    'text-muted': '#5B5D70',
    'text-subtle': '#8E90A3',
    primary: '#5046E4',
    'primary-foreground': '#FFFFFF',
    'primary-soft': '#ECEBFD',
    secondary: '#0E9F9A',
    'secondary-soft': '#DFF5F4',
    accent: '#F5A524',
    'accent-soft': '#FEF2DA',
    success: '#16A34A',
    'success-soft': '#E2F5E9',
    warning: '#C26A06',
    'warning-soft': '#FDF0DC',
    error: '#DC2626',
    'error-soft': '#FDE7E7',
    info: '#2563EB',
    'info-soft': '#E3EBFD',
    overlay: '#0B0C12',
  },
  dark: {
    background: '#0B0C12',
    surface: '#15161F',
    'surface-muted': '#1C1D28',
    border: '#272938',
    text: '#F3F3F8',
    'text-muted': '#A5A7BA',
    'text-subtle': '#6F7185',
    primary: '#7A72F6',
    'primary-foreground': '#FFFFFF',
    'primary-soft': '#221F45',
    secondary: '#2CC7C0',
    'secondary-soft': '#0E2B2A',
    accent: '#F7B547',
    'accent-soft': '#2F2512',
    success: '#2FCB6A',
    'success-soft': '#102A1B',
    warning: '#F5A524',
    'warning-soft': '#2F2410',
    error: '#F25C5C',
    'error-soft': '#321616',
    info: '#62A6FA',
    'info-soft': '#13223B',
    overlay: '#000000',
  },
};

/** Converts `#RRGGBB` into `"R G B"` channels so CSS can apply alpha: rgb(var(--x) / 0.5). */
export function hexToRgbChannels(hex: string): string {
  const value = hex.replace('#', '');
  const normalized =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const int = Number.parseInt(normalized, 16);
  if (Number.isNaN(int) || normalized.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`;
}

export type CssColorVariables = Record<`--color-${ColorTokenName}`, string>;

/** Map of `--color-<name>` → `"R G B"` for a palette. */
export function paletteToCssVariables(palette: ColorPalette): CssColorVariables {
  const entries = COLOR_TOKEN_NAMES.map((name) => [`--color-${name}`, hexToRgbChannels(palette[name])]);
  return Object.fromEntries(entries) as CssColorVariables;
}

/** Adds an alpha channel to a hex color, returning an rgba() string. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgbChannels(hex).split(' ');
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`;
}
