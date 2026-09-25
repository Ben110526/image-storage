import type { UserSession, UserProfile } from '../types';

const SESSION_PREFIX = 'session:';
const USER_PREFIX = 'user:';
const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Generate a cryptographically secure random session token
 */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Store a new user session in Cloudflare KV
 */
export async function createSession(
  kv: KVNamespace,
  session: Omit<UserSession, 'createdAt' | 'expiresAt'>,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<string> {
  const token = generateSessionToken();
  const now = Math.floor(Date.now() / 1000);
  const fullSession: UserSession = {
    ...session,
    createdAt: now,
    expiresAt: now + ttlSeconds,
  };

  await kv.put(`${SESSION_PREFIX}${token}`, JSON.stringify(fullSession), {
    expirationTtl: ttlSeconds,
  });

  return token;
}

/**
 * Get an active user session by token
 */
export async function getSession(
  kv: KVNamespace,
  token: string
): Promise<UserSession | null> {
  if (!token) return null;
  const raw = await kv.get(`${SESSION_PREFIX}${token}`);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as UserSession;
    const now = Math.floor(Date.now() / 1000);
    if (session.expiresAt && session.expiresAt < now) {
      // Expired session
      await kv.delete(`${SESSION_PREFIX}${token}`);
      return null;
    }
    const latest = await getUserRecord(kv, session.userId);
    return latest ? { ...session, refreshToken: latest.refreshToken, folderId: latest.folderId, oauthClientId: latest.oauthClientId } : session;
  } catch {
    return null;
  }
}

/**
 * Delete a user session (logout)
 */
export async function deleteSession(
  kv: KVNamespace,
  token: string
): Promise<void> {
  if (!token) return;
  await kv.delete(`${SESSION_PREFIX}${token}`);
}

export interface StoredUserRecord {
  oauthClientId?: string;
  userId: string;
  email: string;
  name: string;
  picture?: string;
  refreshToken: string;
  folderId: string;
  updatedAt: number;
}

/**
 * Get permanent user record by userId
 */
export async function getUserRecord(
  kv: KVNamespace,
  userId: string
): Promise<StoredUserRecord | null> {
  const raw = await kv.get(`${USER_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUserRecord;
  } catch {
    return null;
  }
}

/**
 * Save or update permanent user record
 */
export async function saveUserRecord(
  kv: KVNamespace,
  user: StoredUserRecord
): Promise<void> {
  await kv.put(`${USER_PREFIX}${user.userId}`, JSON.stringify(user));
}

/**
 * Update folderId on existing user sessions if changed
 */
export async function updateSessionFolderId(
  kv: KVNamespace,
  token: string,
  folderId: string
): Promise<void> {
  const session = await getSession(kv, token);
  if (!session) return;
  session.folderId = folderId;
  const ttl = Math.max(session.expiresAt - Math.floor(Date.now() / 1000), 300);
  await kv.put(`${SESSION_PREFIX}${token}`, JSON.stringify(session), {
    expirationTtl: ttl,
  });
}
