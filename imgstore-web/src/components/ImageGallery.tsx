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
  Paper,
  useTheme,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon,
  PhotoLibrary as GalleryIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useImages, useDeleteImage } from '../hooks/useImages';
import { ImageCard } from './ImageCard';
import { ConfirmDialog } from './ConfirmDialog';
import { ImagePreviewModal } from './ImagePreviewModal';
import type { ImageMetadata } from '../types';
import { haptics } from '../lib/haptics';

interface ImageGalleryProps {
  /** When set, only images in this folder are listed. */
  folderId?: string;
  /** Label of the current folder view, shown next to the title. */
  folderLabel?: string;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ folderId, folderLabel }) => {
  const theme = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const [previewImage, setPreviewImage] = useState<ImageMetadata | null>(null);
  const [imageToDelete, setImageToDelete] = useState<ImageMetadata | null>(null);

  const limit = 12;
  const { data, isLoading, isFetching, refetch } = useImages(
    page,
    limit,
    activeSearch,
    folderId
  );
  const deleteMutation = useDeleteImage();

  // Listen for '/' key to quick-focus the search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;
      if (e.key === '/' || e.key === 's' || e.key === 'S') {
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

  return (
    <Box sx={{ width: '100%', mb: 6 }}>
      {/* Header controls: Title, search input, refresh */}
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'primary.main',
              color: 'primary.main',
            }}
          >
            <GalleryIcon sx={{ fontSize: 20 }} />
          </Box>
          <Typography
            variant="h5"
            sx={{
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            {folderLabel ?? 'Media Library'}
          </Typography>
          {pagination && (
            <Chip
              label={`${pagination.total} ${pagination.total === 1 ? 'item' : 'items'}`}
              size="small"
              sx={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.72rem',
                fontWeight: 600,
                backgroundColor:
                  theme.palette.mode === 'dark'
                    ? 'rgba(255, 255, 255, 0.06)'
                    : 'rgba(0, 0, 0, 0.05)',
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}>
          <Box
            component="form"
            onSubmit={handleSearchSubmit}
            sx={{ flexGrow: 1, width: { xs: '100%', sm: 280, md: 340 } }}
          >
            <TextField
              inputRef={searchInputRef}
              size="small"
              placeholder="Search images... (Press [/] to focus)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              fullWidth
              slotProps={{
                input: {
                  sx: {
                    borderRadius: 2,
                    fontSize: '0.875rem',
                    backgroundColor:
                      theme.palette.mode === 'dark'
                        ? 'rgba(15, 23, 42, 0.5)'
                        : '#ffffff',
                  },
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                  endAdornment: searchInput && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={handleClearSearch}>
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>

          <Tooltip title="Refresh Media Library">
            <IconButton
              onClick={() => {
                haptics.playClick();
                refetch();
              }}
              disabled={isFetching}
              color="primary"
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                p: 0.9,
              }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Grid of Images */}
      {isLoading ? (
        <Grid container spacing={2.5}>
          {Array.from({ length: 8 }).map((_, idx) => (
            <Grid key={idx} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Skeleton
                variant="rectangular"
                height={180}
                sx={{ borderRadius: 2, mb: 1.2 }}
              />
              <Skeleton variant="text" width="80%" height={22} />
              <Skeleton variant="text" width="45%" height={16} />
            </Grid>
          ))}
        </Grid>
      ) : images.length > 0 ? (
        <Grid container spacing={2.5}>
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
      ) : (
        /* Empty State */
        <Paper
          className="spatial-card"
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: 3,
          }}
        >
          <Box
            sx={{
              display: 'inline-flex',
              p: 3,
              borderRadius: '50%',
              backgroundColor:
                theme.palette.mode === 'dark' ? 'rgba(52, 211, 153, 0.1)' : 'rgba(52, 211, 153, 0.08)',
              color: 'primary.main',
              mb: 2,
            }}
          >
            <GalleryIcon sx={{ fontSize: 44 }} />
          </Box>
          <Typography
            variant="h6"
            sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, mb: 1 }}
          >
            {activeSearch ? 'No images found' : 'Media library is empty'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 440, mx: 'auto', mb: 3 }}>
            {activeSearch
              ? `No images matched query "${activeSearch}". Try another keyword or clear search.`
              : 'Drag & drop photos above to begin hosting images with instant global CDN delivery.'}
          </Typography>
          {activeSearch && (
            <Button variant="outlined" onClick={handleClearSearch} size="small">
              Clear Search Filter
            </Button>
          )}
        </Paper>
      )}

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
