import { ConversionError } from './conversion';

/**
 * Buffer a response body while enforcing a hard byte cap.
 *
 * Engines either cannot produce a stream of known length (Cloudflare Images
 * output carries no Content-Length) or must never be trusted at face value
 * (Google export). Reading incrementally means we stop at the cap and free the
 * upstream instead of materialising an unbounded body in the isolate.
 */
export async function readCapped(
  response: Response,
  maxBytes: number,
  code: string,
  message: string,
): Promise<Uint8Array> {
  const body = response.body;
  if (!body) return new Uint8Array(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        throw new ConversionError(code, message, 413);
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
