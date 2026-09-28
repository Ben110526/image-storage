import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Alert,
  IconButton,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  Restore as ResetIcon,
  Tune as SettingsIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import {
  getApiBaseUrl,
  getApiKey,
  saveApiConfig,
  resetApiConfig,
} from '../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { haptics } from '../lib/haptics';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (open) {
      setApiUrl(getApiBaseUrl());
      setApiKey(getApiKey());
    }
  }, [open]);

  const handleSave = () => {
    haptics.playSuccess();
    saveApiConfig(apiUrl, apiKey);
    queryClient.invalidateQueries();
    enqueueSnackbar('Connection parameters saved successfully!', { variant: 'success' });
    onClose();
  };

  const handleReset = () => {
    haptics.playClick();
    resetApiConfig();
    setApiUrl(import.meta.env.VITE_API_URL || 'http://localhost:8787');
    setApiKey('');
    queryClient.invalidateQueries();
    enqueueSnackbar('Settings reset to build defaults', { variant: 'info' });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: (theme) =>
              theme.palette.mode === 'dark'
                ? 'rgba(15, 23, 42, 0.45)'
                : 'rgba(15, 23, 42, 0.28)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          },
        },
        paper: {
          className: 'liquid-glass-dialog',
          sx: {
            overflow: 'hidden',
          },
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{
          m: 0,
          p: 2.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <SettingsIcon color="primary" />
          <Typography variant="h6" sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
            API &amp; Gateway Settings
          </Typography>
        </Box>
        <IconButton
          onClick={() => {
            haptics.playClick();
            onClose();
          }}
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
          Configure the API endpoint for this browser. The Worker URL points to your deployed Cloudflare Worker. The optional API key field is for direct REST access without session login.
        </Alert>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            label="Worker API Base URL"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            helperText="Local dev (http://localhost:8787) or production (https://imgapi.<subdomain>.workers.dev)"
            fullWidth
            size="small"
            slotProps={{
              input: {
                sx: { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' },
              },
            }}
          />

          <TextField
            label="Personal API Key (optional)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            helperText="Optional API access for this browser. Use Connect with API key for the full dashboard."
            type="password"
            fullWidth
            size="small"
            slotProps={{
              input: {
                sx: { fontFamily: 'JetBrains Mono, monospace', fontSize: '0.85rem' },
              },
            }}
          />
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          justifyContent: 'space-between',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Button
          startIcon={<ResetIcon />}
          onClick={handleReset}
          color="inherit"
          size="small"
          sx={{ textTransform: 'none' }}
        >
          Reset Defaults
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            onClick={() => {
              haptics.playClick();
              onClose();
            }}
            color="inherit"
            size="small"
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            color="primary"
            size="small"
            className="bevel-button"
          >
            Save Parameters
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};
