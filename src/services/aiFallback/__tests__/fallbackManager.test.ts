import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateResponse } from '../fallbackManager';
import * as geminiProvider from '../providers/gemini';
import { config } from '../config';
import { clearCache } from '../cache';

vi.mock('../providers/gemini');

describe('AI Fallback Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    clearCache();
    config.providers.gemini.keys = ['test-gemini-key'];
  });

  it('should call Gemini first when auto is selected', async () => {
    vi.mocked(geminiProvider.callGemini).mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      response: { candidates: [{ content: { parts: [{ text: 'Gemini Reply' }] } }] },
      provider: 'gemini',
      keyIndex: 0,
      latencyMs: 100,
      estimatedCostUsd: 0
    });

    const res = await generateResponse('hello', 'auto');
    expect(res.candidates[0].content.parts[0].text).toBe('Gemini Reply');
    expect(geminiProvider.callGemini).toHaveBeenCalled();
  });
});
