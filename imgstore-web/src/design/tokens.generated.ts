// GENERATED FILE — do not edit by hand.
// Source: design/tokens.json · Generator: scripts/generate-design-tokens.mjs
// Regenerate: npm run tokens

/** Palette blocks consumed by src/theme.ts. MUI color utilities require
 * concrete sRGB values — CSS var() references are not parseable there.
 * DERIVED from the semantic themes in design/tokens.json (R7) — see
 * deriveMuiPalette() in scripts/generate-design-tokens.mjs. */
export const MUI_PALETTE_LIGHT = {
  "primary": {
    "main": "#4658D9",
    "light": "#6B7BE4",
    "dark": "#394BC1",
    "contrastText": "#FFFFFF"
  },
  "secondary": {
    "main": "#205E96",
    "light": "#4A82B4",
    "dark": "#184A78",
    "contrastText": "#FFFFFF"
  },
  "error": {
    "main": "#B42334",
    "contrastText": "#FFFFFF"
  },
  "warning": {
    "main": "#82530C",
    "contrastText": "#FFFFFF"
  },
  "info": {
    "main": "#205E96",
    "contrastText": "#FFFFFF"
  },
  "success": {
    "main": "#17613E",
    "contrastText": "#FFFFFF"
  },
  "background": {
    "default": "#F5F7FA",
    "paper": "#F7F9FC"
  },
  "text": {
    "primary": "#152238",
    "secondary": "#4B5C74",
    "disabled": "#626F82"
  },
  "divider": "#D8DFEA"
} as const;

export const MUI_PALETTE_DARK = {
  "primary": {
    "main": "#A4B1FF",
    "light": "#BAC4FF",
    "dark": "#8896F2",
    "contrastText": "#101632"
  },
  "secondary": {
    "main": "#91CDFF",
    "light": "#B0DCFF",
    "dark": "#6FA8DC",
    "contrastText": "#101623"
  },
  "error": {
    "main": "#FFA5AC",
    "contrastText": "#2A1218"
  },
  "warning": {
    "main": "#F1C574",
    "contrastText": "#261B08"
  },
  "info": {
    "main": "#91CDFF",
    "contrastText": "#101C28"
  },
  "success": {
    "main": "#7BE0AC",
    "contrastText": "#0E241A"
  },
  "background": {
    "default": "#0B0D12",
    "paper": "#141E2B"
  },
  "text": {
    "primary": "#F4F7FB",
    "secondary": "#B8C5D6",
    "disabled": "#8D9BB0"
  },
  "divider": "#394457"
} as const;

export const MOTION = {
  "duration-instant": "80ms",
  "duration-fast": "140ms",
  "duration-normal": "220ms",
  "duration-sheet": "280ms",
  "duration-exit": "180ms",
  "ease-standard": "cubic-bezier(.2,0,0,1)",
  "ease-enter": "cubic-bezier(.16,1,.3,1)",
  "ease-exit": "cubic-bezier(.4,0,1,1)"
} as const;

export const RADIUS = {
  "xs": "10px",
  "sm": "14px",
  "md": "20px",
  "lg": "28px",
  "xl": "36px",
  "menu": "18px",
  "dialog": "28px",
  "full": "9999px"
} as const;

export type PaletteMode = 'light' | 'dark';
