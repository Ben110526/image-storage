import { forwardRef, type HTMLAttributes } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';

/* GlassSurface — Liquid Glass material with an explicit role.
 *
 *   regular  (G1) — floating navigation / toolbars
 *   elevated (G2) — menus, popovers, dialog/sheet headers
 *   clear    (G3) — controls floating directly on media; the parent media
 *                   stage MUST render a .glass-clear-scrim behind them
 *
 * `lens` opts the pane into SVG refraction once the flag-gated lens system is
 * QA'd on real GPUs (plan §8.6); it is off by default and the CSS baseline is
 * the production rendering. Accepts `sx` for layout only. */

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'regular' | 'elevated' | 'clear';
  /** Opt into the SVG refraction lens. Off by default; CSS-only baseline. */
  lens?: boolean;
  sx?: SxProps<Theme>;
}

export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  ({ variant = 'regular', lens = false, className, sx, ...rest }, ref) => {
    const classes = [
      variant === 'regular' && 'glass-regular',
      variant === 'elevated' && 'glass-elevated',
      variant === 'clear' && 'glass-clear',
      lens && 'glass-lens',
      className,
    ]
      .filter(Boolean)
      .join(' ');
    return <Box ref={ref} className={classes} sx={sx} {...rest} />;
  },
);
GlassSurface.displayName = 'GlassSurface';
