import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Grid,
  Chip,
  useTheme,
  Tooltip,
  Button,
} from '@mui/material';
import {
  CloudDone as CloudDoneIcon,
  Public as PublicIcon,
  CloudQueue as StorageIcon,
  Bolt as BoltIcon,
  Timer as TimerIcon,
  Sync as SyncIcon,
  Person as PersonIcon,
  LockOpen as GoogleIcon,
} from '@mui/icons-material';
import { useHealth, useImages, useStorage } from '../hooks/useImages';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../lib/haptics';

export const StorageTelemetryDeck: React.FC = () => {
  const theme = useTheme();
  const { data: health } = useHealth();
  const { data: storageData } = useStorage();
  const { data: imagesData } = useImages(1, 100);
  const { user, isAuthenticated, showApiKeyDialog } = useAuth();

  // Fallback calculation from image list
  const fallbackBytes =
    imagesData?.images?.reduce((sum, img) => sum + (img.size || 0), 0) || 0;
  const imageCount = imagesData?.pagination?.total || storageData?.total_files || 0;

  // Real or calculated storage values
  const usedBytes = storageData ? storageData.used_bytes : fallbackBytes;
  const limitBytes = storageData?.limit_bytes || 15 * 1024 * 1024 * 1024; // 15GB standard personal quota

  const formatStorage = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    if (bytes < 1024 * 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
  };

  const usedPercent = Math.max(0, (usedBytes / limitBytes) * 100);
  const isRealDrive = Boolean(storageData?.is_real_gdrive);

  return (
    <Box
      className="spatial-card"
      sx={{
        p: { xs: 2, sm: 2.5, md: 3 },
        mb: { xs: 2.5, sm: 3.5 },
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Grid container spacing={{ xs: 2.5, md: 3 }} sx={{ alignItems: 'center' }}>
        {/* Left: Cloud Storage Quota Gauge */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              mb: 1,
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StorageIcon color="primary" fontSize="small" />
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: 700,
                  letterSpacing: '-0.01em',
                  fontSize: { xs: '0.9rem', sm: '0.95rem' },
                }}
              >
                {user?.role === 'admin' ? 'ImgStore Storage Quota' : 'Your uploads · ImgStore storage'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {isAuthenticated && (
                <Chip
                  icon={<PersonIcon sx={{ fontSize: '13px !important' }} />}
                  label={user?.name || 'Client'}
                  size="small"
                  color="secondary"
                  variant="outlined"
                  sx={{
                    height: 22,
                    fontSize: '0.72rem',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
              )}
              <Tooltip
                title={
                  isRealDrive
                    ? `Live Cloud Storage Connected ${
                        storageData?.account_email ? `(${storageData.account_email})` : ''
                      }`
                    : 'Connect with your API key'
                }
              >
                <Chip
                  icon={<CloudDoneIcon sx={{ fontSize: '14px !important' }} />}
                  label={
                    isAuthenticated
                      ? 'Shared ImgStore Storage'
                      : isRealDrive
                      ? 'Live Storage Linked'
                      : 'Not connected'
                  }
                  size="small"
                  color={isRealDrive ? 'success' : 'primary'}
                  variant="outlined"
                  sx={{
                    height: 22,
                    fontSize: '0.72rem',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
              </Tooltip>
            </Box>
          </Box>

          {/* Progress Bar */}
          <Box sx={{ my: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, usedPercent)}
              sx={{
                height: 10,
                borderRadius: 5,
                backgroundColor:
                  theme.palette.mode === 'dark'
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(0,0,0,0.06)',
                border: '1px solid',
                borderColor: 'divider',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 5,
                  background: 'var(--color-accent)',
                },
              }}
            />
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: 0.5,
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontFamily: 'JetBrains Mono, monospace' }}
              color="text.secondary"
            >
              Used: <strong>{formatStorage(usedBytes)}</strong> · {imageCount}{' '}
              {imageCount === 1 ? 'image' : 'images'}
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontFamily: 'JetBrains Mono, monospace' }}
              color="text.secondary"
            >
              Capacity: <strong>{storageData?.limit_bytes ? formatStorage(limitBytes) : 'Shared storage'}</strong>
            </Typography>
          </Box>

          {!isAuthenticated && (
            <Box
              sx={{
                mt: 1.5,
                p: 1.25,
                borderRadius: 1.5,
                backgroundColor: 'var(--color-accent-subtle)',
                border: '1px dashed',
                borderColor: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
              >
                Use your assigned API key to upload to ImgStore storage. You do not need a cloud account or storage quota.
              </Typography>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  haptics.playClick();
                  showApiKeyDialog();
                }}
                startIcon={<GoogleIcon sx={{ fontSize: '14px !important' }} />}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  py: 0.25,
                  px: 1,
                  minWidth: 0,
                }}
              >
                Connect
              </Button>
            </Box>
          )}
        </Grid>

        {/* Right: Worldwide Edge Network Performance */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Box
            sx={{
              p: { xs: 1.75, sm: 2 },
              borderRadius: 2,
              backgroundColor: 'var(--color-paper-glass)',
              backdropFilter: 'var(--backdrop-blur)',
              WebkitBackdropFilter: 'var(--backdrop-blur)',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 1,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PublicIcon color="primary" fontSize="small" />
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                  color="text.secondary"
                >
                  Delivery Network
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-success)',
                    
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem' }}
                  color="success.main"
                >
                  {health?.status === 'healthy' ? 'API online' : 'Checking API'}
                </Typography>
              </Box>
            </Box>

            <Grid container spacing={1}>
              <Grid size={{ xs: 6 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block' }}
                >
                  Delivery
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.2 }}>
                  <TimerIcon sx={{ fontSize: 13, color: 'var(--color-accent)' }} />
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
                  >
                    Cloudflare CDN
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block' }}
                >
                  Cache Retention
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.2 }}>
                  <SyncIcon sx={{ fontSize: 13, color: 'var(--color-success)' }} />
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
                  >
                    5 min cache
                  </Typography>
                </Box>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  Routing
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}
                >
                  Global Anycast
                </Typography>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  Streaming
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.2 }}>
                  <BoltIcon sx={{ fontSize: 13, color: 'var(--color-success)' }} />
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontWeight: 600,
                      color: 'var(--color-success)',
                    }}
                  >
                    Direct CDN Link
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};
