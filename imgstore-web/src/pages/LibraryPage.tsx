import React, { useState } from 'react';
import { Box } from '@mui/material';
import { FolderTree } from '../components/FolderTree';
import { ImageGallery } from '../components/ImageGallery';
import { getApiBaseUrl } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { FolderMetadata } from '../types';

/* Hallmark · page: library · macrostructure: Workbench (sidebar tree + canvas) · theme: Terminal */

export const LibraryPage: React.FC = () => {
  const { user } = useAuth();
  const [selected, setSelected] = useState<FolderMetadata | undefined>(undefined);

  // Folder list + gallery are scoped per (API URL, user) — same scope the
  // upload picker uses, so both pages always agree.
  const scope = JSON.stringify([getApiBaseUrl(), user?.id]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        gap: { xs: 2, md: 3 },
        alignItems: 'flex-start',
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          width: { xs: '100%', md: 232 },
          flexShrink: 0,
          position: { md: 'sticky' },
          top: { md: 80 },
          maxHeight: { md: 'calc(100vh - 96px)' },
          overflowY: { md: 'auto' },
          borderBottom: { xs: '1px solid var(--color-border-subtle)', md: 'none' },
          pb: { xs: 2, md: 0 },
        }}
      >
        <FolderTree scope={scope} selected={selected?.id} onSelect={setSelected} />
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <ImageGallery
          key={selected?.id ?? 'all'}
          folderId={selected?.id}
          folderLabel={selected ? `/${selected.path}` : undefined}
        />
      </Box>
    </Box>
  );
};
