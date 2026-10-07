import { createTheme } from '@mui/material/styles';
import {
  MUI_PALETTE_LIGHT,
  MUI_PALETTE_DARK,
  RADIUS,
  type PaletteMode,
} from './design/tokens.generated';

/* R3 — reduced motion must own MUI's JS-driven transitions, not just our CSS:
 * Drawer/Slide (folder sheet, TOC sheet), Dialog/Menu (zoom/fade) and Collapse
 * (URL form) animate via inline styles. Theme props own their timing; CSS
 * guards use !important to suppress spatial transitions, including mid-flight.
 *
 * C1 — the effective flag MUST come in as an argument, not be read from the
 * DOM: AppearanceProvider applies data-motion in an effect AFTER render, so a
 * theme re-created during that same render would read the STALE attribute and
 * the first toggle would keep the old 225ms slide until reload. Callers pass
 * the effective reduceMotion (app toggle OR OS) from useAppearance(). */

/* Hallmark · theme: Liquid Glass — palette, typography and shape are derived
 * from the canonical token registry (design/tokens.json via
 * tokens.generated.ts). MUI needs concrete sRGB values; CSS custom properties
 * are used only inside styleOverrides, which run in the browser. */

export const getAppTheme = (mode: PaletteMode, reduceMotion = false) => {
  const palette = mode === 'dark' ? MUI_PALETTE_DARK : MUI_PALETTE_LIGHT;
  /* Reduced overlays are instant or opacity-only (motion.css). Height changes
   * must be instant; a short Collapse timeout still animates layout. Toasts
   * use notistack's own transition policy in App, outside MuiSnackbar. */
  const transition = reduceMotion ? 80 : undefined;

  return createTheme({
    palette: {
      mode,
      primary: palette.primary,
      secondary: palette.secondary,
      error: palette.error,
      warning: palette.warning,
      info: palette.info,
      success: palette.success,
      background: palette.background,
      text: palette.text,
      divider: palette.divider,
    },
    typography: {
      // System font stack — no webfont download for UI text (plan §7.1).
      fontFamily:
        'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      h1: {
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.18,
        fontSize: '2rem',
      },
      h2: {
        fontWeight: 650,
        letterSpacing: '-0.015em',
        lineHeight: 1.3,
        fontSize: '1.375rem',
      },
      h3: {
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1.35,
        fontSize: '1.125rem',
      },
      h4: {
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1.3,
        fontSize: '1rem',
      },
      h5: {
        fontWeight: 600,
        letterSpacing: '-0.01em',
        lineHeight: 1.3,
        fontSize: '0.9375rem',
      },
      h6: {
        fontWeight: 600,
        letterSpacing: '-0.005em',
        lineHeight: 1.35,
        fontSize: '0.875rem',
      },
      // Body at 16px — readable on touch devices, avoids iOS auto-zoom on
      // focus for any input inheriting it (plan §7.1).
      body1: {
        fontSize: '1rem',
        lineHeight: 1.5,
      },
      body2: {
        fontSize: '0.875rem',
        lineHeight: 1.45,
      },
      caption: {
        fontSize: '0.75rem',
        fontWeight: 500,
        lineHeight: 1.4,
      },
      overline: {
        fontSize: '0.75rem',
        fontWeight: 500,
        letterSpacing: '0.08em',
        lineHeight: 1.3,
      },
      button: {
        textTransform: 'none',
        fontWeight: 600,
        fontSize: '0.9375rem',
      },
    },
    shape: {
      borderRadius: parseInt(RADIUS.sm, 10),
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.full,
            boxShadow: 'none',
            /* R5 — 44px touch target (plan §6): a desktop pointer can hit
             * anything, but these buttons are also the mobile primary actions
             * (Connect, folder sheet, needs-auth CTA all measured 40px in the
             * recheck review). */
            minHeight: 44,
            '&:hover': {
              boxShadow: 'none',
            },
          },
          contained: {
            boxShadow: 'none',
          },
          outlined: {
            // Solid bordered control — no per-control backdrop blur (plan
            // §3.3: inputs and chips inside glass use plain fills).
            backgroundColor: 'transparent',
            borderColor: 'var(--color-control-border)',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            // 44px hit area target (plan §6: WCAG target size).
            width: 44,
            height: 44,
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.md,
            border: '1px solid var(--color-border)',
            boxShadow: 'none',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
          rounded: {
            borderRadius: RADIUS.md,
          },
        },
      },
      MuiAccordion: {
        styleOverrides: {
          root: {
            backgroundColor: 'transparent',
            boxShadow: 'none',
          },
        },
      },
      // Fields: plain filled surface, no backdrop filter of their own (plan
      // §3.3 — no glass nested inside glass).
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--color-content-secondary)',
            borderRadius: RADIUS.sm,
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'var(--color-border)',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'var(--color-control-border)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: 'var(--color-focus)',
              borderWidth: 2,
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 500,
          },
          outlined: {
            backgroundColor: 'transparent',
            borderColor: 'var(--color-control-border)',
          },
        },
      },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
        },
        styleOverrides: {
          tooltip: {
            // Opaque, small, never glass (plan §11).
            backgroundColor: 'var(--color-content-elevated)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            fontSize: '0.75rem',
            maxWidth: 280,
          },
          arrow: {
            color: 'var(--color-content-elevated)',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: RADIUS.sm,
          },
        },
      },
      /* Dialog/sheet body is C0 opaque (FIX-01.5 — documented choice: no
       * translucent form bodies; no blur wasted under opaque content). */
      MuiDialog: {
        /* R3 — transitionDuration override lives here (single MuiDialog key). */
        defaultProps: { transitionDuration: transition },
        styleOverrides: {
          paper: {
            borderRadius: RADIUS.dialog,
            backgroundColor: 'var(--color-content)',
            color: 'var(--color-text-primary)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-dialog)',
            backgroundImage: 'none',
          },
        },
      },
      /* Backdrop dims via token; blur only when transparency is full — with
       * reduced transparency it must be a plain dim (FIX-02). */
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: 'var(--color-backdrop)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            'html[data-transparency="reduced"] &': {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            },
            '@media (prefers-reduced-transparency: reduce)': {
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            },
            /* Menu/Popover use an invisible click catcher, not a modal dim.
             * Blurring it hides the contrast between the glass and backdrop. */
            '&.MuiBackdrop-invisible': {
              backgroundColor: 'transparent',
              backdropFilter: 'none',
              WebkitBackdropFilter: 'none',
            },
          },
        },
      },
      /* Menus/popovers are G2 chrome — the .glass-elevated class in
       * materials.css carries fill/border/shadow/filter; here we route MUI's
       * Paper image/shadow to that same recipe (FIX-01.4:
       * the override applies the material class, it does not make every
       * Paper in the app glass). */
      MuiMenu: {
        /* R3 — transitionDuration override lives here (single MuiMenu key);
         * see the transition-owning component block below. */
        defaultProps: { transitionDuration: transition },
        styleOverrides: {
          paper: {
            borderRadius: RADIUS.menu,
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            '&.glass-elevated': {
              backgroundImage: 'var(--glass-specular)',
              boxShadow: 'var(--glass-g2-shadow)',
              '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': {
                backgroundImage: 'none',
              },
            },
          },
        },
      },
      /* Overlay papers suppress transform transitions in motion.css. Collapse
       * changes height, so both enter and exit use zero duration when reduced. */
      MuiDrawer: { defaultProps: { transitionDuration: transition } },
      MuiCollapse: { defaultProps: { timeout: reduceMotion ? 0 : undefined } },
      MuiSnackbar: { defaultProps: { transitionDuration: transition } },
    },
  });
};
