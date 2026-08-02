// src/services/aiFallback/fallbackManager.ts
import { config } from './config';
import { callGemini } from './providers/gemini';
import { getCachedResponse, setCachedResponse, generatePromptHash } from './cache';

let currentGeminiIndex = 0;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function generateResponse(payload: any, preferredModel: any = 'auto') {
  const promptHash = generatePromptHash(JSON.stringify({ payload, preferredModel }));
  const cached = getCachedResponse(promptHash);
  if (cached) {
    return cached;
  }

  const geminiKeys = config.providers.gemini.keys;
  let geminiModels = config.providers.gemini.models || ['gemini-3.6-flash'];
  
  if (Array.isArray(preferredModel)) {
    geminiModels = preferredModel;
  }
  
  const confirmedInvalidModels: string[] = [];

  for (const currentModel of geminiModels) {
    let attempts = 0;
    const maxAttempts = geminiKeys.length * config.retry.maxRetriesPerKey;

    const modelKeyHealth = geminiKeys.map(() => ({ cooldownUntil: 0, disabled: false }));
    let modelNotFound = false;

    while (attempts < maxAttempts && !modelNotFound) {
      const keyIndex = currentGeminiIndex;
      currentGeminiIndex = (currentGeminiIndex + 1) % geminiKeys.length;

      const health = modelKeyHealth[keyIndex];
      if (health.disabled || Date.now() < health.cooldownUntil) {
        attempts++;
        continue;
      }

      const apiKey = geminiKeys[keyIndex];
      const result = await callGemini(payload, apiKey, keyIndex, currentModel);

      if (result.success) {
        setCachedResponse(promptHash, result.response, config.cache.ttlSeconds);
        return result.response;
      }

      if (result.statusCode === 404) {
        modelNotFound = true;
        confirmedInvalidModels.push(currentModel);
      } else if (result.statusCode === 429) {
        health.cooldownUntil = Date.now() + (config.circuitBreaker.cooldownSeconds * 1000);
      } else if (result.statusCode === 401 || result.statusCode === 403) {
        health.disabled = true;
      } else if (result.statusCode === 400) {
        break;
      } else if (result.statusCode >= 500) {
        await wait(config.retry.baseDelayMs);
      }

      attempts++;
    }
  }

  const err: any = new Error('Tüm Gemini modellerinin kotaları doldu veya sunucu yanıt vermiyor.');
  err.invalidModels = confirmedInvalidModels;
  throw err;
}
