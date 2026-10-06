import React, { useEffect, useState } from 'react';
import { Box, Button, Drawer, IconButton, Typography, useMediaQuery } from '@mui/material';
import {
  Folder as FolderIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { FolderTree } from '../components/FolderTree';
import { ImageGallery } from '../components/ImageGallery';
import { PageHeader } from '../components/ui/PageHeader';
import { getApiBaseUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { haptics } from '../lib/haptics';
import type { FolderMetadata } from '../types';

/* Library — plan §5.3/§10.2, FIX-06: one clear H1; the current folder is
 * context, not the page title. Below 900px the folder tree collapses into a
 * "Thư mục" button + current path on the toolbar that opens a sheet; from
 * 900px up the tree is a 240px sticky sidebar. */

export const LibraryPage: React.FC = () => {
  const { user } = useAuth();
  const [selected, setSelected] = useState<FolderMetadata | undefined>(undefined);
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  /* 900px is the plan's sidebar breakpoint (FIX-06). */
  const isDesktop = useMediaQuery('(min-width:900px)');

  // Folder list + gallery are scoped per (API URL, user) — same scope the
  // upload picker uses, so both pages always agree.
  const scope = JSON.stringify([getApiBaseUrl(), user?.id]);

  /* FIX-06 — a scope change (endpoint/user switch) must reset the selected
   * folder: the old folder id belongs to the previous scope's tree. */
  useEffect(() => {
    setSelected(undefined);
    setFolderSheetOpen(false);
  }, [scope]);

  const handleSelect = (folder?: FolderMetadata) => {
    haptics.playTick();
    setSelected(folder);
    setFolderSheetOpen(false);
  };

  const folderLabel = selected ? `/${selected.path}` : 'Tất cả file';

  return (
    <Box>
      <PageHeader title="Thư viện" description="Quản lý và chia sẻ file đã tải lên." />

      {/* Mobile toolbar: folder button + current path (FIX-06). */}
      {!isDesktop && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 2,
            minWidth: 0,
          }}
        >
          <Button
            variant="outlined"
            size="small"
            startIcon={<FolderIcon sx={{ fontSize: 16 }} />}
            onClick={() => {
              haptics.playClick();
              setFolderSheetOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={folderSheetOpen}
            className="pressable"
            sx={{ borderRadius: 'var(--radius-full)', flexShrink: 0, textTransform: 'none' }}
          >
            Thư mục
          </Button>
          <Typography
            variant="body2"
            title={folderLabel}
            sx={{
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {folderLabel}
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: { md: 3 },
          alignItems: 'flex-start',
          minWidth: 0,
        }}
      >
        {/* Desktop sidebar (≥900px) — 240px sticky tree. */}
        {isDesktop && (
          <Box
            sx={{
              width: 240,
              flexShrink: 0,
              position: 'sticky',
              top: 80,
              maxHeight: 'calc(100vh - 96px)',
              overflowY: 'auto',
            }}
          >
            <FolderTree scope={scope} selected={selected?.id} onSelect={setSelected} />
          </Box>
        )}

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <ImageGallery
            key={selected?.id ?? 'all'}
            folderId={selected?.id}
            folderLabel={selected ? `/${selected.path}` : undefined}
          />
        </Box>
      </Box>

      {/* Mobile folder sheet (<900px) — focus trap/restore via MUI Drawer. */}
      <Drawer
        anchor="bottom"
        open={folderSheetOpen && !isDesktop}
        onClose={() => setFolderSheetOpen(false)}
        slotProps={{
          paper: {
            sx: {
              borderTopLeftRadius: 'var(--radius-lg)',
              borderTopRightRadius: 'var(--radius-lg)',
              maxHeight: '70dvh',
              backgroundColor: 'var(--color-content)',
            },
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Thư mục
          </Typography>
          <IconButton
            aria-label="Đóng danh sách thư mục"
            onClick={() => setFolderSheetOpen(false)}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ overflowY: 'auto', py: 1 }}>
          <FolderTree scope={scope} selected={selected?.id} onSelect={handleSelect} />
        </Box>
      </Drawer>
    </Box>
  );
};
