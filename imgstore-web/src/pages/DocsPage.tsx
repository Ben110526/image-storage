import React, { useEffect, useState } from 'react';
import { Box, Button, Drawer, IconButton, Typography, useMediaQuery } from '@mui/material';
import {
  FormatListBulleted as TocIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { ApiDocsSection } from '../components/ApiDocsSection';
import { useAppearance } from '../context/AppearanceContext';
import { haptics } from '../lib/haptics';

/* Docs — plan §10.4, FIX-07: the TOC sidebar exists only from 900px up;
 * below that a "Mục lục" button opens a bottom sheet with the same section
 * links. Scrollspy, section IDs and reduced-motion scroll behavior are
 * shared between the two presentations. */

const TOC_ITEMS = [
  { id: 'api-quickstart', label: 'Quickstart' },
  { id: 'api-files', label: 'Files' },
  { id: 'api-folders', label: 'Folders' },
  { id: 'api-import', label: 'Import URL' },
  { id: 'api-resumable', label: 'Resumable' },
  { id: 'api-limits', label: 'Limits' },
  { id: 'api-reference', label: 'Reference' },
] as const;

export const DocsPage: React.FC = () => {
  const [activeId, setActiveId] = useState<string>(TOC_ITEMS[0].id);
  const [tocSheetOpen, setTocSheetOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width:900px)');

  // Scrollspy: highlight the TOC entry whose section is in view.
  // rootMargin pins the "active line" just under the sticky navbar.
  useEffect(() => {
    const sections = TOC_ITEMS.map(i => document.getElementById(i.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;

    const visible = new Map<string, IntersectionObserverEntry>();
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry);
          else visible.delete(entry.target.id);
        }
        // Pick the topmost visible section as active
        const ordered = TOC_ITEMS.find(i => visible.has(i.id));
        if (ordered) setActiveId(ordered.id);
      },
      { rootMargin: '-90px 0px -55% 0px', threshold: 0 }
    );
    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const { reduceMotion } = useAppearance();

  const scrollToSection = (id: string) => {
    haptics.playTick();
    setActiveId(id);
    setTocSheetOpen(false);
    // Reduced motion (app toggle OR OS) jumps instead of smooth-scrolling.
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const renderTocItems = () =>
    TOC_ITEMS.map((item, i) => {
      const isActive = item.id === activeId;
      return (
        <Box
          key={item.id}
          component="button"
          onClick={() => scrollToSection(item.id)}
          aria-label={`Jump to ${item.label}`}
          aria-current={isActive ? 'location' : undefined}
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 1,
            width: '100%',
            px: 1.5,
            py: 0.75,
            /* FIX-07 — ≥44px touch targets on the sheet rows. */
            minHeight: 44,
            textAlign: 'left',
            cursor: 'pointer',
            border: 'none',
            borderLeft: '2px solid',
            borderLeftColor: isActive ? 'var(--color-accent)' : 'transparent',
            background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
            color: isActive ? 'var(--color-accent)' : 'text.secondary',
            fontWeight: isActive ? 600 : 400,
            borderRadius: 0,
            borderTopRightRadius: 8,
            borderBottomRightRadius: 8,
            fontSize: '0.875rem',
            fontFamily: 'var(--font-body)',
            transition: 'color 150ms ease, background-color 150ms ease, border-color 150ms ease',
            '&:hover': {
              color: 'var(--color-accent)',
              backgroundColor: 'var(--color-accent-subtle)',
            },
          }}
        >
          <Box
            component="span"
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--color-accent)',
              opacity: isActive ? 1 : 0.75,
            }}
          >
            {String(i + 1).padStart(2, '0')}
          </Box>
          {item.label}
        </Box>
      );
    });

  return (
    <Box>
      {/* LG-10 — proper H1, no terminal-hero cosplay. */}
      <Box sx={{ mb: { xs: 3, md: 4 } }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
            letterSpacing: '-0.02em',
            color: 'var(--color-text-primary)',
          }}
        >
          Tài liệu API
        </Typography>
        <Typography
          variant="body2"
          sx={{ mt: 1, color: 'var(--color-text-secondary)', maxWidth: 560 }}
        >
          Mọi thao tác trên web UI đều script được qua HTTPS + API key. Kết nối
          key để chạy thử request ngay trong trang này.
        </Typography>
      </Box>

      {/* FIX-07 — mobile TOC: "Mục lục" button opens a bottom sheet. */}
      {!isDesktop && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<TocIcon sx={{ fontSize: 16 }} />}
          onClick={() => {
            haptics.playClick();
            setTocSheetOpen(true);
          }}
          aria-haspopup="dialog"
          aria-expanded={tocSheetOpen}
          className="pressable"
          sx={{ mb: 2, borderRadius: 'var(--radius-full)', textTransform: 'none', minHeight: 44 }}
        >
          Mục lục
        </Button>
      )}

      {/* maxWidth centers the TOC+content group; without it the fixed-cap
          content column hugs the left and leaves dead space on the right. */}
      <Box
        sx={{
          display: 'flex',
          gap: { md: 4, lg: 6 },
          alignItems: 'flex-start',
          maxWidth: { lg: 1240 },
          mx: 'auto',
        }}
      >
        {/* FIX-07 — sticky TOC sidebar exists only from 900px up. */}
        {isDesktop && (
          <Box
            component="nav"
            aria-label="API docs sections"
            sx={{
              width: 190,
              flexShrink: 0,
              position: 'sticky',
              top: 88,
              maxHeight: 'calc(100vh - 120px)',
              overflowY: 'auto',
              py: 1,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mb: 1.25,
                px: 1.5,
                color: 'var(--color-accent)',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              On this page
            </Typography>
            {renderTocItems()}
          </Box>
        )}

        {/* Docs content */}
        <Box sx={{ flex: 1, minWidth: 0, maxWidth: { sm: 720, lg: 920 } }}>
          <ApiDocsSection />
        </Box>
      </Box>

      {/* FIX-07 — mobile TOC sheet (focus trap/restore via MUI Drawer). */}
      <Drawer
        anchor="bottom"
        open={tocSheetOpen && !isDesktop}
        onClose={() => setTocSheetOpen(false)}
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 'var(--radius-lg)',
              borderTopRightRadius: 'var(--radius-lg)',
              maxHeight: '70dvh',
              backgroundColor: 'var(--color-content)',
            },
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Mục lục
          </Typography>
          <IconButton
            aria-label="Đóng mục lục"
            onClick={() => setTocSheetOpen(false)}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box component="nav" aria-label="API docs sections" sx={{ overflowY: 'auto', py: 1 }}>
          {renderTocItems()}
        </Box>
      </Drawer>
    </Box>
  );
};
