import { DatabaseSync } from 'node:sqlite';

export function sqliteState() {
  const db = new DatabaseSync(':memory:'), values = new Map();
  return { db, storage: {
    sql: { exec(sql, ...args) {
      if (!args.length && sql.trim().split(';').filter(s => s.trim()).length > 1) {
        db.exec(sql); return { toArray: () => [] };
      }
      const rows = db.prepare(sql).all(...args);
      return { toArray: () => rows };
    } },
    transactionSync(fn) { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    async get(k) { return values.get(k); }, async put(k, v) { values.set(k, v); },
    async setAlarm(t) { values.set('alarm', t); }, async deleteAlarm() { values.delete('alarm'); },
  } };
}

/** Only mock Drive folder I/O. Return undefined for other Google operations. */
export function folderDrive() {
  const folders = new Map();
  let nextId = 0;
  const mock = { folders, creates: 0, loseCreateResponse: false, async handle(req) {
    const url = new URL(req.url);
    if (url.pathname === '/drive/v3/files/generateIds') return Response.json({ ids: ['folder_' + ++nextId] });
    if (url.pathname === '/drive/v3/files' && req.method === 'POST') {
      const folder = await req.json();
      if (folders.has(folder.id)) return Response.json({}, { status: 409 });
      folders.set(folder.id, { ...folder, trashed: false }); mock.creates++;
      if (mock.loseCreateResponse) { mock.loseCreateResponse = false; throw Error('lost folder create response'); }
      return Response.json({ id: folder.id });
    }
    const id = url.pathname.split('/').at(-1);
    if (url.pathname.startsWith('/drive/v3/files/') && req.method === 'GET' && url.searchParams.has('fields')) {
      return Response.json(folders.get(id) || {}, { status: folders.has(id) ? 200 : 404 });
    }
  } };
  return mock;
}
