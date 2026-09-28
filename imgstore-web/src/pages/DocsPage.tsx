import React from 'react';
import { Box, Typography } from '@mui/material';
import { ApiDocsSection } from '../components/ApiDocsSection';

/* Hallmark · page: docs · macrostructure: Workbench · theme: Liquid Glass */

export const DocsPage: React.FC = () => {
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
      <ApiDocsSection />
    </Box>
  );
};
