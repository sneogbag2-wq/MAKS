import fs from 'fs';
import { generateResponse } from './src/services/aiFallback/fallbackManager.js';
import { buildSystemPrompt } from './src/services/aiContext.js';
import { getRelevantToolsForQuery } from './src/services/aiTools.js';

const envPath = 'c:/Users/monds/Desktop/test/panel/.env';
const env = fs.readFileSync(envPath, 'utf8');
const geminiKeyMatch = env.match(/VITE_GEMINI_API_KEY="([^"]+)"/);
// Hack to inject VITE_GEMINI_API_KEY into import.meta.env for config.js
globalThis.process = { env: { VITE_GEMINI_API_KEY: geminiKeyMatch[1] } };

// Wait, Vite uses import.meta.env
// The easiest way to test is to write a script that bypasses config.js or dynamically mocks it.
