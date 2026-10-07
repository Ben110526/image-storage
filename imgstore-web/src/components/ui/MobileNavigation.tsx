import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  CloudUploadOutlined as UploadIcon,
  PhotoLibraryOutlined as LibraryIcon,
  MenuBookOutlined as DocsIcon,
} from '@mui/icons-material';
import { getAppScene } from '../../design/optics/GlassScene';
import { useGlassPane } from '../../design/optics/useGlassPane';
import type { Route } from '../../lib/router';

/* MobileNavigation — bottom destination bar for <900px viewports (plan §5.2).
 * These are real hash links between routes (aria-current="page"), NOT tabs —
 * there is no tabpanel relationship. Height 60–64px content, floating 12px
 * from the sides, 8px + safe-area from the bottom. */

const ITEMS: { route: Route; label: string; icon: React.ReactNode }[] = [
  { route: 'upload', label: 'Upload', icon: <UploadIcon /> },
  { route: 'library', label: 'Library', icon: <LibraryIcon /> },
  { route: 'docs', label: 'API Docs', icon: <DocsIcon /> },
];

export interface MobileNavigationProps {
  route: Route;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({ route }) => {
  /* V2-04 — bottom destination bar as an optical pane: real refraction of the
   * app-owned GlassScene backdrop. Falls back to the CSS material under
   * reduced transparency. */
  const navRef = useGlassPane<HTMLElement>('mobile-navigation', 'pill', getAppScene());

  return (
    <Box
      ref={navRef}
      component="nav"
      aria-label="Điều hướng chính"
      className="glass-regular"
      sx={{
        display: { xs: 'flex', md: 'none' },
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(8px + env(safe-area-inset-bottom))',
        zIndex: (theme) => theme.zIndex.appBar,
        height: 62,
        borderRadius: 'var(--radius-full)',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        px: 1,
      }}
    >
      {ITEMS.map((item) => {
        const active = route === item.route;
        return (
          <Box
            key={item.route}
            component="a"
            href={`#/${item.route}`}
            aria-current={active ? 'page' : undefined}
            className="pressable"
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.25,
              textDecoration: 'none',
              borderRadius: 'var(--radius-full)',
              my: 0.75,
              color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
              transition:
                'background-color var(--duration-normal) var(--ease-standard), color var(--duration-fast) var(--ease-standard)',
              '& svg': { fontSize: 22 },
            }}
          >
            <span aria-hidden style={{ display: 'flex' }}>
              {item.icon}
            </span>
            <Typography
              component="span"
              sx={{
                fontSize: '0.6875rem',
                fontWeight: active ? 600 : 500,
                lineHeight: 1.2,
              }}
            >
              {item.label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
};
