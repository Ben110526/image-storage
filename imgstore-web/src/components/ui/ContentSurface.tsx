import { forwardRef, type HTMLAttributes } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';

/* C0 — Content surface. Opaque, readable, neutral. Media, prose, code, forms,
 * tables and queues live here; never glass, never backdrop-filtered.
 * Accepts MUI `sx` for layout adjustments only — material itself (fill,
 * border, radius, shadow) comes from the .content-surface class. */

export interface ContentSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual variant: default card, secondary inset region, or elevated panel. */
  variant?: 'default' | 'secondary' | 'elevated';
  sx?: SxProps<Theme>;
}

export const ContentSurface = forwardRef<HTMLDivElement, ContentSurfaceProps>(
  ({ variant = 'default', className, sx, ...rest }, ref) => {
    const classes = [
      'content-surface',
      variant === 'secondary' && 'content-surface--secondary',
      variant === 'elevated' && 'content-surface--elevated',
      className,
    ]
      .filter(Boolean)
      .join(' ');
    return <Box ref={ref} className={classes} sx={sx} {...rest} />;
  },
);
ContentSurface.displayName = 'ContentSurface';
