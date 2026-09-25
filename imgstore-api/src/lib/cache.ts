/**
 * Cloudflare Edge Cache API helper
 */

export async function getCachedResponse(request: Request): Promise<Response | null> {
  try {
    const cache = caches.default;
    const response = await cache.match(request);
    if (response) {
      // Add custom header to indicate cache hit
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-ImgStore-Cache', 'HIT');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }
    return null;
  } catch {
    // Cache may not be available in some local test environments
    return null;
  }
}

export async function setCachedResponse(
  request: Request,
  response: Response,
  ttlSeconds = 86400 // 24 hours default
): Promise<void> {
  try {
    const cache = caches.default;
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', `public, max-age=${ttlSeconds}, stale-while-revalidate=3600`);
    headers.set('X-ImgStore-Cache', 'MISS');

    const cacheableResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

    await cache.put(request, cacheableResponse);
  } catch {
    // Silently ignore cache storage error
  }
}

export async function purgeCache(request: Request): Promise<boolean> {
  try {
    const cache = caches.default;
    return await cache.delete(request);
  } catch {
    return false;
  }
}
