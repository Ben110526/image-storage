import React, { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Alert,
  Box,
  Button,
  IconButton,
  LinearProgress,
  OutlinedInput,
  Slider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  Error as ErrorIcon,
  SyncAlt as ConvertIcon,
} from '@mui/icons-material';
import { haptics } from '../lib/haptics';
import { formatBytes } from '../context/UploadQueueContext';
import { getAppScene } from '../design/optics/GlassScene';
import { useGlassPane } from '../design/optics/useGlassPane';
import {
  capabilityFor,
  conversionErrorVi,
  outputNameFor,
  supportsQuality,
} from '../lib/conversion';
import type {
  ConversionCapabilitiesResponse,
  ConversionCapability,
  ConvertTarget,
} from '../types';

/* QuickDropZone — drop → pick a target → convert → download. Four explicit
 * states (empty/chosen/pending/done) plus an inline error, because a quick
 * conversion leaves no trace anywhere else: the file must be recoverable from
 * this card alone. Nothing here touches the upload queue — that pipeline owns
 * quota, folders and library records, none of which apply to a throwaway
 * conversion. */

type QuickPhase =
  | { kind: 'empty' }
  | { kind: 'chosen'; file: File; capability: ConversionCapability; format: string; name: string; quality: number }
  | { kind: 'pending'; file: File; capability: ConversionCapability; format: string; name: string; quality: number }
  | { kind: 'done'; file: File; result: { blob: Blob; filename: string } }
  | { kind: 'error'; file: File; message: string; capability?: ConversionCapability };

export interface QuickDropZoneProps {
  capabilities: ConversionCapabilitiesResponse | undefined;
  /** Converts, or rejects — the rejection's code is mapped to Vietnamese here. */
  onConvert: (request: {
    file: File;
    format: string;
    name: string;
    quality?: number;
  }) => Promise<{ blob: Blob; filename: string }>;
}

/** Capability labels already carry the extension ("Word (.docx)"), so the
 * source description is the label itself — appending it again read as
 * "Word (.docx) (.docx)". */
function describeSource(capability: ConversionCapability): string {
  return capability.label;
}

/** Revoke after the browser has had time to start the download. */
const OBJECT_URL_TTL_MS = 60_000;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari reads the blob asynchronously after click(); 60 s is far past that.
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_TTL_MS);
}

