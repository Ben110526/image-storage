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
import { getAppScene } from '../design/optics/GlassScene';
import { useGlassPane } from '../design/optics/useGlassPane';

/* ConfirmDialog — plan §11.2: destructive confirms default-focus CANCEL so
 * Enter/Space never deletes by accident; the destructive action requires a
 * deliberate move. V2-06: the TITLEBAR chrome is an optical pane (plan §8.6:
 * "dialog/sheet thử vỏ/chrome kính trước"); the body keeps its opaque readable
 * fill so confirm text and the destructive action stay semantic and legible.
 *
 * FIX-08 — a pending confirm blocks EVERY dismissal path (Escape, backdrop
 * click, the close affordances): an in-flight destructive request must not
 * lose its context or look cancelled while it is still running. */

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
  confirmText = 'Xóa',
  cancelText = 'Hủy',
  loading = false,
  onConfirm,
  onCancel,
}) => {
  /* V2-06 — titlebar chrome optical; the Dialog scale/fade on open animates
   * the portal without scroll/resize events → trackMotion. */
  const titleRef = useGlassPane<HTMLDivElement>(
    'confirm-dialog-titlebar',
    'pill',
    getAppScene(),
    { trackMotion: true },
  );

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        /* Escape/backdrop are inert while the destructive request runs. */
        if (loading && (reason === 'escapeKeyDown' || reason === 'backdropClick')) return;
        onCancel();
      }}
      maxWidth="xs"
      fullWidth
      aria-label={title}
      slotProps={{
        paper: {
          sx: { p: 0.5 },
        },
      }}
    >
      <DialogTitle
        ref={titleRef}
        component="div"
        className="glass-elevated"
        sx={{
          fontWeight: 600,
          fontSize: '1.05rem',
          color: 'var(--color-text-primary)',
          pb: 0.5,
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
          {message}
        </DialogContentText>
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
          autoFocus
          sx={{ textTransform: 'none', borderRadius: 'var(--radius-full)' }}
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
          className="pressable"
          sx={{ textTransform: 'none', borderRadius: 'var(--radius-full)' }}
        >
          {loading ? 'Đang xử lý…' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
