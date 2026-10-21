import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  OutlinedInput,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  SyncAlt as ConvertIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import type { ConvertTarget, FolderMetadata, ImageMetadata } from '../types';
import { fetchFolders, getApiBaseUrl, type ConvertImageRequest } from '../api/client';
import { useConversionCapabilities } from '../hooks/useImages';
import { useAuth } from '../context/AuthContext';
import {
  capabilityFor,
  conversionErrorVi,
  errorCodeOf,
  errorMessageOf,
  outputNameFor,
  supportsQuality,
} from '../lib/conversion';
import { haptics } from '../lib/haptics';
import { useGlassPane } from '../design/optics/useGlassPane';
import { UploadFolderPicker } from './UploadFolderPicker';

/* ConvertDialog — per-file conversion (plan §4).
 *
 * Copy tone: the result is explicitly a NEW file that consumes quota; the
 * source is never touched. Warnings attached to a target (first-sheet-only
 * CSV, animated GIF losing frames) are rendered next to the choice, because a
 * silent downgrade is worse than a refused conversion. */

interface ConvertDialogProps {
  image: ImageMetadata | null;
  open: boolean;
  pending: boolean;
  error: unknown;
  onClose: () => void;
  onConvert: (request: ConvertImageRequest) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ConvertDialog: React.FC<ConvertDialogProps> = ({
  image,
  open,
  pending,
  error,
  onClose,
  onConvert,
}) => {
  const { scope } = useAuth();
  const { data: capabilities } = useConversionCapabilities();
  const capability = image ? capabilityFor(image, capabilities) : undefined;

  /* Same cache key as UploadFolderPicker/LibraryPage, so the destination tree
   * is one request shared by every surface in this connection scope. */
  const folderScope = JSON.stringify([getApiBaseUrl(), scope.identity]);
  const { data: folderTree } = useQuery({
    queryKey: ['folders', folderScope],
    queryFn: fetchFolders,
    enabled: open,
    retry: 1,
  });

  const [format, setFormat] = useState('');
  const [name, setName] = useState('');
  const [quality, setQuality] = useState(82);
  // Only an explicit pick is state; the default is derived below, so a folder
  // list that resolves after the dialog opened still becomes the default.
  const [folderChoice, setFolderChoice] = useState<FolderMetadata | undefined>(undefined);
  // Once the user edits the name by hand, changing the format must not
  // overwrite their choice (same rule as UploadFolderPicker's manual pick).
  const nameTouched = useRef(false);

  const titleRef = useGlassPane<HTMLDivElement>(
    'convert-dialog-titlebar',
    'pill',
    null, // Dialog/sheet scope: native backdrop, never app wallpaper.
    { trackMotion: true },
  );

  // Reset per opening so a previous attempt never leaks into the next file.
  useEffect(() => {
    if (!open || !image || !capability) return;
    const first = capability.targets[0];
    setFormat(first.format);
    setName(outputNameFor(image.name, first.extension));
    setQuality(82);
    setFolderChoice(undefined);
    nameTouched.current = false;
  }, [open, image?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Destination defaults to the folder the source lives in — the converted
   * file belongs beside its original unless the user says otherwise. Falls
   * back to the picker's own "uploads/YYYY-MM" default when the source folder
   * is unknown or has since been deleted. */
  const sourceFolder = image?.folder_id
    ? folderTree?.folders.find(candidate => candidate.id === image.folder_id)
    : undefined;
  const folder = folderChoice ?? sourceFolder;

  // Keep the extension honest when the format changes, unless the user typed.
  const handleFormatChange = (next: ConvertTarget) => {
    haptics.playTick();
    setFormat(next.format);
    if (!nameTouched.current && image) setName(outputNameFor(image.name, next.extension));
  };

  const target = capability?.targets.find(candidate => candidate.format === format);
  const qualityApplies = target ? supportsQuality(target) : false;

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!target || pending) return;
    haptics.playClick();
    onConvert({
      format: target.format,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(folder?.id ? { folder_id: folder.id } : {}),
      ...(qualityApplies ? { quality } : {}),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-label="Chuyển đổi định dạng"
      slotProps={{
        paper: {
          sx: {
            maxWidth: 520,
            overflow: 'hidden',
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Box
            aria-hidden
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-accent)',
              color: 'var(--color-accent)',
            }}
          >
            <ConvertIcon sx={{ fontSize: 20 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: 600, fontSize: '1.05rem', lineHeight: 1.2, color: 'var(--color-text-primary)' }}
            >
              Chuyển đổi định dạng
            </Typography>
            <Typography
              variant="caption"
              noWrap
              title={image?.name}
              sx={{ display: 'block', color: 'var(--color-text-tertiary)' }}
            >
              {image ? `${image.name} · ${formatBytes(image.size)}` : 'Đang tải…'}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} disabled={pending} size="small" aria-label="Đóng">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ p: 3, pb: 2 }}>
          {!capability && (
            <Alert severity="warning" sx={{ borderRadius: 'var(--radius-md)' }}>
              Định dạng này chưa hỗ trợ chuyển đổi trên máy chủ hiện tại.
            </Alert>
          )}

          {error ? (
            <Alert
              severity="error"
              sx={{
                mb: 2.5,
                borderRadius: 'var(--radius-md)',
                '& .MuiAlert-message': { fontSize: '0.85rem' },
              }}
            >
              {conversionErrorVi(errorCodeOf(error), errorMessageOf(error))}
            </Alert>
          ) : null}

          {capability && (
            <>
              <Box sx={{ mb: 2.5 }}>
                <Typography
                  component="label"
                  id="convert-format-label"
                  sx={{ display: 'block', mb: 1, fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}
                >
                  Định dạng đầu ra
                </Typography>
                {/* The matrix tops out at four targets (GIF), so the pills
                 * always fit — a Select would add a second click for nothing. */}
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={format}
                  onChange={(_, next: string | null) => {
                    const chosen = capability.targets.find(candidate => candidate.format === next);
                    if (chosen) handleFormatChange(chosen);
                  }}
                  aria-labelledby="convert-format-label"
                  sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { borderRadius: 'var(--radius-full) !important', px: 2, py: 0.5, textTransform: 'none' } }}
                >
                  {capability.targets.map(candidate => (
                    <ToggleButton key={candidate.format} value={candidate.format} disabled={pending} className="pressable">
                      {candidate.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>

                {/* A lossy or partial conversion must say so before it runs. */}
                {target?.warning && (
                  <Alert
                    severity="warning"
                    sx={{ mt: 1.5, borderRadius: 'var(--radius-md)', '& .MuiAlert-message': { fontSize: '0.8rem' } }}
                  >
                    {target.warning}
                  </Alert>
                )}
              </Box>

              <Box sx={{ mb: 2.5 }}>
                <Typography
                  component="label"
                  htmlFor="convert-name-input"
                  sx={{ display: 'block', mb: 0.85, fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}
                >
                  Tên file kết quả
                </Typography>
                <OutlinedInput
                  id="convert-name-input"
                  placeholder={target ? outputNameFor(image?.name || 'file', target.extension) : ''}
                  value={name}
                  onChange={(event) => {
                    nameTouched.current = true;
                    setName(event.target.value);
                  }}
                  fullWidth
                  disabled={pending}
                  autoComplete="off"
                  sx={{ fontSize: '0.9rem' }}
                />
              </Box>

              {qualityApplies && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    component="label"
                    id="convert-quality-label"
                    sx={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}
                  >
                    Chất lượng: {quality}
                  </Typography>
                  <Slider
                    size="small"
                    min={40}
                    max={100}
                    step={1}
                    value={quality}
                    disabled={pending}
                    onChange={(_, value) => setQuality(value as number)}
                    aria-labelledby="convert-quality-label"
                    valueLabelDisplay="auto"
                  />
                  <Typography variant="caption" sx={{ color: 'var(--color-text-tertiary)', fontSize: '0.72rem' }}>
                    Thấp hơn cho tệp nhẹ hơn; 82 là mức cân bằng.
                  </Typography>
                </Box>
              )}

              {/* Destination — the source folder by default, via the same
                  picker the upload page uses so both agree on the tree. */}
              <UploadFolderPicker
                /* Remount per opening so a folder chosen for the previous
                 * file never leaks into this one. */
                key={`convert-${folderScope}-${image?.id ?? ''}-${open}`}
                scope={folderScope}
                value={folder}
                onChange={setFolderChoice}
              />

              <Typography
                variant="caption"
                sx={{ display: 'block', mt: 0.5, fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}
              >
                File mới được lưu vào thư viện và tính vào dung lượng. File gốc không thay đổi.
              </Typography>
            </>
          )}

          {pending && (
            <Box sx={{ mt: 2.5 }} role="status" aria-live="polite">
              <LinearProgress />
              <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'var(--color-text-secondary)' }}>
                Đang chuyển đổi… có thể mất vài giây.
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--color-border)', gap: 1.25 }}>
          <Button
            onClick={() => {
              haptics.playClick();
              onClose();
            }}
            color="inherit"
            size="small"
            disabled={pending}
            sx={{ textTransform: 'none', borderRadius: 'var(--radius-full)', px: 2 }}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="small"
            disabled={pending || !target || !name.trim()}
            className="pressable"
            sx={{ borderRadius: 'var(--radius-full)', px: 2.25, py: 0.75, fontSize: '0.85rem' }}
            startIcon={<ConvertIcon sx={{ fontSize: 16 }} />}
          >
            {pending ? 'Đang chuyển đổi…' : 'Chuyển đổi'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
