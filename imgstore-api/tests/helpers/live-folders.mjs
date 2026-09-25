import assert from 'node:assert/strict';

export async function driveTestToken(vars) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(30000),
    body: new URLSearchParams({ client_id: vars.GOOGLE_SYSTEM_CLIENT_ID || vars.GOOGLE_CLIENT_ID,
      client_secret: vars.GOOGLE_SYSTEM_CLIENT_SECRET || vars.GOOGLE_CLIENT_SECRET,
      refresh_token: vars.GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  });
  assert.ok(response.ok, 'Could not refresh test Drive credentials');
  return (await response.json()).access_token;
}

// Only empty folders explicitly returned for NEW disposable clients in this run.
// Trash, not permanent deletion. Never touch pre-existing user folders/files.
export async function trashDisposableFolders(vars, folders, owners) {
  if (!folders.length) return;
  const token = await driveTestToken(vars);
  const headers = { Authorization: `Bearer ${token}` };
  for (const folder of [...folders].reverse()) {
    assert.match(folder.id, /^[a-zA-Z0-9_-]+$/);
    const endpoint = `https://www.googleapis.com/drive/v3/files/${folder.id}?supportsAllDrives=true`;
    const response = await fetch(endpoint + '&fields=id,mimeType,parents,appProperties,trashed', { headers, signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, 'Cannot verify disposable folder ' + folder.id);
    const metadata = await response.json();
    assert.equal(metadata.mimeType, 'application/vnd.google-apps.folder');
    assert.ok(owners.includes(metadata.appProperties?.imgstore_owner), 'Refuse cleanup outside disposable client ownership');
    assert.deepEqual(metadata.parents, [folder.parent_id || vars.GDRIVE_FOLDER_ID]);
    if (metadata.trashed) continue;
    const query = new URLSearchParams({ q: `'${folder.id}' in parents and trashed = false`, fields: 'files(id)', pageSize: '1', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    const children = await fetch('https://www.googleapis.com/drive/v3/files?' + query, { headers, signal: AbortSignal.timeout(30000) });
    assert.ok(children.ok); assert.equal((await children.json()).files.length, 0, 'Refuse to trash a nonempty test folder');
    const trashed = await fetch(endpoint, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }), signal: AbortSignal.timeout(30000) });
    assert.ok(trashed.ok, 'Could not trash disposable folder ' + folder.id);
    await trashed.arrayBuffer();
  }
}
