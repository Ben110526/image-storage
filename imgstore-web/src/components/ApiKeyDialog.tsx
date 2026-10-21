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
import { useGlassPane } from '../design/optics/useGlassPane';

/* ApiKeyDialog — plan §11.1: G2 elevated chrome, C0 input field, Vietnamese
 * copy, honest description of what connecting does. Focus moves to the input
 * on open; Escape/backdrop close is disabled while a connect is in flight. */

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

  /* Native title material belongs to the dialog; the form stays opaque. */
  const titleRef = useGlassPane<HTMLDivElement>(
    'apikey-dialog-titlebar',
    'pill',
    null, // Dialog/sheet scope: native backdrop, never app wallpaper.
    { trackMotion: true },
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setApiKey('');
      setShowKey(false);
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

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-label="Kết nối API key"
      slotProps={{
        paper: {
          sx: {
            maxWidth: 480,
            overflow: 'hidden',
            /* R5 — adaptive: bottom-anchored full-width sheet on phones. */
            m: { xs: 0, sm: 2 },
            width: { xs: '100%', sm: undefined },
            alignSelf: { xs: 'flex-end', sm: 'center' },
            borderRadius: { xs: 'var(--radius-dialog) var(--radius-dialog) 0 0', sm: 'var(--radius-dialog)' },
            pb: { xs: 'env(safe-area-inset-bottom)', sm: 0 },
          },
        },
      }}
    >
      <DialogTitle
        ref={titleRef}
        component="div"
        className="glass-elevated"
        sx={{
          m: 0,
          px: 2.5,
          py: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--color-border)',
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
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-accent)',
              color: 'var(--color-accent)',
            }}
          >
            <KeyIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box>
            <Typography
              variant="h6"
              sx={{ fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.2, color: 'var(--color-text-primary)' }}
            >
              Kết nối ImgStore
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--color-text-tertiary)' }}>
              Xác thực bằng API key
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} disabled={loading} size="small" aria-label="Đóng">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ p: 3, pb: 2 }}>
          <Typography
            variant="body2"
            sx={{ mb: 2.5, lineHeight: 1.6, color: 'var(--color-text-secondary)' }}
          >
            Nhập API key để kết nối. File tải lên được lưu trong kho ImgStore
            dùng chung và phục vụ qua Cloudflare CDN.
          </Typography>

          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 2.5,
                borderRadius: 'var(--radius-md)',
                '& .MuiAlert-message': { fontSize: '0.85rem' },
              }}
            >
              {error}
            </Alert>
          )}

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
                  color: 'var(--color-text-primary)',
                }}
              >
                API Key
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}
              >
                Bắt buộc
              </Typography>
            </Box>

            <OutlinedInput
              id="api-key-input"
              inputRef={inputRef}
              placeholder="imgst_xxxxxxxxxxxxxxxx"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              type={showKey ? 'text' : 'password'}
              fullWidth
              disabled={loading}
              autoComplete="off"
              endAdornment={
                <InputAdornment position="end" sx={{ mr: 0.5 }}>
                  <IconButton
                    onClick={() => setShowKey((prev) => !prev)}
                    edge="end"
                    size="small"
                    tabIndex={-1}
                    disabled={loading}
                    aria-label={showKey ? 'Ẩn API key' : 'Hiện API key'}
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
              sx={{ mt: 0.85, display: 'block', fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}
            >
              Liên hệ quản trị viên nếu bạn chưa có key.
            </Typography>
          </Box>

          <Box
            sx={{
              p: 1.75,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-content-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, mb: 0.6 }}>
              <SuccessIcon sx={{ fontSize: 16, color: 'var(--color-success)' }} />
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text-primary)' }}
              >
                Sau khi kết nối
              </Typography>
            </Box>
            <Typography
              variant="caption"
              sx={{ fontSize: '0.74rem', lineHeight: 1.55, display: 'block', color: 'var(--color-text-secondary)' }}
            >
              Key xác thực quyền tải file lên kho dùng chung. File được phục vụ
              toàn cầu qua Cloudflare CDN — không cần tài khoản cloud cá nhân.
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions
          sx={{
            px: 3,
            py: 2,
            borderTop: '1px solid var(--color-border)',
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
            sx={{ textTransform: 'none', borderRadius: 'var(--radius-full)', px: 2 }}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="small"
            disabled={loading || !apiKey.trim()}
            className="pressable"
            sx={{ borderRadius: 'var(--radius-full)', px: 2.25, py: 0.75, fontSize: '0.85rem' }}
            startIcon={
              loading ? <CircularProgress size={16} color="inherit" /> : <KeyIcon sx={{ fontSize: 16 }} />
            }
          >
            {loading ? 'Đang kết nối…' : 'Kết nối'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
