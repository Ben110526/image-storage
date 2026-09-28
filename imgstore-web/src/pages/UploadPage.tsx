import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { StorageTelemetryDeck } from '../components/StorageTelemetryDeck';
import { DropZone } from '../components/DropZone';

/* Hallmark · page: upload · macrostructure: Workbench · theme: Liquid Glass */

export const UploadPage: React.FC = () => {
  return (
    <Box>
      {/* Hero — terminal prompt style, no banner card */}
      <Box sx={{ mb: { xs: 3, md: 4 }, maxWidth: 720 }}>
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontFamily: 'var(--font-body)',
            fontWeight: 700,
            fontSize: { xs: '1.25rem', sm: '1.5rem', md: '1.75rem' },
            letterSpacing: '-0.02em',
            overflowWrap: 'anywhere',
            minWidth: 0,
          }}
        >
          <Box component="span" sx={{ color: 'var(--color-accent)', mr: 1, fontFamily: 'var(--font-mono)' }}>$</Box>
          imgstore upload
          <Box component="span" sx={{ color: 'var(--color-ink-3)', fontWeight: 400, fontFamily: 'var(--font-mono)', fontSize: '0.78em' }}>
            {' '}--to uploads/{new Date().toISOString().slice(0, 7)}
          </Box>
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mt: 1, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
        >
          # drop or paste (⌘V) screenshots &amp; images — they land in your own
          folder and are served from the Cloudflare edge. No setup required.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
          <Chip label="edge-cached" size="small" variant="outlined" />
          <Chip label="resumable" size="small" variant="outlined" />
          <Chip label="per-key folder" size="small" variant="outlined" />
          <Chip label="REST API" size="small" variant="outlined" />
        </Box>
      </Box>

      <StorageTelemetryDeck />
      <DropZone />
    </Box>
  );
};
