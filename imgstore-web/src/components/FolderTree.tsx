import React, { useMemo } from 'react';
import { Box, Typography, Skeleton, Button } from '@mui/material';
import {
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  PhotoLibrary as AllIcon,
  Refresh as RetryIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { fetchFolders } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { FolderMetadata } from '../types';
import { haptics } from '../lib/haptics';

/* Hallmark · component: folder-tree · macrostructure: Workbench sidebar · theme: Terminal */

interface FolderTreeProps {
  /** Selected folder id; undefined = "All images". */
  selected?: string;
  onSelect: (folder?: FolderMetadata) => void;
  scope: string;
}

interface TreeRow {
  folder: FolderMetadata;
  depth: number;
}

/** Sort the flat folder list (paths are "a/b/c") into indented tree order.
 * The backend 'ensure' action always creates the whole chain, so every
 * ancestor of a leaf exists in the list already. */
function flatten(folders: FolderMetadata[]): TreeRow[] {
  return [...folders]
    .filter(f => !f.is_root)
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(folder => ({ folder, depth: folder.path.split('/').length - 1 }));
}

export const FolderTree: React.FC<FolderTreeProps> = ({ selected, onSelect, scope }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  /* FIX-05 — never fire /folders for an anonymous visitor: the request is
   * guaranteed 401, the error state it produces is noise, and it burns a retry
   * budget the real user will need after connecting. */
  const folders = useQuery({
    queryKey: ['folders', scope],
    queryFn: fetchFolders,
    retry: 1,
    enabled: !authLoading && isAuthenticated,
  });

  const rows = useMemo(() => flatten(folders.data?.folders ?? []), [folders.data]);
  const itemCount = rows.length;

  /* FIX-06 — user-facing folder names use the body font (mono is for
   * paths/code, not names), and every row is a ≥44px touch target. Deep
   * paths indent but never push the row past its container. */
  const rowSx = (active: boolean, depth = 0) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    width: '100%',
    textAlign: 'left' as const,
    pl: 1.5 + Math.min(depth, 6) * 1.5,
    pr: 1,
    minHeight: 44,
    border: 'none',
    borderLeft: '2px solid',
    borderLeftColor: active ? 'var(--color-accent)' : 'transparent',
    backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
    transition: `background-color var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard)`,
    '&:hover': {
      backgroundColor: active ? 'var(--color-accent-soft)' : 'var(--color-content-secondary)',
      color: 'var(--color-text-primary)',
    },
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  });

  return (
    <Box
      component="nav"
      aria-label="Folders"
      sx={{
        fontFamily: 'var(--font-mono)',
        borderRight: '1px solid var(--color-border-subtle)',
        pr: 1,
        minWidth: 0,
      }}
    >
      <Typography
        variant="overline"
        sx={{
          display: 'block',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          letterSpacing: '0.12em',
          color: 'var(--color-ink-3)',
          px: 1.5,
          pt: 0.5,
          pb: 1,
        }}
      >
        ~/folders
      </Typography>

      <Box
        component="button"
        onClick={() => { haptics.playTick(); onSelect(undefined); }}
        sx={rowSx(selected === undefined)}
        aria-current={selected === undefined ? 'true' : undefined}
      >
        {selected === undefined
          ? <FolderOpenIcon sx={{ fontSize: 15, color: 'var(--color-accent-emerald)' }} />
          : <AllIcon sx={{ fontSize: 15 }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>all images</span>
      </Box>

      {!isAuthenticated && !authLoading ? (
        /* FIX-05 — anonymous sidebar is a connect prompt, not a fetch error. */
        <Typography variant="caption" sx={{ display: 'block', px: 1.5, py: 1, color: 'var(--color-ink-3)' }}>
          Kết nối API key để xem folders
        </Typography>
      ) : folders.isPending ? (
        <Box sx={{ px: 1.5, pt: 1 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="text" width={`${70 - i * 8}%`} height={22} />
          ))}
        </Box>
      ) : folders.isError ? (
        /* LG-03 — error ≠ empty: the sidebar gets its own retry so a folder
           failure never reads as "no folders". */
        <Box sx={{ px: 1.5, py: 1 }} role="alert">
          <Typography
            variant="caption"
            sx={{ display: 'block', mb: 1, color: 'var(--color-destructive)' }}
          >
            Không tải được danh sách folder.
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<RetryIcon sx={{ fontSize: 15 }} />}
            disabled={folders.isFetching}
            onClick={() => { haptics.playClick(); void folders.refetch(); }}
            sx={{
              textTransform: 'none',
              fontSize: '0.75rem',
              borderRadius: 'var(--radius-full)',
              px: 1.5,
              minHeight: 30,
            }}
          >
            {folders.isFetching ? 'Đang thử lại…' : 'Thử lại'}
          </Button>
        </Box>
      ) : itemCount === 0 ? (
        <Typography variant="caption" sx={{ display: 'block', px: 1.5, py: 1, color: 'var(--color-ink-3)' }}>
          (no folders yet — upload to create one)
        </Typography>
      ) : (
        rows.map(({ folder, depth }) => {
          const name = folder.path.split('/').pop() ?? folder.path;
          const active = selected === folder.id;
          return (
            <Box
              key={folder.id}
              component="button"
              title={`/${folder.path}`}
              onClick={() => { haptics.playTick(); onSelect(folder); }}
              sx={rowSx(active, depth)}
              aria-current={active ? 'true' : undefined}
            >
              {active
                ? <FolderOpenIcon sx={{ fontSize: 15, color: 'var(--color-accent-emerald)', flexShrink: 0 }} />
                : <FolderIcon sx={{ fontSize: 15, flexShrink: 0 }} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}/</span>
            </Box>
          );
        })
      )}
    </Box>
  );
};
