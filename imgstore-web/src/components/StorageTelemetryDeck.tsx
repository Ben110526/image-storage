import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Button,
  Skeleton,
} from '@mui/material';
import {
  Storage as StorageIcon,
  Key as KeyIcon,
} from '@mui/icons-material';
import { useHealth, useStorage } from '../hooks/useImages';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../lib/haptics';
import { ContentSurface } from './ui/ContentSurface';

/* StorageTelemetryDeck — plan §10.1: a single summary ROW, not a hero.
 * Shows real storage data only: used bytes, file count, capacity — each
 * rendered as "—" while unknown (plan §3.3: never fake quota from a page of
 * images, never default 15GB). Connection status is reported by the navbar
 * health dot; this row is purely about storage. */

function formatStorage(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes < 1024 * 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

const UNKNOWN = '—';

export const StorageTelemetryDeck: React.FC = () => {
  const { isError: healthError } = useHealth();
  const {
    data: storageData,
    isLoading: storageLoading,
    isError: storageError,
  } = useStorage();
  const { user, isAuthenticated, showApiKeyDialog } = useAuth();

  // Only real server data — no page-sum fallback, no hardcoded quota.
  const usedBytes = storageData?.used_bytes;
  const limitBytes = storageData?.limit_bytes;
  const fileCount = storageData?.total_files;
  const usedPercent =
    usedBytes != null && limitBytes != null && limitBytes > 0
      ? Math.min(100, Math.max(0, (usedBytes / limitBytes) * 100))
      : null;

  /* FIX-05 — three distinct failure modes, three distinct messages:
   *   health down      → "Không kết nối được máy chủ" (the whole API is gone)
   *   /storage failed  → "Không tải được dữ liệu dung lượng" (endpoint error)
   *   limit unknown    → "Chưa có dữ liệu" (server answered but quota unset —
   *                      NEVER presented as "unlimited"). */
  const caption = storageLoading
    ? 'Đang tải…'
    : healthError
      ? 'Không kết nối được máy chủ'
      : storageError
        ? 'Không tải được dữ liệu dung lượng'
        : `${usedBytes != null ? formatStorage(usedBytes) : UNKNOWN} đã dùng · ${
            fileCount != null ? `${fileCount} file` : UNKNOWN
          } · ${limitBytes != null ? formatStorage(limitBytes) : 'Chưa có dữ liệu giới hạn'}`;

  return (
    <ContentSurface
      sx={{
        px: { xs: 2, sm: 2.5 },
        py: { xs: 1.5, sm: 2 },
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 2, sm: 3 },
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        <StorageIcon sx={{ fontSize: 20, color: 'var(--color-accent)' }} />
        <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
          {user?.role === 'admin' ? 'Dung lượng ImgStore' : 'Dung lượng của bạn'}
        </Typography>
      </Box>

      {/* Usage numbers — "—" until the server answers. */}
      <Box sx={{ flex: 1, minWidth: 200 }}>
        {storageLoading ? (
          <Skeleton variant="rounded" height={8} sx={{ borderRadius: 4 }} />
        ) : usedPercent != null ? (
          <LinearProgress
            variant="determinate"
            value={usedPercent}
            aria-label={`Đã dùng ${Math.round(usedPercent)}% dung lượng`}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: 'var(--color-content-secondary)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                background: 'var(--color-accent)',
              },
            }}
          />
        ) : (
          <Box
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: 'var(--color-content-secondary)',
            }}
            aria-hidden
          />
        )}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 0.5,
            color: 'var(--color-text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {caption}
        </Typography>
      </Box>

      {/* Auth nudge — anonymous users get the reason + the action, not a
          silently disabled page (plan §10.1). */}
      {!isAuthenticated && (
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            haptics.playClick();
            showApiKeyDialog();
          }}
          startIcon={<KeyIcon sx={{ fontSize: 16 }} />}
          className="pressable"
          sx={{ borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap' }}
        >
          Kết nối API key
        </Button>
      )}
    </ContentSurface>
  );
};
