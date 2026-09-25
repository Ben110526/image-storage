export const MAX_URL_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_UNKNOWN_URL_SIZE = 8 * 1024 * 1024;
export const URL_CHUNK_SIZE = 2 * 1024 * 1024;

export class RemoteFileError extends Error {
  readonly code: string;
  readonly status: 400 | 413 | 502;
  constructor(code: string, message: string, status: 400 | 413 | 502 = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function publicFileUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new RemoteFileError('INVALID_URL', 'Provide a valid public HTTP/HTTPS file URL.'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  // Use the public Workers fetch network, never IP literals, local names,
  // credentials or arbitrary service ports. Recheck every redirect target.
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port ||
      !host.includes('.') || host.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      /(^|\.)(localhost|local|internal|lan|home|onion)$/.test(host)) {
    throw new RemoteFileError('FORBIDDEN_URL', 'Only public HTTP/HTTPS hostnames on standard ports are supported.');
  }
  url.hash = '';
  return url;
}

export async function fetchRemoteFile(value: string, signal: AbortSignal): Promise<{ response: Response; url: URL }> {
  let url = publicFileUrl(value);
  for (let hop = 0; hop <= 5; hop++) {
    const response = await fetch(url.href, {
      redirect: 'manual', signal,
      headers: { Accept: 'image/*,video/*,audio/*,application/*,*/*;q=0.8' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      await response.body?.cancel();
      if (!location || hop === 5) throw new RemoteFileError('SOURCE_REDIRECT', 'The source has an invalid redirect or too many redirects.', 502);
      url = publicFileUrl(new URL(location, url).href);
      continue;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new RemoteFileError('SOURCE_UNAVAILABLE', `The source returned HTTP ${response.status}. Use a public, direct file link; login/hotlink-protected sources cannot be imported.`, 502);
    }
    return { response, url };
  }
  throw new RemoteFileError('SOURCE_REDIRECT', 'Too many redirects.', 502);
}

/** Unknown-length sources are buffered only up to 8 MiB; known sizes are streamed. */
export async function readUnknownFile(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UNKNOWN_URL_SIZE) {
        throw new RemoteFileError('SOURCE_SIZE_UNKNOWN', 'This source does not provide its file size. Import is limited to 8 MB for such links; use a local file for larger uploads.', 413);
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return bytes;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Hold the final chunk until EOF so a false Content-Length cannot publish a truncated file. */
export async function* remoteChunks(body: ReadableStream<Uint8Array>, total: number): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let received = 0, filled = 0;
  let chunk = new Uint8Array(Math.min(URL_CHUNK_SIZE, total));
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (received + value.byteLength > total) throw new RemoteFileError('SOURCE_SIZE_MISMATCH', 'The source size changed during download.', 502);
      let offset = 0;
      while (offset < value.byteLength) {
        const count = Math.min(chunk.length - filled, value.byteLength - offset);
        chunk.set(value.subarray(offset, offset + count), filled);
        filled += count;
        received += count;
        offset += count;
        if (filled === chunk.length && received < total) {
          yield chunk;
          chunk = new Uint8Array(Math.min(URL_CHUNK_SIZE, total - received));
          filled = 0;
        }
      }
    }
    if (received !== total) throw new RemoteFileError('SOURCE_SIZE_MISMATCH', 'The source download ended before the complete file arrived.', 502);
    if (filled) yield chunk.subarray(0, filled);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
