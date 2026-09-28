import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  MenuItem,
  OutlinedInput,
  Select,
  Typography,
} from '@mui/material';
import {
  Folder as FolderIcon,
  CreateNewFolder as CreateNewFolderIcon,
  Close as CloseIcon,
  SubdirectoryArrowRight as SubdirectoryArrowRightIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ensureFolderPath, fetchFolders } from '../api/client';
import type { FolderMetadata } from '../types';
import { haptics } from '../lib/haptics';

/* Hallmark · component: upload-folder-picker · macrostructure: Workbench toolbar · theme: Terminal */

interface Props {
  scope: string;
  value?: FolderMetadata;
  onChange: (folder?: FolderMetadata) => void;
}

// New uploads default to an automatically dated subfolder ("uploads/2026-09"),
// created on demand by the server — no manual folder setup required.
const autoPath = () => `uploads/${new Date().toISOString().slice(0, 7)}`;

// Backslash and control characters are forbidden; "/" is allowed because the
// create input also accepts nested paths ("products/2026"). Kept as an
// explicit list so oxlint's no-control-regex rule stays quiet.
const FORBIDDEN_CHARS = /[\\\n\r\t]/;

export function UploadFolderPicker({ scope, value, onChange }: Props) {
  const queryClient = useQueryClient();
  const folders = useQuery({ queryKey: ['folders', scope], queryFn: fetchFolders, retry: 1 });
  const autoSelected = useRef('');
  // True once the user picks a folder by hand or creates one — that choice
  // beats the automatic "uploads/YYYY-MM" default if it resolves later.
  const userChosen = useRef(false);

  const [isCreating, setIsCreating] = useState(false);
  const [newPath, setNewPath] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreating) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCreating]);

  const ensure = useMutation({
    mutationFn: ensureFolderPath,
    onSuccess: folder => {
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchFolders>>>(['folders', scope], previous => previous
        ? { ...previous, folders: [...previous.folders.filter(f => f.id !== folder.id), folder] } : previous);
      // Don't drag the selection back to the auto folder after a manual pick.
      if (!userChosen.current) onChange(folder);
      void queryClient.invalidateQueries({ queryKey: ['folders', scope] });
    },
  });

  const create = useMutation({
    mutationFn: async (input: string) => {
      // Accept a single name ("products") or a nested path ("products/2026").
      // Trim edge slashes and collapse duplicate separators before validation.
      const raw = input.trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
      if (!raw) throw new Error('Folder name is empty.');
      const segments = raw.split('/');
      if (segments.some(s => !s || s === '.' || s === '..' || FORBIDDEN_CHARS.test(s))) {
        throw new Error('Folder name cannot contain "\\", "." or ".." path segments.');
      }
      // The server limits each level to 100 chars (up to 8 levels) — match it
      // per segment so long valid nested paths aren't blocked by the UI.
      if (segments.some(s => s.length > 100)) throw new Error('Each folder name must be at most 100 characters.');
      // The new folder is created under the currently selected folder — the
      // parent is implied by value, not passed through the UI.
      const parentPath = value?.path ?? '';
      return ensureFolderPath(parentPath ? `${parentPath}/${raw}` : raw);
    },
    onSuccess: folder => {
      haptics.playSuccess();
      userChosen.current = true; // an explicit create is a user choice too
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchFolders>>>(['folders', scope], previous => previous
        ? { ...previous, folders: [...previous.folders.filter(f => f.id !== folder.id), folder] } : previous);
      onChange(folder);
      setNewPath('');
      setIsCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['folders', scope] });
    },
  });

  // Once the folder list is available, resolve the automatic destination once
  // per (API URL, user) scope — unless the user picked a folder themselves.
  useEffect(() => {
    if (!folders.data || value || ensure.isPending || autoSelected.current === scope) return;
    autoSelected.current = scope;
    const path = autoPath();
    const existing = folders.data.folders.find(f => f.path === path);
    if (existing) onChange(existing);
    else ensure.mutate(path);
  }, [folders.data, value, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const children = folders.data?.folders.filter(f => !f.is_root) || [];
  // Retain the selected option even during a stale refetch after creation.
  if (value && !children.some(f => f.id === value.id)) children.push(value);

  return (
    <Box
      className="spatial-card"
      sx={{
        p: { xs: 1.5, sm: 2 },
        mb: 2.5,
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--color-paper-2)',
        border: '1px solid var(--color-border)',
        transition: 'border-color var(--dur-base) var(--ease-out)',
        '&:hover': {
          borderColor: 'var(--color-border-strong)',
        },
      }}
    >
      {/* Primary Toolbar Row */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        {/* Left: Destination Selector */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Typography
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: 'var(--color-ink-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              whiteSpace: 'nowrap',
              lineHeight: 1,
              userSelect: 'none',
            }}
          >
            <Box component="span" sx={{ color: 'var(--color-accent-emerald)', fontWeight: 800 }}>$</Box>
            DEST:
          </Typography>

          <Select
            size="small"
            value={value?.id || ''}
            displayEmpty
            disabled={ensure.isPending}
            onChange={event => {
              const val = event.target.value;
              if (val === '__NEW_SUBFOLDER__') {
                haptics.playClick();
                setIsCreating(true);
                return;
              }
              autoSelected.current = scope; // a manual pick stops the auto default
              userChosen.current = true;
              onChange(children.find(f => f.id === val));
            }}
            renderValue={selectedId => {
              if (!selectedId) {
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <FolderIcon sx={{ fontSize: 16, color: 'var(--color-ink-3)', flexShrink: 0 }} />
                    <Typography
                      component="span"
                      sx={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      My folder (root)
                    </Typography>
                  </Box>
                );
              }
              const current = children.find(f => f.id === selectedId) || value;
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <FolderIcon sx={{ fontSize: 16, color: 'var(--color-accent-emerald)', flexShrink: 0 }} />
                  <Typography
                    component="span"
                    sx={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      color: 'var(--color-ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    /{current?.path || selectedId}
                  </Typography>
                </Box>
              );
            }}
            MenuProps={{
              slotProps: {
                paper: {
                  sx: {
                    backgroundColor: 'var(--color-paper-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-xs)',
                    boxShadow: 'var(--shadow-card)',
                    mt: 0.5,
                    maxHeight: 320,
                    '& .MuiMenuItem-root': {
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-sm)',
                      py: 0.8,
                      px: 1.5,
                      color: 'var(--color-ink)',
                      '&:hover': {
                        backgroundColor: 'var(--color-paper-3)',
                      },
                      '&.Mui-selected': {
                        backgroundColor: 'var(--color-accent-emerald-subtle)',
                        color: 'var(--color-accent-emerald)',
                        fontWeight: 600,
                        '&:hover': {
                          backgroundColor: 'var(--color-accent-emerald-subtle)',
                        },
                      },
                    },
                  },
                },
              },
            }}
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-ink)',
              backgroundColor: 'var(--color-paper)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              minWidth: { xs: '100%', sm: 260 },
              maxWidth: { xs: '100%', sm: 460 },
              flex: { xs: 1, sm: '0 1 auto' },
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '&:hover': { borderColor: 'var(--color-accent-emerald)' },
              '&.Mui-focused': {
                borderColor: 'var(--color-accent-emerald)',
                boxShadow: '0 0 0 2px var(--color-accent-emerald-subtle)',
              },
              '& .MuiSelect-select': {
                py: 0.75,
                px: 1.25,
                display: 'flex',
                alignItems: 'center',
              },
            }}
          >
            <MenuItem value="">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FolderIcon sx={{ fontSize: 16, color: 'var(--color-ink-3)' }} />
                <span>My folder (root)</span>
              </Box>
            </MenuItem>
            {children.map(folder => (
              <MenuItem key={folder.id} value={folder.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <FolderIcon sx={{ fontSize: 16, color: 'var(--color-accent-emerald)', flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    /{folder.path}
                  </span>
                </Box>
              </MenuItem>
            ))}
            <Divider sx={{ my: 0.5, borderColor: 'var(--color-border)' }} />
            <MenuItem value="__NEW_SUBFOLDER__" sx={{ color: 'var(--color-accent-emerald) !important' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AddIcon sx={{ fontSize: 16, color: 'var(--color-accent-emerald)' }} />
                <span>+ Create new subfolder…</span>
              </Box>
            </MenuItem>
          </Select>
        </Box>

        {/* Right: Toggle Create Button */}
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            haptics.playClick();
            setIsCreating(prev => !prev);
          }}
          disabled={folders.isPending || ensure.isPending}
          startIcon={isCreating ? <CloseIcon sx={{ fontSize: 14 }} /> : <CreateNewFolderIcon sx={{ fontSize: 15 }} />}
          sx={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            fontWeight: 600,
            textTransform: 'none',
            borderColor: isCreating ? 'var(--color-border-strong)' : 'var(--color-border)',
            color: isCreating ? 'var(--color-ink-2)' : 'var(--color-ink)',
            backgroundColor: isCreating ? 'var(--color-paper-3)' : 'transparent',
            borderRadius: 'var(--radius-xs)',
            px: 1.5,
            py: 0.65,
            minHeight: 34,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            '&:hover': {
              borderColor: 'var(--color-accent-emerald)',
              backgroundColor: 'var(--color-accent-emerald-subtle)',
              color: 'var(--color-accent-emerald)',
            },
          }}
        >
          {isCreating ? 'Cancel' : '+ New subfolder'}
        </Button>
      </Box>

      {/* Expandable Inline Subfolder Creator */}
      {isCreating && (
        <Box
          sx={{
            mt: 1.5,
            pt: 1.5,
            borderTop: '1px dashed var(--color-border)',
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 1,
            animation: 'fadeIn 180ms var(--ease-out)',
            '@keyframes fadeIn': {
              from: { opacity: 0, transform: 'translateY(-4px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          {/* Target directory indicator prefix */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              px: 1.25,
              py: 0.65,
              borderRadius: 'var(--radius-xs)',
              backgroundColor: 'var(--color-paper)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-accent-emerald)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              userSelect: 'none',
            }}
          >
            <SubdirectoryArrowRightIcon sx={{ fontSize: 14, mr: 0.5, opacity: 0.7 }} />
            <span>{value?.path ? `/${value.path}/` : '/'}</span>
          </Box>

          {/* Subfolder input field */}
          <OutlinedInput
            inputRef={inputRef}
            size="small"
            placeholder={value ? 'subfolder or nested/path (e.g. products or 2026/q3)…' : 'folder name or nested path (e.g. products/2026)…'}
            value={newPath}
            onChange={e => setNewPath(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (newPath.trim() && !create.isPending) create.mutate(newPath);
              } else if (e.key === 'Escape') {
                setIsCreating(false);
                setNewPath('');
              }
            }}
            disabled={create.isPending}
            fullWidth
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              backgroundColor: 'var(--color-paper)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '&:hover': { borderColor: 'var(--color-accent-emerald)' },
              '&.Mui-focused': {
                borderColor: 'var(--color-accent-emerald)',
                boxShadow: '0 0 0 2px var(--color-accent-emerald-subtle)',
              },
              '& .MuiInputBase-input': {
                py: 0.65,
                px: 1.25,
                fontFamily: 'var(--font-mono)',
              },
            }}
          />

          {/* Action button */}
          <Button
            variant="contained"
            size="small"
            className="bevel-button"
            onClick={() => {
              haptics.playClick();
              create.mutate(newPath);
            }}
            disabled={!newPath.trim() || create.isPending}
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              textTransform: 'none',
              backgroundColor: 'var(--color-accent-emerald)',
              color: 'var(--color-on-accent)',
              px: 2,
              py: 0.75,
              minHeight: 34,
              flexShrink: 0,
              whiteSpace: 'nowrap',
              '&:hover': {
                backgroundColor: 'var(--color-accent-emerald)',
                filter: 'brightness(1.1)',
              },
              '&.Mui-disabled': {
                backgroundColor: 'var(--color-paper-3)',
                color: 'var(--color-ink-3)',
              },
            }}
          >
            {create.isPending ? 'Creating…' : 'Create ⏎'}
          </Button>
        </Box>
      )}

      {/* Status & Helper Breadcrumb */}
      <Box
        sx={{
          mt: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: 'var(--color-ink-3)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Box component="span" sx={{ color: 'var(--color-accent-emerald)', fontWeight: 700 }}>↳</Box>
          {isCreating ? (
            <>
              Creating inside <Box component="span" sx={{ color: 'var(--color-ink)', fontWeight: 600 }}>{value ? `/${value.path}` : 'root'}</Box> • Accepts "a/b" paths • [Enter ⏎] to create, [Esc] to cancel
            </>
          ) : (
            <>
              Uploads land in <Box component="span" sx={{ color: 'var(--color-ink)', fontWeight: 600 }}>{value ? `/${value.path}` : 'root'}</Box> • Auto-provisioned &amp; edge-cached per user
            </>
          )}
        </Typography>

        {folders.isPending && (
          <Typography
            variant="caption"
            sx={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--color-ink-3)',
            }}
          >
            Syncing folders…
          </Typography>
        )}
      </Box>

      {/* Error Alert with Terminal Styling */}
      {(folders.error || ensure.error || create.error) && (
        <Alert
          severity="error"
          sx={{
            mt: 1.5,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            backgroundColor: 'var(--color-destructive-subtle)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-destructive)',
            borderRadius: 'var(--radius-xs)',
            '& .MuiAlert-icon': { color: 'var(--color-destructive)' },
          }}
          action={
            <Button
              color="inherit"
              size="small"
              sx={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', textTransform: 'none' }}
              onClick={() => {
                autoSelected.current = '';
                userChosen.current = false;
                ensure.reset();
                create.reset();
                void folders.refetch();
              }}
            >
              Retry
            </Button>
          }
        >
          {(create.error || ensure.error || folders.error)?.message}
        </Alert>
      )}
    </Box>
  );
}
