import type { Env, ServiceAccountCredentials } from '../types';

// Per-tenant access token cache (in-isolate memory)
const tenantTokenCache = new Map<string, { accessToken: string; expiresAt: number }>();

/**
 * Retrieve Google OAuth2 Access Token using User Refresh Token
 * Cached per tenant/userId in memory to avoid cross-tenant token pollution.
 */
export async function getUserOAuthAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  userId = 'default'
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(refreshToken));
  const cacheKey = `${clientId}:${userId}:${base64UrlEncode(new Uint8Array(tokenHash))}`;
  const cached = tenantTokenCache.get(cacheKey);

  if (cached && cached.expiresAt > now + 300) {
    return cached.accessToken;
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to refresh Google OAuth token (${tokenResponse.status}): ${errorText}`);
  }

  const data = (await tokenResponse.json()) as { access_token: string; expires_in: number };
  const expiresAt = now + (data.expires_in || 3600);

  tenantTokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt,
  });

  return data.access_token;
}

/**
 * Base64URL encode an ArrayBuffer or Uint8Array
 */
function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Convert string to UTF-8 Uint8Array
 */
function stringToUint8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Convert string to Base64URL
 */
function stringToBase64Url(str: string): string {
  return base64UrlEncode(stringToUint8(str));
}

/**
 * Convert standard base64 PEM to binary ArrayBuffer (PKCS#8)
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleanPem = pem
    .replace(/-----BEGIN[ A-Z0-9_-]+-----/g, '')
    .replace(/-----END[ A-Z0-9_-]+-----/g, '')
    .replace(/\s+/g, '');

  const raw = atob(cleanPem);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    view[i] = raw.charCodeAt(i);
  }
  return buffer;
}

/**
 * Import RSA private key into Web Crypto API
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const binaryKey = pemToArrayBuffer(pem);
  return await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

/**
 * Generate signed Google Service Account JWT
 */
async function createServiceAccountJwt(credentials: ServiceAccountCredentials): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const now = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = stringToBase64Url(JSON.stringify(header));
  const encodedClaimSet = stringToBase64Url(JSON.stringify(claimSet));
  const unsignedToken = `${encodedHeader}.${encodedClaimSet}`;

  const cryptoKey = await importPrivateKey(credentials.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    stringToUint8(unsignedToken)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${unsignedToken}.${encodedSignature}`;
}

/**
 * Retrieve Google OAuth2 Access Token using either:
 * 1. User OAuth2 Refresh Token (for personal Google One 5TB / Multi-tenant user)
 * 2. Service Account JWT (for Shared Drives)
 */
export async function getGoogleAccessToken(
  source: Env | string | ServiceAccountCredentials
): Promise<string> {
  // Check if source is Env with OAuth 2.0 User Refresh Token
  if (
    typeof source === 'object' &&
    'GOOGLE_REFRESH_TOKEN' in source &&
    source.GOOGLE_REFRESH_TOKEN &&
    (source.GOOGLE_SYSTEM_CLIENT_ID || source.GOOGLE_CLIENT_ID) &&
    (source.GOOGLE_SYSTEM_CLIENT_SECRET || source.GOOGLE_CLIENT_SECRET)
  ) {
    return getUserOAuthAccessToken(
      (source.GOOGLE_SYSTEM_CLIENT_ID || source.GOOGLE_CLIENT_ID)!,
      (source.GOOGLE_SYSTEM_CLIENT_SECRET || source.GOOGLE_CLIENT_SECRET)!,
      source.GOOGLE_REFRESH_TOKEN,
      'system'
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const cached = tenantTokenCache.get('service_account');

  // Return cached token if valid for at least 5 more minutes
  if (cached && cached.expiresAt > now + 300) {
    return cached.accessToken;
  }

  let credentials: ServiceAccountCredentials;
  if (typeof source === 'object' && 'client_email' in source && 'private_key' in source) {
    credentials = source as ServiceAccountCredentials;
  } else {
    const rawString =
      typeof source === 'object' && 'GOOGLE_CREDENTIALS' in source
        ? source.GOOGLE_CREDENTIALS || ''
        : (typeof source === 'string' ? source : '');

    let raw = rawString.trim();
    if (
      (raw.startsWith("'") && raw.endsWith("'")) ||
      (raw.startsWith('"') && raw.endsWith('"'))
    ) {
      raw = raw.slice(1, -1);
    }
    try {
      credentials = JSON.parse(raw);
    } catch {
      try {
        credentials = JSON.parse(raw.replace(/\r?\n/g, '\\n'));
      } catch (err) {
        throw new Error(`Invalid GOOGLE_CREDENTIALS JSON: ${(err as Error).message}`);
      }
    }
  }

  if (credentials.private_key && credentials.private_key.includes('\\n')) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  const jwt = await createServiceAccountJwt(credentials);

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to obtain Google access token: ${tokenResponse.status} ${errorText}`);
  }

  const data = (await tokenResponse.json()) as { access_token: string; expires_in: number };
  const expiresAt = now + (data.expires_in || 3600);

  tenantTokenCache.set('service_account', {
    accessToken: data.access_token,
    expiresAt,
  });

  return data.access_token;
}
