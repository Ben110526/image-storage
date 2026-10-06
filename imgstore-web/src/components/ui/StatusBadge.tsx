import React, { type ReactNode } from 'react';
import { Chip, type ChipProps } from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  WarningAmber as WarningIcon,
  ErrorOutlined as ErrorIcon,
  InfoOutlined as InfoIcon,
  RemoveCircleOutlined as NeutralIcon,
} from '@mui/icons-material';

/* StatusBadge — semantic status chip. Always carries icon + text (color is
 * never the only signal, plan §6.2). Uses the severity surface/foreground
 * tokens so the global glass selectors can't wash semantic color away. */

export type StatusSeverity = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusBadgeProps extends Omit<ChipProps, 'color' | 'icon'> {
  severity: StatusSeverity;
  icon?: ReactNode;
}

const DEFAULT_ICONS: Record<StatusSeverity, ReactNode> = {
  success: <SuccessIcon />,
  warning: <WarningIcon />,
  error: <ErrorIcon />,
  info: <InfoIcon />,
  neutral: <NeutralIcon />,
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  severity,
  icon,
  sx,
  ...rest
}) => {
  const fg =
    severity === 'neutral'
      ? 'var(--color-text-tertiary)'
      : `var(--color-${severity === 'error' ? 'destructive' : severity})`;
  const bg =
    severity === 'neutral'
      ? 'var(--color-content-secondary)'
      : `var(--color-${severity === 'error' ? 'destructive' : severity}-surface)`;

  return (
    <Chip
      size="small"
      icon={<span aria-hidden style={{ display: 'flex' }}>{icon ?? DEFAULT_ICONS[severity]}</span>}
      sx={{
        fontWeight: 500,
        color: fg,
        backgroundColor: bg,
        border: 'none',
        '& .MuiChip-icon': { color: 'inherit' },
        ...sx,
      }}
      {...rest}
    />
  );
};
