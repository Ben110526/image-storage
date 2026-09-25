import { generateSessionToken } from './session';
import type { UserSession } from '../types';

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  prefix: string;
  createdAt: number;
  expiresAt: number;
}

export async function keyDigest(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function issueApiKey(kv: KVNamespace, userId: string, name: string) {
  const key = `isk_${generateSessionToken()}`;
  const id = await keyDigest(key);
  const now = Math.floor(Date.now() / 1000);
  const record: ApiKeyRecord = { id, userId, name, prefix: key.slice(0, 12), createdAt: now, expiresAt: now + 365 * 86400 };
  await kv.put(`apikey:${id}`, JSON.stringify(record), { expirationTtl: 365 * 86400 });
  await kv.put(`u:${userId}:key:${id}`, JSON.stringify(record), { expirationTtl: 365 * 86400 });
  return { key, ...record };
}

export async function resolveApiKey(kv: KVNamespace, key: string): Promise<UserSession | null> {
  if (!/^isk_[a-f0-9]{64}$/.test(key)) return null;
  const raw = await kv.get(`apikey:${await keyDigest(key)}`);
  if (!raw) return null;
  const record = JSON.parse(raw) as ApiKeyRecord;
  if (record.expiresAt <= Date.now() / 1000) return null;
  return { userId: record.userId, name: record.name, email: '', refreshToken: '', folderId: '', createdAt: record.createdAt, expiresAt: record.expiresAt };
}

export async function listAllKeys(kv: KVNamespace, prefix: string) {
  const keys: KVNamespaceListKey<unknown>[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix, cursor });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}
