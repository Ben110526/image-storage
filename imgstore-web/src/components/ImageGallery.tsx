import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Grid,
  Skeleton,
  Pagination,
  Button,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon,
  CloudUpload as UploadIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useImages, useDeleteImage } from '../hooks/useImages';
import { useAuth } from '../context/AuthContext';
import { ImageCard } from './ImageCard';
import { ConfirmDialog } from './ConfirmDialog';
import { ImagePreviewModal } from './ImagePreviewModal';
import { DataState } from './ui/DataState';
import type { ImageMetadata } from '../types';
import { haptics } from '../lib/haptics';

/* ImageGallery — plan §10.2: toolbar (search/clear/refresh) over a C0 grid.
 * Render states are strictly separated (plan §3.3 P0): needs-auth ≠ empty,
 * fetch error ≠ empty, no-results ≠ empty. Background refresh keeps the
 * previous grid on screen; only the first load shows skeletons. */

interface ImageGalleryProps {
  /** When set, only images in this folder are listed. */
  folderId?: string;
  /** Label of the current folder view, shown next to the title. */
  folderLabel?: string;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ folderId, folderLabel }) => {
  const { enqueueSnackbar } = useSnackbar();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated, isLoading: authLoading, showApiKeyDialog } = useAuth();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const [previewImage, setPreviewImage] = useState<ImageMetadata | null>(null);
  const [imageToDelete, setImageToDelete] = useState<ImageMetadata | null>(null);

  const limit = 12;
  const { data, isLoading, isFetching, isError, error, refetch } = useImages(
    page,
    limit,
    activeSearch,
    folderId
  );
  const deleteMutation = useDeleteImage();

  /* FIX-06 — '/' quick-focus skips every editable element (input, textarea,
   * select, contenteditable), any modifier chord, and any open dialog/sheet
   * so the shortcut never steals focus out of a modal. */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const activeTag = (el?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
      if (el?.isContentEditable) return;
      if (document.querySelector('[role="dialog"], [role="presentation"].MuiModal-root')) return;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        haptics.playClick();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    haptics.playClick();
    setActiveSearch(searchInput);
    setPage(1);
  };

  const handleClearSearch = () => {
    haptics.playClick();
    setSearchInput('');
    setActiveSearch('');
    setPage(1);
    searchInputRef.current?.focus();
  };

  const handleDeleteConfirm = async () => {
    if (!imageToDelete) return;

    try {
      await deleteMutation.mutateAsync(imageToDelete.id);
      haptics.playDelete();
      enqueueSnackbar(`Deleted "${imageToDelete.name}" successfully`, {
        variant: 'success',
      });
      setImageToDelete(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      enqueueSnackbar(`Error deleting image: ${msg}`, { variant: 'error' });
    }
  };

  const images = data?.images || [];
  const pagination = data?.pagination;

  const renderBody = () => {
    /* FIX-05 — auth restore is its own state: while the session is being
     * verified we show a neutral loading state, never needs-auth (the user
     * may well be logged in) and never the gallery skeleton (no fetch has
     * been allowed to start yet). */
    if (authLoading) {
      return <DataState kind="loading" title="Đang kiểm tra kết nối…" compact />;
    }

    // 1. Auth gate — never show "empty library" to an anonymous visitor.
    if (!isAuthenticated) {
      return (
        <DataState
          kind="needs-auth"
          title="Kết nối để xem thư viện của bạn"
          description="Thư viện media yêu cầu API key. Kết nối để xem và quản lý file đã tải lên."
          action={{ label: 'Kết nối API key', onClick: showApiKeyDialog }}
        />
      );
    }

    // 2. First load — skeletons; background refresh keeps the old grid.
    if (isLoading) {
      return (
        <Grid container spacing={{ xs: 1.5, md: 2 }}>
          {Array.from({ length: 8 }).map((_, idx) => (
            <Grid key={idx} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Skeleton
                variant="rectangular"
                sx={{ borderRadius: 'var(--radius-md)', mb: 1, aspectRatio: '4/3', height: 'auto' }}
              />
              <Skeleton variant="text" width="80%" height={22} />
              <Skeleton variant="text" width="45%" height={16} />
            </Grid>
          ))}
        </Grid>
      );
    }

    /* FIX-05 — a failed REFETCH must not blank the grid: React Query keeps
     * the previous `data` on error, so render it with a banner instead of
     * dropping the user into an error state for content they already have.
     * Only a first-load failure (no cached data) gets the full error state. */
    if (isError && images.length > 0) {
      return (
        <>
          <DataState
            kind="error"
            title="Không tải được dữ liệu mới"
            description="Đang hiển thị dữ liệu đã tải trước đó. Kiểm tra kết nối và thử lại."
            action={{ label: 'Thử lại', onClick: () => refetch() }}
            sx={{ mb: 2 }}
          />
          <Grid container spacing={{ xs: 1.5, md: 2 }}>
            {images.map((img) => (
              <Grid key={img.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <ImageCard
                  image={img}
                  onPreview={(selected) => setPreviewImage(selected)}
                  onDelete={(selected) => setImageToDelete(selected)}
                />
              </Grid>
            ))}
          </Grid>
        </>
      );
    }

    // 3. First-load fetch error — no cached grid to fall back to.
    if (isError) {
      return (
        <DataState
          kind="error"
          title="Không tải được thư viện"
          description={error?.message || 'Có lỗi khi lấy danh sách file. Kiểm tra kết nối và thử lại.'}
          action={{ label: 'Thử lại', onClick: () => refetch() }}
        />
      );
    }

    // 4. Data — grid.
    if (images.length > 0) {
      return (
        <Grid container spacing={{ xs: 1.5, md: 2 }}>
          {images.map((img) => (
            <Grid key={img.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <ImageCard
                image={img}
                onPreview={(selected) => setPreviewImage(selected)}
                onDelete={(selected) => setImageToDelete(selected)}
              />
            </Grid>
          ))}
        </Grid>
      );
    }

    // 5. No results for an active search — offer Clear, not Upload.
    if (activeSearch) {
      return (
        <DataState
          kind="no-results"
          title={`Không tìm thấy "${activeSearch}"`}
          description="Thử từ khóa khác hoặc xóa bộ lọc tìm kiếm."
          action={{ label: 'Xóa tìm kiếm', onClick: handleClearSearch }}
        />
      );
    }

    // 6. Genuinely empty — success response, zero items.
    return (
      <DataState
        kind="empty"
        title={folderLabel ? 'Thư mục này chưa có file' : 'Thư viện chưa có file'}
        description="Tải file đầu tiên lên để bắt đầu — file được phục vụ qua CDN toàn cầu ngay sau khi tải xong."
        action={{
          label: 'Đi tới Upload',
          onClick: () => {
            window.location.hash = '/upload';
          },
        }}
      />
    );
  };

  return (
    <Box sx={{ width: '100%', mb: 6 }}>
      {/* Toolbar: title/count, search, refresh, upload shortcut */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Typography
            variant="h2"
            sx={{
              fontWeight: 650,
              letterSpacing: '-0.015em',
              fontSize: '1.375rem',
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {folderLabel ?? 'Thư viện'}
          </Typography>
          {pagination && (
            <Chip
              label={`${pagination.total} file`}
              size="small"
              sx={{
                fontSize: '0.72rem',
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                backgroundColor: 'var(--color-content-secondary)',
                flexShrink: 0,
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
          <Box
            component="form"
            onSubmit={handleSearchSubmit}
            role="search"
            sx={{ flexGrow: 1, width: { xs: '100%', sm: 280, md: 340 } }}
          >
            <TextField
              inputRef={searchInputRef}
              size="small"
              placeholder="Tìm theo tên file…  ( / )"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              fullWidth
              /* FIX-06 — accessible name independent of placeholder. */
              slotProps={{
                htmlInput: { 'aria-label': 'Tìm kiếm file theo tên' },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: searchInput && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={handleClearSearch} aria-label="Xóa tìm kiếm">
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          <Tooltip title="Tải lại thư viện">
            <span>
              <IconButton
                onClick={() => {
                  haptics.playClick();
                  refetch();
                }}
                disabled={isFetching}
                aria-label="Tải lại thư viện"
                color="primary"
                className="pressable"
                sx={{
                  border: '1px solid',
                  borderColor: 'var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Button
            variant="outlined"
            size="small"
            href="#/upload"
            startIcon={<UploadIcon sx={{ fontSize: 16 }} />}
            className="pressable"
            sx={{ borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap', display: { xs: 'none', sm: 'inline-flex' } }}
          >
            Upload
          </Button>
        </Box>
      </Box>

      {renderBody()}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={pagination.total_pages}
            page={page}
            onChange={(_, val) => {
              haptics.playTick();
              setPage(val);
            }}
            color="primary"
            shape="rounded"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      {/* Image Preview & Embed Modal */}
      <ImagePreviewModal
        image={previewImage}
        open={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(imageToDelete)}
        title="Delete Image?"
        message={`Are you sure you want to delete "${imageToDelete?.name}"? This permanently removes the file from storage and purges the CDN cache.`}
        confirmText="Confirm Delete"
        loading={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setImageToDelete(null)}
      />
    </Box>
  );
};
