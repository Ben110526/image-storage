import fs from 'node:fs';

// Legacy Desktop OAuth setup must never overwrite the web client or administrator key.
export function saveSystemOAuth(clientId, clientSecret, refreshToken) {
  const target = new URL('../.dev.vars', import.meta.url);
  let text = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  const values = { GOOGLE_SYSTEM_CLIENT_ID: clientId, GOOGLE_SYSTEM_CLIENT_SECRET: clientSecret, GOOGLE_REFRESH_TOKEN: refreshToken };
  for (const [key, value] of Object.entries(values)) {
    if (!value || /[\r\n]/.test(value)) throw new Error(`Invalid ${key}`);
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
  }
  fs.writeFileSync(target, text, { mode: 0o600 });
}