export const QuickDropZone: React.FC<QuickDropZoneProps> = ({ capabilities, onConvert }) => {
  const [phase, setPhase] = useState<QuickPhase>({ kind: 'empty' });
  const pending = phase.kind === 'pending';
  // Only an explicit edit counts, so switching format keeps the derived name.
  const nameTouched = useRef(false);
  const active = phase.kind === 'chosen' || phase.kind === 'pending' ? phase : undefined;
  // Everything below renders from a phase that HAS a file: the card only
  // appears once one was chosen, so `empty` is excluded once and for all.
  const shown = phase.kind === 'empty' ? undefined : phase;
  const capability = active?.capability ?? (phase.kind === 'error' ? phase.capability : undefined);
  const target = capability?.targets.find(candidate => candidate.format === active?.format);

  /* Accept comes from the capability matrix, never a hard-coded list: a source
   * the server cannot convert must not be selectable in the first place. */
  const accept = capabilities
    ? Object.fromEntries(capabilities.sources.map(source => [source.source_mime, ['.' + source.source_extension]]))
    : undefined;

  const handleFile = useCallback((file: File) => {
    haptics.playClick();
    nameTouched.current = false;
    const capability = capabilityFor({ mime_type: file.type || '' }, capabilities);
    if (!capability) {
      setPhase({
        kind: 'error',
        file,
        message: capabilities
          ? `Chưa hỗ trợ chuyển đổi định dạng .${file.name.split('.').pop() || '?'} trên máy chủ này.`
          : 'Chưa tải được danh sách định dạng hỗ trợ. Hãy thử lại sau.',
      });
      return;
    }
    const first = capability.targets[0];
    setPhase({
      kind: 'chosen',
      file,
      capability,
      format: first.format,
      name: outputNameFor(file.name, first.extension),
      quality: 82,
    });
  }, [capabilities]);

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
    onDrop,
    accept,
    multiple: false,
    noPaste: true,
    // The page still has to explain *why* a dropped file was refused.
    onDropRejected: (rejections) => {
      const file = rejections[0]?.file;
      if (!file) return;
      setPhase({
        kind: 'error',
        file,
        message: `Chưa hỗ trợ chuyển đổi định dạng .${file.name.split('.').pop() || '?'} trên máy chủ này.`,
      });
    },
    disabled: pending,
  });

  const handleFormat = (next: ConvertTarget) => {
    haptics.playTick();
    if (!active) return;
    setPhase({
      ...active,
      format: next.format,
      name: nameTouched.current ? active.name : outputNameFor(active.file.name, next.extension),
    });
  };

  const handleSubmit = async () => {
    if (!active || pending) return;
    haptics.playClick();
    const request = {
      file: active.file,
      format: active.format,
      name: active.name.trim() || outputNameFor(active.file.name, target?.extension ?? active.format),
      ...(target && supportsQuality(target) ? { quality: active.quality } : {}),
    };
    setPhase({ ...active, kind: 'pending' });
    try {
      const result = await onConvert(request);
      downloadBlob(result.blob, result.filename);
      haptics.playTick();
      setPhase({ kind: 'done', file: active.file, result });
    } catch (error) {
      // A 413 from the bodyLimit middleware answers in plain text, so it has no
      // error code: recognise it by status instead of showing a generic message.
      const status = (error as { response?: { status?: number } })?.response?.status;
      const code = (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      const message = status === 413 && !code
        ? 'Tệp quá lớn để chuyển đổi nhanh (giới hạn 25 MB cho tài liệu, 20 MB cho ảnh).'
        : conversionErrorVi(code);
      setPhase({ kind: 'error', file: active.file, message, capability: active.capability });
    }
  };

  const reset = (toPicker = false) => {
    haptics.playClick();
    setPhase({ kind: 'empty' });
    if (toPicker) window.setTimeout(openFileDialog, 0);
  };

  const zoneRef = useGlassPane<HTMLDivElement>('quick-convert-zone', 'panel', isDragActive ? null : getAppScene());

  return (
    <Box>
      <Box
        {...getRootProps()}
        ref={zoneRef}
        role="button"
        tabIndex={0}
        aria-label="Kéo thả file cần chuyển đổi, hoặc bấm để chọn"
        className="pressable glass-regular"
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          minHeight: 220,
          p: { xs: 2.5, sm: 4 },
          borderRadius: 'var(--radius-lg)',
          textAlign: 'center',
          cursor: pending ? 'progress' : 'pointer',
          borderStyle: isDragActive ? 'dashed !important' : 'solid !important',
          borderWidth: '1px !important',
          borderColor: isDragActive ? 'var(--color-accent) !important' : 'var(--glass-border) !important',
          backgroundColor: isDragActive ? 'var(--color-accent-soft) !important' : undefined,
          transition: 'border-color var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard)',
        }}
      >
        <input {...getInputProps()} />

        <Box
          aria-hidden
          sx={{
            display: 'inline-flex',
            p: 1.5,
            borderRadius: '50%',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-accent)',
          }}
        >
          <ConvertIcon sx={{ fontSize: 28 }} />
        </Box>

        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {isDragActive ? 'Thả file vào đây' : phase.kind === 'empty' ? 'Kéo thả file để chuyển đổi' : 'Đổi file khác'}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'var(--color-text-secondary)' }}>
            {phase.kind === 'empty'
              ? 'hoặc bấm để chọn — kết quả tải về ngay, không lưu vào thư viện'
              : 'Kéo thả hoặc bấm để chọn tệp khác'}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--color-text-tertiary)' }}>
            {capabilities
              ? capabilities.sources.map(source => source.source_extension).join(' · ')
              : 'docx · xlsx · pptx · pdf · png · jpeg · webp · gif'}
          </Typography>
        </Box>
      </Box>

      {shown && (
        <Box className="content-surface" sx={{ mt: 2, p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="body2"
                noWrap
                title={shown.kind === 'done' ? shown.result.filename : shown.file.name}
                sx={{ fontWeight: 600, color: 'var(--color-text-primary)' }}
              >
                {shown.kind === 'done' ? shown.result.filename : shown.file.name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--color-text-tertiary)' }}>
                {shown.kind === 'done'
                  ? `${formatBytes(shown.result.blob.size)} · đã tải về máy`
                  : shown.kind === 'error'
                    ? `Lỗi · ${formatBytes(shown.file.size)}`
                    : capability
                      ? `${formatBytes(shown.file.size)} · ${describeSource(capability)}`
                      : formatBytes(shown.file.size)}
              </Typography>
            </Box>
            <IconButton
              size="small"
              aria-label="Bỏ tệp"
              onClick={() => reset()}
              disabled={pending}
              sx={{ mt: -0.5 }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {active && capability && (
            <>
              <Typography
                component="div"
                id="quick-convert-format-label"
                sx={{ display: 'block', mt: 2, mb: 1, fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}
              >
                Định dạng đầu ra
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={active.format}
                onChange={(_, next: string | null) => {
                  const chosen = capability.targets.find(candidate => candidate.format === next);
                  if (chosen) handleFormat(chosen);
                }}
                aria-labelledby="quick-convert-format-label"
                sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { borderRadius: 'var(--radius-full) !important', px: 2, py: 0.5, textTransform: 'none' } }}
              >
                {capability.targets.map(candidate => (
                  <ToggleButton key={candidate.format} value={candidate.format} disabled={pending} className="pressable">
                    {candidate.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              {target?.warning && (
                <Alert
                  severity="warning"
                  sx={{ mt: 1.5, borderRadius: 'var(--radius-md)', '& .MuiAlert-message': { fontSize: '0.8rem' } }}
                >
                  {target.warning}
                </Alert>
              )}

              <Typography
                component="label"
                htmlFor="quick-convert-name"
                sx={{ display: 'block', mt: 2, mb: 0.85, fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}
              >
                Tên file kết quả
              </Typography>
              <OutlinedInput
                id="quick-convert-name"
                value={active.name}
                onChange={(event) => {
                  nameTouched.current = true;
                  setPhase({ ...active, name: event.target.value });
                }}
                fullWidth
                disabled={pending}
                autoComplete="off"
                sx={{ fontSize: '0.9rem' }}
              />

              {target && supportsQuality(target) && (
                <Box sx={{ mt: 2 }}>
                  <Typography
                    component="div"
                    id="quick-convert-quality-label"
                    sx={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}
                  >
                    Chất lượng: {active.quality}
                  </Typography>
                  <Slider
                    size="small"
                    min={40}
                    max={100}
                    step={1}
                    value={active.quality}
                    disabled={pending}
                    onChange={(_, value) => setPhase({ ...active, quality: value as number })}
                    aria-labelledby="quick-convert-quality-label"
                    valueLabelDisplay="auto"
                  />
                </Box>
              )}

              {pending && (
                <Box sx={{ mt: 2 }} role="status" aria-live="polite">
                  <LinearProgress />
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'var(--color-text-secondary)' }}>
                    Đang chuyển đổi… tài liệu có thể mất vài giây.
                  </Typography>
                </Box>
              )}

              <Typography
                variant="caption"
                sx={{ display: 'block', mt: 1.5, fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}
              >
                Kết quả tải thẳng về máy — không tạo file trong thư viện, không tính dung lượng.
              </Typography>
            </>
          )}

          {phase.kind === 'error' && (
            <Alert
              severity="error"
              sx={{ mt: 1.5, borderRadius: 'var(--radius-md)', '& .MuiAlert-message': { fontSize: '0.85rem' } }}
            >
              {phase.message}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1.25, mt: 2, flexWrap: 'wrap' }}>
            {phase.kind === 'done' && (
              <Button
                variant="contained"
                size="small"
                className="pressable"
                startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                onClick={() => downloadBlob(phase.result.blob, phase.result.filename)}
                sx={{ borderRadius: 'var(--radius-full)', px: 2 }}
              >
                Tải lại
              </Button>
            )}

            {active && !pending && (
              <Button
                variant="contained"
                size="small"
                className="pressable"
                startIcon={<ConvertIcon sx={{ fontSize: 16 }} />}
                onClick={handleSubmit}
                disabled={!target || !active.name.trim()}
                sx={{ borderRadius: 'var(--radius-full)', px: 2 }}
              >
                Chuyển đổi
              </Button>
            )}

            {phase.kind === 'error' && phase.capability && (
              <Button
                variant="contained"
                size="small"
                className="pressable"
                startIcon={<ErrorIcon sx={{ fontSize: 16 }} />}
                onClick={() => {
                  haptics.playClick();
                  const first = phase.capability!.targets[0];
                  setPhase({
                    kind: 'chosen',
                    file: phase.file,
                    capability: phase.capability!,
                    format: first.format,
                    name: outputNameFor(phase.file.name, first.extension),
                    quality: 82,
                  });
                  nameTouched.current = false;
                }}
                sx={{ borderRadius: 'var(--radius-full)', px: 2 }}
              >
                Thử lại
              </Button>
            )}

            <Button
              size="small"
              color="inherit"
              className="pressable"
              onClick={() => reset(true)}
              disabled={pending}
              startIcon={phase.kind === 'done' ? <SuccessIcon sx={{ fontSize: 16 }} /> : undefined}
              sx={{ borderRadius: 'var(--radius-full)', px: 2, textTransform: 'none' }}
            >
              {phase.kind === 'done' ? 'Chuyển file khác' : 'Chọn file khác'}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};
