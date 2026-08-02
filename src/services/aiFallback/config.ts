// src/services/aiFallback/config.ts

export const config = {
  providers: {
    gemini: {
      keys: [
        import.meta.env.VITE_GEMINI_API_KEY,
        import.meta.env.VITE_GEMINI_API_KEY_1,
        import.meta.env.VITE_GEMINI_API_KEY_2,
        import.meta.env.VITE_GEMINI_API_KEY_3,
        import.meta.env.VITE_GEMINI_API_KEY_4,
        import.meta.env.VITE_GEMINI_API_KEY_5,
        import.meta.env.VITE_GEMINI_API_KEY_6,
        import.meta.env.VITE_GEMINI_API_KEY_7,
      ].filter((k): k is string => Boolean(k && typeof k === 'string' && k.trim() !== '')),
      models: ['gemini-3.6-flash', 'gemini-3.1-flash-lite', 'gemini-2.0-flash'],
    }
  },
  retry: {
    maxRetriesPerKey: 1,
    baseDelayMs: 500
  },
  cache: {
    ttlSeconds: 600
  },
  circuitBreaker: {
    cooldownSeconds: 60
  }
};
