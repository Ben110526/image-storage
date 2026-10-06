import React, { type ReactNode } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import {
  CloudOff as OfflineIcon,
  ErrorOutlined as ErrorIcon,
  Inbox as EmptyIcon,
  LockOutlined as LockIcon,
  SearchOff as NoResultsIcon,
} from '@mui/icons-material';

/* LG-03 — DataState: one honest component for the five data/auth render
 * states. The redesign's core correctness rule (plan §3.3, §12.3): never
 * present an error as empty, never present anonymous as empty, and never show
 * "0" for a value that has not loaded — unknowns render as "—". */

export type DataStateKind =
  | 'loading'
  | 'needs-auth'
  | 'empty'
  | 'no-results'
  | 'error'
  | 'offline';

export interface DataStateProps {
  kind: DataStateKind;
  title: string;
  description?: string;
  /** Primary action — e.g. Connect for needs-auth, Retry for error. */
  action?: { label: string; onClick: () => void };
  /** Secondary action — e.g. Clear search for no-results. */
  secondaryAction?: { label: string; onClick: () => void };
  /** Compact mode for in-panel states (less vertical padding). */
  compact?: boolean;
  /** Extra MUI sx for the root Box (e.g. margin when used as a banner). */
  sx?: object;
  children?: ReactNode;
}

const ICONS: Record<DataStateKind, ReactNode> = {
  loading: null,
  'needs-auth': <LockIcon />,
  empty: <EmptyIcon />,
  'no-results': <NoResultsIcon />,
  error: <ErrorIcon />,
  offline: <OfflineIcon />,
};

export const DataState: React.FC<DataStateProps> = ({
  kind,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  sx,
  children,
}) => {
  return (
    <Box
      role={kind === 'error' || kind === 'offline' ? 'alert' : 'status'}
      aria-live={kind === 'loading' ? 'polite' : undefined}
      aria-busy={kind === 'loading'}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        gap: 1.5,
        py: compact ? 4 : 8,
        px: 3,
        color: 'var(--color-text-secondary)',
        ...sx,
      }}
    >
      {kind === 'loading' ? (
        <CircularProgress size={32} thickness={4} aria-label={title} />
      ) : (
        <Box
          aria-hidden
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--color-content-secondary)',
            color:
              kind === 'error' || kind === 'offline'
                ? 'var(--color-destructive)'
                : 'var(--color-text-tertiary)',
            '& svg': { fontSize: 28 },
          }}
        >
          {ICONS[kind]}
        </Box>
      )}

      <Typography
        variant="h6"
        component="p"
        sx={{ color: 'var(--color-text-primary)', fontWeight: 600 }}
      >
        {title}
      </Typography>

      {description && (
        <Typography variant="body2" sx={{ maxWidth: 420 }}>
          {description}
        </Typography>
      )}

      {(action || secondaryAction) && (
        <Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
          {action && (
            <Button variant="contained" onClick={action.onClick} className="pressable">
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="outlined" onClick={secondaryAction.onClick} className="pressable">
              {secondaryAction.label}
            </Button>
          )}
        </Box>
      )}

      {children}
    </Box>
  );
};
