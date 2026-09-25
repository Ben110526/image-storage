import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  TextField,
  Typography,
  Stack,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ensureFolderPath, fetchFolders, createFolder } from '../api/client';
import type { FolderMetadata } from '../types';
import { haptics } from '../lib/haptics';

interface Props {
  scope: string;
  value?: FolderMetadata;
  onChange: (folder?: FolderMetadata) => void;
}

// New uploads default to an automatically dated subfolder ("uploads/2026-09"),
// created on demand by the server — no manual folder setup at all.
const autoPath = () => `uploads/${new Date().toISOString().slice(0, 7)}`;

const invalidNameChars = () => /[\\/]/;

export function UploadFolderPicker({ scope, value, onChange }: Props) {
  const queryClient = useQueryClient();
  const folders = useQuery({ queryKey: ['folders', scope], queryFn: fetchFolders, retry: 1 });
  const autoSelected = useRef('');

  const [newName, setNewName] = useState('');

  const ensure = useMutation({
    mutationFn: ensureFolderPath,
    onSuccess: folder => {
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchFolders>>>(['folders', scope], previous => previous
        ? { ...previous, folders: [...previous.folders.filter(f => f.id !== folder.id), folder] } : previous);
      onChange(folder);
      void queryClient.invalidateQueries({ queryKey: ['folders', scope] });
    },
  });

  const create = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Folder name is empty.');
      if (trimmed.length > 100) throw new Error('Folder name must be at most 100 characters.');
      if (invalidNameChars().test(trimmed)) throw new Error('Folder name cannot contain "/" or "\\".');
      if (trimmed === '.' || trimmed === '..') throw new Error('Folder name cannot be "." or "..".');
      return createFolder(trimmed);
    },
    onSuccess: folder => {
      haptics.playSuccess();
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchFolders>>>(['folders', scope], previous => previous
        ? { ...previous, folders: [...previous.folders.filter(f => f.id !== folder.id), folder] } : previous);
      onChange(folder);
      setNewName('');
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
    <Box sx={{ mb: 2 }}>
      <TextField select label="Upload folder" size="small" value={value?.id || ''}
        slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        disabled={ensure.isPending} sx={{ minWidth: 260 }}
        onChange={event => {
          autoSelected.current = scope; // a manual pick stops the auto default
          onChange(children.find(f => f.id === event.target.value));
        }}>
        <MenuItem value="">My folder (root)</MenuItem>
        {children.map(folder => <MenuItem key={folder.id} value={folder.id}>/{folder.path}</MenuItem>)}
      </TextField>

      <Stack direction="row" spacing={1} sx={{ mt: 1, maxWidth: 460 }}>
        <TextField
          size="small"
          placeholder="New subfolder name…"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (newName.trim() && !create.isPending) create.mutate(newName);
            }
          }}
          disabled={create.isPending}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Button
          variant="outlined"
          size="small"
          onClick={() => { haptics.playClick(); create.mutate(newName); }}
          disabled={!newName.trim() || create.isPending}
          sx={{ flexShrink: 0, px: 2 }}
        >
          Create folder
        </Button>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        Everything uploads to your own private folder, created automatically — new files go to "{autoPath()}" by default. Pick another folder above, or type a name to create one. Queued files keep their destination.
      </Typography>
      {folders.isPending && <Typography variant="caption" sx={{ display: 'block' }}>Loading your folders…</Typography>}
      {(folders.error || ensure.error || create.error) && <Alert severity="error" sx={{ mt: 1 }} action={<Button color="inherit" onClick={() => { autoSelected.current = ''; ensure.reset(); create.reset(); void folders.refetch(); }}>Retry</Button>}>
        {(create.error || ensure.error || folders.error)?.message}
      </Alert>}
    </Box>
  );
}
