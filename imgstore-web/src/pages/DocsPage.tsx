import React, { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { ApiDocsSection } from '../components/ApiDocsSection';
import { haptics } from '../lib/haptics';

/* Hallmark · page: docs · macrostructure: Workbench · theme: Liquid Glass */

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

  const scrollToSection = (id: string) => {
    haptics.playTick();
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Box>
      <Box sx={{ mb: { xs: 3, md: 4 } }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' },
            letterSpacing: '-0.02em',
          }}
        >
          <Box component="span" sx={{ color: 'var(--color-accent)', mr: 1, fontFamily: 'var(--font-mono)' }}>$</Box>
          imgstore api --docs
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
        >
          # everything the web UI does, scriptable over plain HTTPS + API key.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: { md: 4 }, alignItems: 'flex-start' }}>
        {/* Sticky TOC — hidden below 600px; the section cards carry their own headers */}
        <Box
          component="nav"
          aria-label="API docs sections"
          sx={{
            display: { xs: 'none', sm: 'block' },
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
          {TOC_ITEMS.map((item, i) => {
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
                  fontSize: '0.8rem',
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
          })}
        </Box>

        {/* Docs content */}
        <Box sx={{ flex: 1, minWidth: 0, maxWidth: { sm: 720, lg: 760 } }}>
          <ApiDocsSection />
        </Box>
      </Box>
    </Box>
  );
};
