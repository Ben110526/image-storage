import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import { haptics } from '../lib/haptics';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmText = 'Confirm Delete',
  cancelText = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: (theme) =>
              theme.palette.mode === 'dark'
                ? 'rgba(15, 23, 42, 0.45)'
                : 'rgba(15, 23, 42, 0.28)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          },
        },
        paper: {
          className: 'liquid-glass-dialog',
          sx: { p: 1 },
        },
      }}
    >
      <DialogTitle
        sx={{
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          fontSize: '1.15rem',
          pb: 1,
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: '0.9rem' }}>{message}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 1, gap: 1 }}>
        <Button
          onClick={() => {
            haptics.playClick();
            onCancel();
          }}
          disabled={loading}
          color="inherit"
          size="small"
          sx={{ textTransform: 'none' }}
        >
          {cancelText}
        </Button>
        <Button
          onClick={() => {
            haptics.playDelete();
            onConfirm();
          }}
          color="error"
          variant="contained"
          disabled={loading}
          size="small"
          className="bevel-button"
          autoFocus
        >
          {loading ? 'Processing...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
