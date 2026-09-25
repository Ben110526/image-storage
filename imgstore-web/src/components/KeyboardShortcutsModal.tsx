import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Divider,
} from '@mui/material';
import { Close as CloseIcon, Keyboard as KeyboardIcon } from '@mui/icons-material';

interface ShortcutRowProps {
  keys: string[];
  description: string;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ keys, description }) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      py: 1.25,
    }}
  >
    <Typography variant="body2" color="text.secondary">
      {description}
    </Typography>
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
      {keys.map((k, idx) => (
        <Box
          key={idx}
          component="kbd"
          sx={{
            px: 1.2,
            py: 0.4,
            fontSize: '0.75rem',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 600,
            borderRadius: 1,
            backgroundColor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 2px 0 0 rgba(0,0,0,0.2)',
            color: 'text.primary',
          }}
        >
          {k}
        </Box>
      ))}
    </Box>
  </Box>
);

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onClose,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: (theme) =>
              theme.palette.mode === 'dark'
                ? 'rgba(5, 8, 16, 0.78)'
                : 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          },
        },
        paper: {
          className: 'liquid-glass-dialog',
          sx: {
            p: 1,
          },
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <KeyboardIcon color="primary" fontSize="small" />
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
            Keyboard Shortcuts
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1, pb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Control ImgStore faster using your keyboard
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <ShortcutRow keys={['1']} description="Go to Upload page" />
          <Divider sx={{ my: 0.5 }} />
          <ShortcutRow keys={['2']} description="Go to Media Library" />
          <Divider sx={{ my: 0.5 }} />
          <ShortcutRow keys={['3']} description="Go to API Docs" />
          <Divider sx={{ my: 0.5 }} />
          <ShortcutRow keys={['/']} description="Focus search bar (Library)" />
          <Divider sx={{ my: 0.5 }} />
          <ShortcutRow keys={['M']} description="Toggle sound haptics" />
          <Divider sx={{ my: 0.5 }} />
          <ShortcutRow keys={['T']} description="Toggle theme (dark/light)" />
          <Divider sx={{ my: 0.5 }} />
          <ShortcutRow keys={['?']} description="Open shortcuts reference" />
          <Divider sx={{ my: 0.5 }} />
          <ShortcutRow keys={['Esc']} description="Close dialog / modal" />
        </Box>
      </DialogContent>
    </Dialog>
  );
};
