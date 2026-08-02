// src/services/aiFallback/cache.ts

export const responseCache = new Map<string, { response: any; expiresAt: number }>();

export function clearCache() {
  responseCache.clear();
}

export function getCachedResponse(promptHash: string) {
  const item = responseCache.get(promptHash);
  if (!item) return null;
  const now = Date.now();
  if (now > item.expiresAt) {
    responseCache.delete(promptHash);
    return null;
  }
  return item.response;
}

export function setCachedResponse(promptHash: string, response: any, ttlSeconds: number) {
  const expiresAt = Date.now() + (ttlSeconds * 1000);
  responseCache.set(promptHash, { response, expiresAt });
}

export function generatePromptHash(payload: any) {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
}
