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

/* KeyboardShortcutsModal — plan §11.3: G2 chrome, <kbd> tokens from the
 * registry, Vietnamese labels, divider-free rhythm via row spacing. */

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
    <Typography variant="body2" sx={{ color: 'var(--color-text-secondary)' }}>
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
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-content-secondary)',
            border: '1px solid var(--color-border)',
            boxShadow: '0 2px 0 0 rgba(0,0,0,0.15)',
            color: 'var(--color-text-primary)',
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
      aria-label="Phím tắt"
      slotProps={{
        paper: {
          className: 'glass-elevated',
          sx: { p: 0.5 },
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
          <KeyboardIcon sx={{ color: 'var(--color-accent)' }} fontSize="small" />
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.05rem' }}>
            Phím tắt
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Đóng phím tắt">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 1, pb: 2 }}>
        <Typography
          variant="caption"
          sx={{ display: 'block', mb: 2, color: 'var(--color-text-tertiary)' }}
        >
          Điều khiển ImgStore nhanh hơn bằng bàn phím
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <ShortcutRow keys={['1']} description="Đi tới trang Upload" />
          <Divider sx={{ my: 0.5, borderColor: 'var(--color-border)' }} />
          <ShortcutRow keys={['2']} description="Đi tới Thư viện" />
          <Divider sx={{ my: 0.5, borderColor: 'var(--color-border)' }} />
          <ShortcutRow keys={['3']} description="Đi tới API Docs" />
          <Divider sx={{ my: 0.5, borderColor: 'var(--color-border)' }} />
          <ShortcutRow keys={['/']} description="Focus ô tìm kiếm (Thư viện)" />
          <Divider sx={{ my: 0.5, borderColor: 'var(--color-border)' }} />
          <ShortcutRow keys={['U']} description="Mở hộp chọn file (Upload)" />
          <Divider sx={{ my: 0.5, borderColor: 'var(--color-border)' }} />
          <ShortcutRow keys={['M']} description="Bật/tắt âm thanh" />
          <Divider sx={{ my: 0.5, borderColor: 'var(--color-border)' }} />
          <ShortcutRow keys={['T']} description="Đổi theme (sáng/tối)" />
          <Divider sx={{ my: 0.5, borderColor: 'var(--color-border)' }} />
          <ShortcutRow keys={['?']} description="Mở bảng phím tắt" />
          <Divider sx={{ my: 0.5, borderColor: 'var(--color-border)' }} />
          <ShortcutRow keys={['Esc']} description="Đóng dialog / modal" />
        </Box>
      </DialogContent>
    </Dialog>
  );
};
