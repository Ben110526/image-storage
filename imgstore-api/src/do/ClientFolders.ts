import type { Env, FolderMetadata } from '../types';
import { resolveAccessToken } from '../lib/gdrive';
import { FolderError, parseFolderId, parseFolderName, parseFolderPath } from '../lib/folders';
import { AsyncMutex } from './AsyncMutex';

interface FolderRow extends Record<string, SqlStorageValue> {
  id: string; name: string; parent_id: string; path: string; depth: number; ready: number;
}
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_FOLDERS = 1000;
const MAX_DEPTH = 8;

/** Stored alongside quota in the DO addressed by stable user_id, never API key ID.
 * A separate mutex serializes folder I/O without blocking quota/session callbacks.
 */
export class ClientFolders {
  private mutex = new AsyncMutex();
  constructor(private storage: DurableObjectStorage, private env: Env) {
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS folder_scope (singleton INTEGER PRIMARY KEY CHECK(singleton = 1), client_id TEXT NOT NULL, shared_root TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS user_folders (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE, depth INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  async handle(body: { clientId: string; action: string; folder_id?: unknown; name?: unknown; path?: unknown }) {
    // Validate before provisioning anything in Drive.
    const folderId = parseFolderId(body.folder_id);
    const name = body.action === 'create' ? parseFolderName(body.name) : undefined;
    const pathSegments = body.action === 'ensure' ? parseFolderPath(body.path) : undefined;
    if (!['list', 'resolve', 'create', 'ensure'].includes(body.action)) throw new FolderError('INVALID_ACTION', 'Invalid folder operation.');
    return this.mutex.runExclusive(async () => {
      const sharedRoot = this.env.GDRIVE_FOLDER_ID;
      if (!sharedRoot) throw new FolderError('STORAGE_UNAVAILABLE', 'Shared Drive root is not configured.', 503);
      const scope = this.storage.sql.exec<{ client_id: string; shared_root: string }>('SELECT * FROM folder_scope').toArray()[0];
      if (scope && (scope.client_id !== body.clientId || scope.shared_root !== sharedRoot)) {
        throw new FolderError('FOLDER_SCOPE_CHANGED', 'The storage root changed. Ask the administrator to reconcile the folder configuration.', 409);
      }
      if (!scope) this.storage.sql.exec('INSERT INTO folder_scope VALUES (1, ?, ?)', body.clientId, sharedRoot);
      // Reject IDs outside this user's registry. Never accept arbitrary Drive IDs.
      let selected = folderId ? this.byId(folderId) : undefined;
      if (folderId && !selected) throw new FolderError('FOLDER_NOT_FOUND', 'Folder not found for this user.', 404);
      let root = this.byPath('');
      if (!root) root = await this.allocate(`user-${body.clientId}`, sharedRoot, '', 0);
      selected ||= root;
      await this.verifyChain(selected, body.clientId);
      if (body.action === 'list') {
        const folders = this.storage.sql.exec<FolderRow>('SELECT * FROM user_folders WHERE ready = 1 ORDER BY path').toArray();
        return { root: this.metadata(root), folders: folders.map(f => this.metadata(f)) };
      }
      if (body.action === 'create') {
        if (selected.depth >= MAX_DEPTH) throw new FolderError('FOLDER_DEPTH_LIMIT', `Folders support at most ${MAX_DEPTH} nested levels.`);
        const path = selected.path ? `${selected.path}/${name}` : name!;
        let child = this.byPath(path);
        if (!child) child = await this.allocate(name!, selected.id, path, selected.depth + 1);
        await this.ensure(child, body.clientId);
        return { folder: this.metadata(child) };
      }
      if (body.action === 'ensure') {
        // Get-or-create an entire nested path ("a/b/c") in one call. Each
        // existing level is reused; missing levels are allocated with
        // pre-generated IDs, so a retry after a network failure converges on
        // the same folders instead of duplicating them.
        let parent = root;
        await this.verifyChain(parent, body.clientId);
        for (const segment of pathSegments!) {
          const path = parent.path ? `${parent.path}/${segment}` : segment;
          let child = this.byPath(path);
          if (!child) child = await this.allocate(segment, parent.id, path, parent.depth + 1);
          await this.ensure(child, body.clientId);
          parent = child;
        }
        return { folder: this.metadata(parent) };
      }
      return { folder: this.metadata(selected) };
    });
  }

  private byId(id: string) { return this.storage.sql.exec<FolderRow>('SELECT * FROM user_folders WHERE id = ?', id).toArray()[0]; }
  private byPath(path: string) { return this.storage.sql.exec<FolderRow>('SELECT * FROM user_folders WHERE path = ?', path).toArray()[0]; }
  private metadata(row: FolderRow): FolderMetadata {
    return { id: row.id, name: row.name, parent_id: row.depth ? row.parent_id : null, path: row.path, is_root: row.depth === 0 };
  }

  private async drive(url: string, init: RequestInit = {}) {
    const token = await resolveAccessToken(this.env);
    return fetch(`https://www.googleapis.com/drive/v3/${url}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
  }

  private async allocate(name: string, parent: string, path: string, depth: number): Promise<FolderRow> {
    const count = this.storage.sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM user_folders').toArray()[0].count;
    if (count >= MAX_FOLDERS) throw new FolderError('FOLDER_LIMIT', `Each user can have at most ${MAX_FOLDERS} folders.`, 429);
    const response = await this.drive('files/generateIds?count=1&space=drive&type=files');
    if (!response.ok) throw new FolderError('FOLDER_UNAVAILABLE', 'Drive could not allocate a folder ID. Retry later.', 502);
    const id = (await response.json() as { ids?: string[] }).ids?.[0];
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) throw new FolderError('FOLDER_UNAVAILABLE', 'Drive returned an invalid folder ID.', 502);
    // Persist Google's pre-generated ID BEFORE creating the folder. On response
    // loss/restart, retry the same ID (409), never create duplicate user roots.
    this.storage.sql.exec('INSERT INTO user_folders (id, name, parent_id, path, depth) VALUES (?, ?, ?, ?, ?)', id, name, parent, path, depth);
    return { id, name, parent_id: parent, path, depth, ready: 0 };
  }

  private async verifyChain(folder: FolderRow, owner: string) {
    const chain: FolderRow[] = [folder];
    while (chain[0].depth > 0) {
      const parent = this.byId(chain[0].parent_id);
      if (!parent || chain.length > MAX_DEPTH) throw new FolderError('FOLDER_UNAVAILABLE', 'Invalid folder hierarchy.', 409);
      chain.unshift(parent);
    }
    // Check every ancestor: a folder moved/trashed outside the user's tree must
    // fail closed, not redirect this user's upload into somebody else's folder.
    for (const row of chain) await this.ensure(row, owner);
  }

  private async ensure(row: FolderRow, owner: string) {
    if (!row.ready) {
      const created = await this.drive('files?supportsAllDrives=true&fields=id', {
        method: 'POST', body: JSON.stringify({ id: row.id, name: row.name, mimeType: FOLDER_MIME,
          parents: [row.parent_id], appProperties: { imgstore_owner: owner } }),
      });
      if (!created.ok && created.status !== 409) throw new FolderError('FOLDER_UNAVAILABLE', 'Drive could not create the user folder. Retry later.', 502);
    }
    const response = await this.drive(`files/${row.id}?supportsAllDrives=true&fields=id,mimeType,parents,trashed,appProperties`);
    if (!response.ok) throw new FolderError('FOLDER_UNAVAILABLE', 'The folder is missing or inaccessible in Drive. Contact the administrator.', response.status === 404 ? 409 : 502);
    const actual = await response.json() as { id?: string; mimeType?: string; parents?: string[]; trashed?: boolean; appProperties?: Record<string, string> };
    if (actual.id !== row.id || actual.trashed || actual.mimeType !== FOLDER_MIME || actual.parents?.length !== 1 || actual.parents[0] !== row.parent_id || actual.appProperties?.imgstore_owner !== owner) {
      throw new FolderError('FOLDER_CHANGED', 'The folder was moved, trashed or changed outside ImgStore. Contact the administrator.', 409);
    }
    if (!row.ready) {
      this.storage.sql.exec('UPDATE user_folders SET ready = 1 WHERE id = ?', row.id);
      row.ready = 1;
    }
  }
}
