export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const OAUTH_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

/**
 * Generate Google OAuth 2.0 Authorization URL
 */
export function generateGoogleAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange Authorization Code for Google Tokens (access_token, refresh_token, id_token)
 */
export async function exchangeGoogleAuthCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${errorText}`);
  }

  return (await res.json()) as GoogleTokenResponse;
}

/**
 * Fetch Google User Profile via access_token
 */
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch Google user profile (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as {
    sub: string;
    email: string;
    name?: string;
    picture?: string;
  };

  return {
    sub: data.sub,
    email: data.email,
    name: data.name || data.email.split('@')[0],
    picture: data.picture,
  };
}
