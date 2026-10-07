import { forwardRef, type HTMLAttributes } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';

/* GlassSurface — Liquid Glass material with an explicit role.
 *
 *   regular  (G1) — floating navigation / toolbars
 *   elevated (G2) — menus, popovers, dialog/sheet headers
 *   clear    (G3) — controls floating directly on media; the parent media
 *                   stage MUST render a .glass-clear-scrim behind them
 *
 * Real refraction (canvas displacement, ADR-ENGINE Đường B) is layered on by
 * GlassPane via the optics registry; this component stays the CSS material
 * that is also the reduced-transparency / no-canvas fallback.
 * Accepts `sx` for layout only. */

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'regular' | 'elevated' | 'clear';
  sx?: SxProps<Theme>;
}

export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  ({ variant = 'regular', className, sx, ...rest }, ref) => {
    const classes = [
      variant === 'regular' && 'glass-regular',
      variant === 'elevated' && 'glass-elevated',
      variant === 'clear' && 'glass-clear',
      className,
    ]
      .filter(Boolean)
      .join(' ');
    return <Box ref={ref} className={classes} sx={sx} {...rest} />;
  },
);
GlassSurface.displayName = 'GlassSurface';
