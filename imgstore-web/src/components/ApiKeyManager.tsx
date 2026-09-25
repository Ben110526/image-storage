import { useEffect, useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { createApiKey, fetchApiKeys, revokeApiKey, type PersonalApiKey } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from './ConfirmDialog';

export function ApiKeyManager() {
  const { isAuthenticated, showApiKeyDialog, user } = useAuth();
  const [keys, setKeys] = useState<PersonalApiKey[]>([]);
  const [name, setName] = useState('My application');
  const [clientId, setClientId] = useState('');
  const [newKey, setNewKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Revoke confirmation dialog state
  const [revokeTarget, setRevokeTarget] = useState<PersonalApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let active = true;
    setNewKey('');
    setKeys([]);
    if (user?.role === 'admin')
      fetchApiKeys()
        .then((k) => {
          if (active) setKeys(k);
        })
        .catch(() => {
          if (active) setError('Could not load API keys.');
        });
    return () => {
      active = false;
    };
  }, [isAuthenticated, user?.id, user?.role]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setKeys(await fetchApiKeys());
    } catch {
      setError('Request failed. Check your connection and sign in again if needed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeApiKey(revokeTarget.id);
      setNewKey('');
      setKeys(await fetchApiKeys());
    } catch {
      setError('Failed to revoke key. Try again.');
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  if (!isAuthenticated)
    return (
      <Alert severity="info" action={<Button onClick={showApiKeyDialog}>Connect</Button>}>
        Enter your API key to connect. No cloud account or personal storage is required.
      </Alert>
    );

  if (user?.role !== 'admin')
    return (
      <Alert severity="info">
        Your key uploads to the shared ImgStore storage and manages only your own images. Contact
        the administrator for key replacement.
      </Alert>
    );

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h6">Issue client API keys</Typography>
      <Typography variant="body2" color="text.secondary">
        Create one key for each person or application. All images are stored in the shared ImgStore storage;
        each client manages only its own uploads. Keys expire after one year. Revocation may
        take up to a minute to propagate.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField
          label="Key name"
          value={name}
          size="small"
          onChange={(e) => setName(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        <TextField
          label="Existing Client ID (optional)"
          value={clientId}
          size="small"
          onChange={(e) => setClientId(e.target.value)}
          helperText="Leave empty for a new client; reuse an ID to replace a key."
        />
        <Button
          variant="contained"
          disabled={busy || !name.trim()}
          onClick={() =>
            run(async () => {
              const result = await createApiKey(name, clientId.trim());
              setNewKey(result.key);
            })
          }
        >
          Create API key
        </Button>
      </Box>
      {newKey && (
        <Alert severity="success">
          <Typography variant="body2">Copy now. This secret is shown only once.</Typography>
          <TextField
            fullWidth
            value={newKey}
            size="small"
            slotProps={{ input: { readOnly: true } }}
          />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(newKey);
              } catch {
                setError('Select and copy the key manually.');
              }
            }}
          >
            Copy key
          </Button>
          <Button onClick={() => setNewKey('')}>Hide</Button>
        </Alert>
      )}
      {keys.map((key) => (
        <Box
          key={key.id}
          sx={{
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
            {key.name} · {key.prefix}… · Client ID: {key.userId} · expires{' '}
            {new Date(key.expiresAt * 1000).toLocaleDateString()}
          </Typography>
          <Button
            color="error"
            disabled={busy}
            onClick={() => setRevokeTarget(key)}
          >
            Revoke
          </Button>
        </Box>
      ))}

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke API Key"
        message={
          revokeTarget
            ? `Revoke "${revokeTarget.name}"? Applications using this key will immediately stop working.`
            : ''
        }
        confirmText="Revoke Key"
        loading={revoking}
        onConfirm={handleRevokeConfirm}
        onCancel={() => setRevokeTarget(null)}
      />
    </Box>
  );
}
