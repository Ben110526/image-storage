import React, { type ReactNode } from 'react';
import { Box, Typography } from '@mui/material';

/* PageHeader — the single H1 per page plus an optional short description and
 * trailing actions. Keeps heading hierarchy consistent across routes (plan
 * §5.1: "một H1 mỗi trang"). */

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 2,
        mb: { xs: 3, md: 4 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '1.75rem', md: '2rem' },
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.18,
            color: 'var(--color-text-primary)',
          }}
        >
          {title}
        </Typography>
        {description && (
          <Typography
            variant="body1"
            sx={{ mt: 0.5, color: 'var(--color-text-secondary)', maxWidth: 560 }}
          >
            {description}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>{actions}</Box>}
    </Box>
  );
};
