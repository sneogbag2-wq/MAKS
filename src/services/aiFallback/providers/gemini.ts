// src/services/aiFallback/providers/gemini.ts

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const APP_SECRET = 'akgun_secret_key_2026';

export async function callGemini(payload: any, apiKey: string, keyIndex: number, modelName: string) {
  const startTime = Date.now();

  if (apiKey && (apiKey.startsWith('AQ.') || apiKey.includes('AQ.Ab8RN'))) {
    try {
      const userMsg = payload.rawUserMessage || payload.userMessage || payload.contents?.[payload.contents?.length - 1]?.parts?.[0]?.text || '';
      const declarations = payload.tools?.[0]?.functionDeclarations || payload.declarations || [];

      const backendRes = await fetch(`${BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-secret': APP_SECRET
        },
        body: JSON.stringify({
          userMessage: userMsg,
          conversationHistory: payload.conversationHistory || [],
          attachments: payload.attachments || [],
          declarations
        })
      });

      if (backendRes.ok && backendRes.body) {
        const reader = backendRes.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let toolCalls: any[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunkStr = decoder.decode(value);
          const lines = chunkStr.split('\n\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.type === 'text') fullText += parsed.text;
                if (parsed.type === 'tool_call') toolCalls = parsed.functionCalls;
              } catch (e) {}
            }
          }
        }

        const geminiParts: any[] = [];
        if (fullText) geminiParts.push({ text: fullText });
        if (toolCalls && toolCalls.length > 0) {
          toolCalls.forEach(tc => {
            geminiParts.push({
              functionCall: {
                name: tc.name,
                args: tc.args
              }
            });
          });
        }

        return {
          success: true,
          statusCode: 200,
          response: {
            candidates: [{ content: { parts: geminiParts } }]
          },
          provider: 'gemini',
          keyIndex,
          latencyMs: Date.now() - startTime,
          estimatedCostUsd: 0
        };
      } else {
        const errJson = await backendRes.json().catch(() => ({}));
        return {
          success: false,
          statusCode: backendRes.status,
          response: errJson.error || 'Backend Proxy API Error',
          provider: 'gemini',
          keyIndex,
          latencyMs: Date.now() - startTime,
          estimatedCostUsd: 0
        };
      }
    } catch (backendErr) {
      console.warn('Backend proxy call failed:', backendErr);
    }
  }

  try {
    let bodyData = typeof payload === 'object' ? { ...payload } : payload;
    if (typeof payload === 'string') {
      bodyData = { contents: [{ role: 'user', parts: [{ text: payload }] }] };
    } else if (bodyData.systemInstruction) {
      bodyData.system_instruction = bodyData.systemInstruction;
      delete bodyData.systemInstruction;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });

    const latencyMs = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        response: data.error?.message || 'Gemini API Error',
        provider: 'gemini',
        keyIndex,
        latencyMs,
        estimatedCostUsd: 0
      };
    }

    return {
      success: true,
      statusCode: 200,
      response: data,
      provider: 'gemini',
      keyIndex,
      latencyMs,
      estimatedCostUsd: 0
    };
  } catch (error: any) {
    return {
      success: false,
      statusCode: 500,
      response: error.message,
      provider: 'gemini',
      keyIndex,
      latencyMs: Date.now() - startTime,
      estimatedCostUsd: 0
    };
  }
}
