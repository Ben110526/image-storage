import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Alert,
  IconButton,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Switch,
  FormControlLabel,
  Divider,
} from '@mui/material';
import {
  Close as CloseIcon,
  Restore as ResetIcon,
  Tune as SettingsIcon,
  LightMode as LightIcon,
  DarkMode as DarkIcon,
  SettingsBrightness as SystemIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import {
  getApiBaseUrl,
  getApiKey,
  saveApiConfig,
  resetApiConfig,
} from '../api/client';
import { haptics } from '../lib/haptics';
import { useAppearance, type ThemePreference } from '../context/AppearanceContext';
import { useAuth } from '../context/AuthContext';

/* SettingsModal — plan §11. Appearance preferences (theme / glass tint /
 * reduce transparency / reduce motion) are saved independently of Connection
 * (API endpoint + key): adjusting the theme never rewrites API config, and
 * saving API config never touches appearance. */

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="overline"
      component="h3"
      sx={{ color: 'var(--color-text-tertiary)', letterSpacing: '0.08em' }}
    >
      {children}
    </Typography>
  );
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const { refreshConnection } = useAuth();
  const {
    pref,
    reduceTransparency: effectiveReduceTransparency,
    setTheme,
    setGlassTint,
    setReduceTransparency,
    setReduceMotion,
  } = useAppearance();

  /* Slider disables on the EFFECTIVE flag (app OR OS — the app may never
   * override an OS reduction); the helper says which source is in play. */
  const osReduceTransparency =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-transparency: reduce)').matches;
  const tintDisabledByOS = osReduceTransparency && !pref.reduceTransparency;

  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  /* R1 — connection save is an async verify flow: keep the dialog open with
   * a pending state while the new endpoint is checked; only close on success. */
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /* R8 — tint slider: live drag preview (CSS var only); persisted value
   * commits on release. null = not dragging. */
  const [tintPreview, setTintPreview] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setApiUrl(getApiBaseUrl());
      setApiKey(getApiKey());
      setSaveError(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (saving) return;
    haptics.playClick();
    setSaving(true);
    setSaveError(null);
    saveApiConfig(apiUrl, apiKey);
    /* R1 — saving connection parameters opens a NEW connection scope and
     * RE-VERIFIES identity against the new endpoint: the previous user is
     * invalidated first, then /auth/me runs against the new endpoint. The
     * old authenticated state is never carried across the save. */
    const ok = await refreshConnection();
    setSaving(false);
    if (ok) {
      haptics.playSuccess();
      enqueueSnackbar('Connection parameters saved successfully!', { variant: 'success' });
      onClose();
    } else {
      // Verification failed — keep the draft + error visible; the app is now
      // anonymous/needs-auth, never still-authenticated-as-the-old-user.
      haptics.playDelete();
      setSaveError(
        'Đã lưu cấu hình, nhưng không xác thực được với endpoint mới — kết nối hiện tại đã chuyển sang chưa đăng nhập. Kiểm tra URL/credential hoặc dùng "Connect with API key".',
      );
    }
  };

  const handleReset = async () => {
    /* C2 — reset runs the SAME verification flow as save, so it must hold the
     * pending flag for its own duration: without it, a slow /auth/me after
     * Reset left Save/Reset/X clickable while the app was mid-verification. */
    if (saving) return;
    haptics.playClick();
    setSaving(true);
    setSaveError(null);
    resetApiConfig();
    setApiUrl(import.meta.env.VITE_API_URL || 'http://localhost:8787');
    setApiKey('');
    await refreshConnection();
    setSaving(false);
    enqueueSnackbar('Settings reset to build defaults', { variant: 'info' });
  };

  const handleThemeChange = (_: unknown, value: ThemePreference | null) => {
    if (value) {
      haptics.playTick();
      setTheme(value);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={(_e, reason) => {
        // R1 — a pending connection verification blocks backdrop/Escape just
        // like a destructive confirm: closing mid-flight would hide the
        // success/error outcome of the save.
        if (saving && (reason === 'escapeKeyDown' || reason === 'backdropClick')) return;
        if (!saving) onClose();
      }}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            overflow: 'hidden',
            /* R5 — adaptive: full-width sheet anchored to the bottom on phones
             * (a 320px dialog previously shrank to a 248px-wide desktop box
             * with a wrapping footer); centered dialog from 600px up. */
            m: { xs: 0, sm: 2 },
            width: { xs: '100%', sm: undefined },
            maxWidth: { xs: '100%', sm: undefined },
            maxHeight: { xs: 'calc(100dvh - 48px)', sm: 'calc(100dvh - 64px)' },
            alignSelf: { xs: 'flex-end', sm: 'center' },
            borderRadius: { xs: 'var(--radius-dialog) var(--radius-dialog) 0 0', sm: 'var(--radius-dialog)' },
            pb: { xs: 'env(safe-area-inset-bottom)', sm: 0 },
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <SettingsIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Cài đặt
          </Typography>
        </Box>
        <IconButton
          aria-label="Đóng cài đặt"
          onClick={() => {
            // C2 — the X button is a close path too: while a connection
            // verification is in flight it must not silently dismiss the
            // dialog (the save outcome would be hidden and the callback would
            // continue against a closed modal).
            if (saving) return;
            haptics.playClick();
            onClose();
          }}
          disabled={saving}
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {/* ── Appearance ─────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* R8 — appearance applies and saves instantly; Save below only
           * concerns the Connection section. Say so, since Cancel also just
           * closes the dialog. */}
          <Typography variant="caption" sx={{ color: 'var(--color-text-tertiary)' }}>
            Giao diện tự lưu ngay khi thay đổi — nút Save bên dưới chỉ áp dụng cho phần Kết nối.
          </Typography>
          <Box>
            <SectionLabel>Giao diện</SectionLabel>
            <ToggleButtonGroup
              value={pref.theme}
              exclusive
              onChange={handleThemeChange}
              aria-label="Chế độ giao diện"
              size="small"
              fullWidth
              sx={{ mt: 1 }}
            >
              <ToggleButton value="light" aria-label="Sáng">
                <LightIcon sx={{ mr: 0.75, fontSize: 18 }} /> Sáng
              </ToggleButton>
              <ToggleButton value="dark" aria-label="Tối">
                <DarkIcon sx={{ mr: 0.75, fontSize: 18 }} /> Tối
              </ToggleButton>
              <ToggleButton value="system" aria-label="Theo hệ thống">
                <SystemIcon sx={{ mr: 0.75, fontSize: 18 }} /> Hệ thống
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <SectionLabel>Độ phủ màu kính</SectionLabel>
            <Box sx={{ px: 0.5, mt: 1 }}>
              <Slider
                value={tintPreview ?? pref.glassTint}
                onChange={(_, v) => {
                  /* R8 — drag updates the CSS var only (live preview, no
                   * localStorage write per tick); persistence happens once on
                   * release via onChangeCommitted. */
                  const tint = v as number;
                  setTintPreview(tint);
                  document.documentElement.style.setProperty('--glass-tint', (tint / 100).toFixed(3));
                }}
                onChangeCommitted={(_, v) => {
                  setTintPreview(null);
                  setGlassTint(v as number);
                }}
                min={0}
                max={100}
                step={5}
                disabled={effectiveReduceTransparency}
                aria-label="Độ phủ màu kính"
                aria-valuetext={`${pref.glassTint} trên 100`}
                marks={[
                  { value: 0, label: 'Trong hơn' },
                  { value: 100, label: 'Đậm hơn' },
                ]}
                sx={{
                  /* FIX-08 — the edge marks are centered on 0%/100% and would
                   * overflow the rail by half their width; pull them inside so
                   * the dialog never grows a horizontal scrollbar. */
                  '& .MuiSlider-markLabel': {
                    fontSize: '0.7rem',
                    whiteSpace: 'nowrap',
                  },
                  '& .MuiSlider-markLabel[data-index="0"]': {
                    left: '0 !important',
                    transform: 'none',
                  },
                  '& .MuiSlider-markLabel[data-index="1"]': {
                    left: '100% !important',
                    transform: 'translateX(-100%)',
                  },
                }}
              />
              {effectiveReduceTransparency && (
                <Typography variant="caption" sx={{ color: 'var(--color-text-tertiary)' }}>
                  {tintDisabledByOS
                    ? 'Hệ điều hành đang bật Giảm độ trong suốt — bề mặt dùng màu đặc, không thể đổi từ ứng dụng.'
                    : 'Slider bị vô hiệu vì Giảm độ trong suốt đang bật — bề mặt dùng màu đặc.'}
                </Typography>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={pref.reduceTransparency}
                  onChange={(e) => setReduceTransparency(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Giảm độ trong suốt
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--color-text-tertiary)' }}>
                    Bề mặt kính chuyển sang màu đặc, tắt hiệu ứng khúc xạ.
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={pref.reduceMotion}
                  onChange={(e) => setReduceMotion(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Giảm chuyển động
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'var(--color-text-tertiary)' }}>
                    Tắt hiệu ứng scale, slide và ánh sáng theo con trỏ.
                  </Typography>
                </Box>
              }
            />
          </Box>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* ── Connection ─────────────────────────────────────────────── */}
        <SectionLabel>Kết nối</SectionLabel>
        {saveError && (
          <Alert severity="warning" sx={{ my: 2, borderRadius: 2 }} onClose={() => setSaveError(null)}>
            {saveError}
          </Alert>
        )}
        <Alert severity="info" sx={{ my: 2, borderRadius: 2 }}>
          Configure the API endpoint for this browser. The Worker URL points to your deployed Cloudflare Worker. The optional API key field is for direct REST access without session login.
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            label="Worker API Base URL"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            helperText="Local dev (http://localhost:8787) or production (https://imgapi.<subdomain>.workers.dev)"
            fullWidth
            size="small"
            slotProps={{
              input: {
                /* FIX-08 — ≥16px on mobile so iOS does not auto-zoom on focus. */
                sx: {
                  fontFamily: 'var(--font-mono)',
                  fontSize: { xs: '1rem', sm: '0.85rem' },
                },
              },
            }}
          />

          <TextField
            label="Personal API Key (optional)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            helperText="Optional API access for this browser. Use Connect with API key for the full dashboard."
            type="password"
            fullWidth
            size="small"
            slotProps={{
              input: {
                sx: {
                  fontFamily: 'var(--font-mono)',
                  fontSize: { xs: '1rem', sm: '0.85rem' },
                },
              },
            }}
          />
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* ── Privacy ────────────────────────────────────────────────── */}
        <Box sx={{ textAlign: 'center' }}>
          <a
            href="/privacy.html"
            style={{
              color: 'var(--color-link)',
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-body)',
              textDecoration: 'none',
            }}
          >
            Privacy &amp; image sharing
          </a>
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          justifyContent: 'space-between',
          borderTop: '1px solid',
          borderColor: 'divider',
          /* FIX-08 — at 320px the footer wraps instead of crushing the
           * primary action into an unreadable sliver. */
          flexWrap: 'wrap',
          gap: 1,
          '& > *': { minWidth: 0 },
        }}
      >
        <Button
          startIcon={<ResetIcon />}
          onClick={handleReset}
          color="inherit"
          size="small"
          disabled={saving}
          sx={{ textTransform: 'none' }}
        >
          Reset Defaults
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            onClick={() => {
              haptics.playClick();
              onClose();
            }}
            color="inherit"
            size="small"
            disabled={saving}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            color="primary"
            size="small"
            className="pressable"
            disabled={saving}
          >
            {saving ? 'Đang xác minh…' : 'Save Parameters'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};
