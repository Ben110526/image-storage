import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  OutlinedInput,
  Button,
  Box,
  Typography,
  IconButton,
  Alert,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  VpnKey as KeyIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  CheckCircleOutlined as SuccessIcon,
} from '@mui/icons-material';
import { haptics } from '../lib/haptics';

interface ApiKeyDialogProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  onSubmit: (apiKey: string) => void;
  onClose: () => void;
}

export const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({
  open,
  loading,
  error,
  onSubmit,
  onClose,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setApiKey('');
      setShowKey(false);
      // Auto-focus input after animation
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    haptics.playClick();
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && apiKey.trim()) {
      handleSubmit();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="sm"
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
          sx: {
            maxWidth: 480,
            overflow: 'hidden',
            position: 'relative',
            // Ambient specular light sheen at top edge
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: '12%',
              right: '12%',
              height: '1px',
              background: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.5) 50%, transparent 100%)'
                  : 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.9) 50%, transparent 100%)',
              pointerEvents: 'none',
              zIndex: 2,
            },
          },
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          m: 0,
          p: 2.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'primary.main',
              color: 'primary.main',
            }}
          >
            <KeyIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box>
            <Typography
              variant="h6"
              sx={{
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 700,
                fontSize: '1.15rem',
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
              }}
            >
              Connect to ImgStore
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.72rem' }}
            >
              API Key Authentication
            </Typography>
          </Box>
        </Box>
        <IconButton
          onClick={onClose}
          disabled={loading}
          size="small"
          sx={{
            color: 'text.secondary',
            '&:hover': {
              color: 'text.primary',
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
            },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ p: 3, pb: 2 }}>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2.5, lineHeight: 1.6, fontSize: '0.88rem' }}
          >
            Enter your API key to connect. All uploads will be stored in shared
            ImgStore storage and delivered through Cloudflare CDN.
          </Typography>

          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 2.5,
                borderRadius: 2,
                border: '1px solid rgba(239, 68, 68, 0.3)',
                backgroundColor: (theme) =>
                  theme.palette.mode === 'dark' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
                '& .MuiAlert-message': { fontSize: '0.85rem' },
              }}
            >
              {error}
            </Alert>
          )}

          {/* Form Input with Clean Dedicated Label */}
          <Box sx={{ mb: 2.5 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 0.85,
              }}
            >
              <Typography
                component="label"
                htmlFor="api-key-input"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  color: 'text.primary',
                  letterSpacing: '-0.01em',
                }}
              >
                API Key
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.7rem',
                  color: 'text.secondary',
                }}
              >
                Required
              </Typography>
            </Box>

            <OutlinedInput
              id="api-key-input"
              inputRef={inputRef}
              placeholder="imgst_xxxxxxxxxxxxxxxx"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={handleKeyDown}
              type={showKey ? 'text' : 'password'}
              fullWidth
              disabled={loading}
              autoComplete="off"
              sx={{
                borderRadius: 2.25,
                backgroundColor: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(11, 17, 32, 0.75)'
                    : 'rgba(248, 250, 252, 0.85)',
                border: '1px solid',
                borderColor: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.14)'
                    : 'rgba(15, 23, 42, 0.14)',
                boxShadow: (theme) =>
                  theme.palette.mode === 'dark'
                    ? 'inset 0 1px 2px rgba(0, 0, 0, 0.4)'
                    : 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                '& .MuiOutlinedInput-notchedOutline': {
                  border: 'none',
                },
                '&:hover': {
                  borderColor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.3)'
                      : 'rgba(15, 23, 42, 0.3)',
                  backgroundColor: 'var(--color-paper-glass-strong)',
                },
                '&.Mui-focused': {
                  borderColor: 'var(--color-accent)',
                  backgroundColor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'var(--color-paper-glass-strong)'
                      : '#ffffff',
                  boxShadow:
                    '0 0 0 3px var(--color-accent-subtle), inset 0 1px 2px rgba(0, 0, 0, 0.3)',
                },
                '& .MuiInputBase-input': {
                  py: 1.2,
                  px: 1.6,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: '0.88rem',
                  letterSpacing: '0.02em',
                  color: 'text.primary',
                  outline: 'none !important',
                },
              }}
              endAdornment={
                <InputAdornment position="end" sx={{ mr: 0.5 }}>
                  <IconButton
                    onClick={() => setShowKey((prev) => !prev)}
                    edge="end"
                    size="small"
                    tabIndex={-1}
                    disabled={loading}
                    sx={{
                      color: 'text.secondary',
                      '&:hover': { color: 'text.primary' },
                    }}
                  >
                    {showKey ? (
                      <VisibilityOffIcon sx={{ fontSize: 19 }} />
                    ) : (
                      <VisibilityIcon sx={{ fontSize: 19 }} />
                    )}
                  </IconButton>
                </InputAdornment>
              }
            />

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 0.85, display: 'block', fontSize: '0.75rem' }}
            >
              Contact the administrator if you don't have a key yet.
            </Typography>
          </Box>

          <Box
            sx={{
              p: 1.75,
              borderRadius: 2,
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark'
                  ? 'rgba(255, 255, 255, 0.04)'
                  : 'rgba(0, 0, 0, 0.025)',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, mb: 0.6 }}>
              <SuccessIcon sx={{ fontSize: 16, color: 'var(--color-success)' }} />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  color: 'text.primary',
                }}
              >
                What happens when you connect
              </Typography>
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: '0.74rem', lineHeight: 1.55, display: 'block' }}
            >
              Your key authenticates uploads to ImgStore shared storage. Images
              are served globally via Cloudflare Edge CDN. No personal cloud
              account required.
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            py: 2,
            borderTop: '1px solid',
            borderColor: 'divider',
            gap: 1.25,
          }}
        >
          <Button
            onClick={() => {
              haptics.playClick();
              onClose();
            }}
            color="inherit"
            size="small"
            disabled={loading}
            sx={{
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.85rem',
              borderRadius: 1.75,
              px: 2,
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="small"
            disabled={loading || !apiKey.trim()}
            className="bevel-button"
            sx={{
              borderRadius: 1.75,
              px: 2.25,
              py: 0.75,
              fontSize: '0.85rem',
            }}
            startIcon={
              loading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <KeyIcon sx={{ fontSize: 16 }} />
              )
            }
          >
            {loading ? 'Connecting...' : 'Connect'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
