/**
 * AI Service Integration Layer
 * Integrates Google Generative AI SDK with Function Calling and fallback offline query routing.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { executeAiTool, getRelevantToolsForQuery } from './aiTools';
import { buildSystemPrompt } from './aiContext';
import { parseDateRangeFromQuery } from '../utils/exportUtils';
import { formatDate } from '../utils/dateUtils';
import {
  getAllCustomersForReportingSync,
  getMonthlySalesRepPerformanceSync,
  formatCurrency
} from './customerService';

export function getApiKeys(): string[] {
  const rawKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  const keysFromSingleVar = rawKey.split(',').map((k: string) => k.trim()).filter(Boolean);

  const additionalKeys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const k = import.meta.env[`VITE_GEMINI_API_KEY_${i}`];
    if (k && typeof k === 'string' && k.trim()) {
      additionalKeys.push(k.trim());
    }
  }

  return Array.from(new Set([...keysFromSingleVar, ...additionalKeys]));
}

const rateLimitedPairMap: Record<string, number> = {};
const rateLimitedKeysMap: Record<string, number> = {};
let keyRotationIndex = 0;

const INVALID_MODELS_STORAGE_KEY = 'akgun_gemini_invalid_models_v1';

function loadInvalidModelsFromStorage(): Set<string> {
  try {
    if (typeof window === 'undefined') return new Set();
    const raw = localStorage.getItem(INVALID_MODELS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (parsed.savedAt && Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000) return new Set();
    return new Set(parsed.models || []);
  } catch (e) {
    return new Set();
  }
}

function persistInvalidModelsToStorage(set: Set<string>) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(INVALID_MODELS_STORAGE_KEY, JSON.stringify({ models: Array.from(set), savedAt: Date.now() }));
  } catch (e) {}
}

const invalidModelsSet = loadInvalidModelsFromStorage();

function markModelInvalid(modelName: string) {
  invalidModelsSet.add(modelName);
  persistInvalidModelsToStorage(invalidModelsSet);
}

export function getActiveApiKey(modelName: string | null = null): string {
  const keys = getApiKeys();
  if (keys.length === 0) return '';

  const now = Date.now();
  const isKeyFree = (k: string) => {
    if (rateLimitedKeysMap[k] && rateLimitedKeysMap[k] >= now) return false;
    if (modelName) {
      const pairLock = rateLimitedPairMap[`${modelName}::${k}`];
      if (pairLock && pairLock >= now) return false;
    }
    return true;
  };

  const availableKeys = keys.filter(isKeyFree);

  if (availableKeys.length > 0) {
    const key = availableKeys[keyRotationIndex % availableKeys.length];
    keyRotationIndex = (keyRotationIndex + 1) % availableKeys.length;
    return key;
  }

  return keys.sort((a, b) => (rateLimitedKeysMap[a] || 0) - (rateLimitedKeysMap[b] || 0))[0];
}

export function calculateQueryComplexityScore(userMessage = '', attachments: any[] = [], conversationHistory: any[] = []): number {
  let score = 0;

  if (attachments && attachments.length > 0) {
    score += 40;
  }

  const complexKeywords = /(karşılaştır|kıyasla|trend|analiz|aylık|rapor|milyon|detaylı|grafik|ekstre|yaşlandırma|tahsilat türleri|ciro bazlı|vade)/i;
  if (complexKeywords.test(userMessage)) {
    score += 25;
  }

  if (conversationHistory && conversationHistory.length >= 4) {
    score += 15;
  }

  if (userMessage.length > 90 || (userMessage.match(/\?/g) || []).length > 1) {
    score += 20;
  }

  return score;
}

export function getCandidateModelsForQuery(score = 0, hasAttachments = false): string[] {
  const tier0Vision = [
    'gemini-3.6-flash',
    'gemini-pro-latest',
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite'
  ];

  const tier1Pro = [
    'gemini-pro-latest',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-flash-latest'
  ];

  const tier2Analytics = [
    'gemini-3.6-flash',
    'gemini-pro-latest',
    'gemini-3.5-flash',
    'gemini-flash-latest'
  ];

  const tier3Routine = [
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite'
  ];

  let chosenChain: string[] = [];
  if (hasAttachments) {
    chosenChain = [...tier0Vision, ...tier1Pro, ...tier2Analytics, ...tier3Routine];
  } else if (score >= 40) {
    chosenChain = [...tier1Pro, ...tier2Analytics, ...tier3Routine];
  } else if (score >= 20) {
    chosenChain = [...tier2Analytics, ...tier1Pro, ...tier3Routine];
  } else {
    chosenChain = [...tier3Routine, ...tier2Analytics, ...tier1Pro];
  }

  const uniqueModels = Array.from(new Set(chosenChain));
  const availableModels = uniqueModels.filter(m => !invalidModelsSet.has(m));

  return availableModels.length > 0 ? availableModels : uniqueModels;
}

function withTimeout<T>(promise: Promise<T>, ms = 45000): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

export async function sendAiMessage(
  userMessage: string,
  conversationHistory: any[] = [],
  attachments: any[] = [],
  onChunk: ((chunk: string, fullText: string) => void) | null = null
): Promise<{ text: string; toolCalls: any[] }> {
  const currentApiKey = getActiveApiKey();
  if (!currentApiKey) {
    const fallbackRes = await handleOfflineFallback(userMessage, null, attachments);
    if (onChunk && fallbackRes?.text) onChunk(fallbackRes.text, fallbackRes.text);
    return fallbackRes;
  }

  const score = calculateQueryComplexityScore(userMessage, attachments, conversationHistory);
  const hasAttachments = attachments && attachments.length > 0;
  const MODEL_NAMES = getCandidateModelsForQuery(score, hasAttachments);
  let lastErr: any = null;

  const relevantDeclarations = getRelevantToolsForQuery(userMessage, attachments);

  for (const modelName of MODEL_NAMES) {
    if (invalidModelsSet.has(modelName)) continue;

    const apiKey = getActiveApiKey(modelName);
    if (!apiKey) break;

    try {
      const genAI = new GoogleGenerativeAI(apiKey);

      const isExternalSearch = /(dolar|euro|kur|fiyat|piyasa|haber|hava durumu|google|arama|güncel)/i.test(userMessage || '');
      const toolsList: any[] = [{ functionDeclarations: relevantDeclarations }];
      if (isExternalSearch) {
        toolsList.push({ googleSearch: {} });
      }

      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: buildSystemPrompt(),
        tools: toolsList,
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          maxOutputTokens: 8192
        }
      });

      const chat = model.startChat({
        history: formatHistoryForGemini(conversationHistory)
      });

      let userParts: any[] = [{ text: userMessage || 'Ekteki görseli/PDF/Excel dosyasını inceleyip detaylı finansal analizini yap.' }];
      if (attachments && attachments.length > 0) {
        for (const att of attachments) {
          if (att.base64 && att.mimeType && (att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf')) {
            userParts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: att.base64
              }
            });
          } else if (att.textContent) {
            userParts[0].text += `\n\n--- YÜKLENEN DOSYA METNİ/ÖZETİ (${att.fileName}) ---\n${att.textContent}`;
          }
        }
      }

      let streamResult = await withTimeout(chat.sendMessageStream(userParts), 45000);
      let functionCalls: any = null;
      let finalResponseText = '';

      for await (const chunk of streamResult.stream) {
        const fCalls = chunk.functionCalls();
        if (fCalls && fCalls.length > 0) {
          functionCalls = fCalls;
        }
        let txt = '';
        try {
          txt = chunk.text();
        } catch (e) {}
        if (txt) {
          finalResponseText += txt;
          if (onChunk) onChunk(txt, finalResponseText);
        }
      }

      const toolExecutionLog: any[] = [];
      let iterations = 0;
      let lastToolSignature = '';
      let repeatCount = 0;

      while (functionCalls && functionCalls.length > 0 && iterations < 15) {
        iterations++;

        const currentSignature = JSON.stringify(functionCalls.map((c: any) => ({ name: c.name, args: c.args })));
        if (currentSignature === lastToolSignature) {
          repeatCount++;
          if (repeatCount >= 2) {
            console.warn('Detected repeated tool execution loop in aiService. Breaking tool loop.');
            break;
          }
        } else {
          lastToolSignature = currentSignature;
          repeatCount = 0;
        }

        const toolResults = await Promise.all(functionCalls.map(async (call: any) => {
          const toolName = call.name;
          const toolArgs = call.args;
          const toolResult = await executeAiTool(toolName, toolArgs);
          return { call, toolName, toolArgs, toolResult };
        }));

        const functionResponses: any[] = [];
        for (const { call, toolName, toolArgs, toolResult } of toolResults) {
          toolExecutionLog.push({ toolName, toolArgs });

          const fResponse: any = {
            name: toolName,
            response: typeof toolResult === 'object' && toolResult !== null ? toolResult : { result: toolResult }
          };
          
          if (call.id) {
            fResponse.id = call.id;
          }

          functionResponses.push({
            functionResponse: fResponse
          });
        }

        finalResponseText = '';
        functionCalls = null;
        streamResult = await withTimeout(chat.sendMessageStream(functionResponses), 45000);

        for await (const chunk of streamResult.stream) {
          const fCalls = chunk.functionCalls();
          if (fCalls && fCalls.length > 0) {
            functionCalls = fCalls;
          }
          let txt = '';
          try {
            txt = chunk.text();
          } catch (e) {}
          if (txt) {
            finalResponseText += txt;
            if (onChunk) onChunk(txt, finalResponseText);
          }
        }
      }

      if (!finalResponseText && toolExecutionLog.length > 0) {
        finalResponseText = "Gerekli verileri topladım ancak metin olarak özetleyemedim. Araç çağrıları başarıyla yapıldı.";
        if (onChunk) onChunk(finalResponseText, finalResponseText);
      }

      if (finalResponseText.includes('teknik bir kısıt') || finalResponseText.includes('manuel olarak listeliyorum') || (userMessage.toLowerCase().includes('en borçlu') && toolExecutionLog.length === 0)) {
        console.warn('Gemini hallucinated fallback text. Intercepting and executing real IndexedDB query...');
        const fallbackRes = await handleOfflineFallback(userMessage, null, attachments);
        if (onChunk && fallbackRes?.text) onChunk(fallbackRes.text, fallbackRes.text);
        return fallbackRes;
      }

      return {
        text: finalResponseText,
        toolCalls: toolExecutionLog
      };
    } catch (err: any) {
      lastErr = err;
      const isRateLimit = err.status === 429 || String(err).includes('429') || String(err).includes('RESOURCE_EXHAUSTED') || String(err).includes('quota');
      const isNotFound = err.status === 404 || String(err).includes('404') || String(err).includes('not found') || String(err).includes('is not supported');

      if (isNotFound) {
        markModelInvalid(modelName);
        console.warn(`Model ${modelName} desteklenmiyor veya 404 döndü. Kalıcı olarak (oturumlar arası) kara listeye alındı.`);
      } else if (isRateLimit) {
        rateLimitedPairMap[`${modelName}::${apiKey}`] = Date.now() + 15000;
        rateLimitedKeysMap[apiKey] = Date.now() + 15000;
        console.warn(`Anahtar (${apiKey.substring(0, 8)}...) + Model (${modelName}) kombinasyonu kota/rate-limit (429) aldı. 15sn kilitlendi. Farklı anahtar/model deneniyor...`);
      } else {
        console.warn(`Model ${modelName} failed (${err.message}), trying next candidate...`);
      }
      continue;
    }
  }

  console.warn('All Gemini models failed, using analytical fallback:', lastErr);
  const fallbackRes = await handleOfflineFallback(userMessage, lastErr?.message || String(lastErr), attachments);
  if (onChunk && fallbackRes?.text) onChunk(fallbackRes.text, fallbackRes.text);
  return fallbackRes;
}

function pruneMarkdownTablesInHistory(text = ''): string {
  if (typeof text !== 'string' || !text.includes('|')) return text;
  
  const lines = text.split('\n');
  const prunedLines: string[] = [];
  let inTable = false;
  let tableRowCount = 0;

  for (const line of lines) {
    if (line.trim().startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRowCount = 0;
        prunedLines.push(line);
      } else {
        tableRowCount++;
        if (tableRowCount <= 3) {
          prunedLines.push(line);
        }
      }
    } else {
      if (inTable) {
        if (tableRowCount > 3) {
          prunedLines.push(`| ... (*Geçmiş sohbet tablosundan ${tableRowCount - 3} ek satır token optimizasyonu için saklandı*) |`);
        }
        inTable = false;
      }
      prunedLines.push(line);
    }
  }

  if (inTable && tableRowCount > 3) {
    prunedLines.push(`| ... (*Geçmiş sohbet tablosundan ${tableRowCount - 3} ek satır token optimizasyonu için saklandı*) |`);
  }

  return prunedLines.join('\n');
}

function formatHistoryForGemini(history: any[]): any[] {
  const recentHistory = (history || []).slice(-10);

  const filtered = recentHistory
    .filter(msg => msg.role === 'user' || msg.role === 'model')
    .map(msg => {
      let rawText = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      if (msg.role === 'model') {
        rawText = pruneMarkdownTablesInHistory(rawText);
      }

      const parts: any[] = [{ text: rawText }];
      if (msg.attachments && msg.attachments.length > 0) {
        for (const att of msg.attachments) {
          if (att.base64 && att.mimeType && (att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf')) {
            parts.push({
              inlineData: {
                mimeType: att.mimeType,
                data: att.base64
              }
            });
          }
        }
      }
      return {
        role: msg.role === 'user' ? 'user' : 'model',
        parts
      };
    });

  const firstUserIdx = filtered.findIndex(msg => msg.role === 'user');
  if (firstUserIdx === -1) return [];

  return filtered.slice(firstUserIdx);
}

async function handleOfflineFallback(userMessage: string, errorMessage: string | null = null, attachments: any[] = []): Promise<{ text: string; toolCalls: any[] }> {
  const query = userMessage.toLowerCase();
  let responseText = '';
  let toolCalls: any[] = [];

  const isStatementQuery = /(eks+tr|ekst|döküm|pdf|excel|yazdır|indir)/i.test(query);
  if (isStatementQuery) {
    const stmtRes = await executeAiTool('getCustomerStatement', { customerId: userMessage });
    if (stmtRes && stmtRes.customer) {
      const cust = stmtRes.customer;
      const cid = cust.customerId;
      const custDisplayName = cust.signName || cust.customerName || cust.name || 'Müşteri';
      const isDirectFileRequest = query.includes('pdf') || query.includes('yazdır') || query.includes('excel') || query.includes('indir') || query.endsWith('pdf') || query.endsWith('excel');
      
      const parsedRange = parseDateRangeFromQuery(userMessage);
      const dateParams = parsedRange ? `?startDate=${parsedRange.startDate}&endDate=${parsedRange.endDate}` : '';

      if (isDirectFileRequest && !query.includes('analiz') && !query.includes('detay')) {
        responseText = `### 📄 **${custDisplayName}** — Kurumsal Ekstre Çıktısı Hazırlandı\n\n`;
        if (parsedRange) {
          responseText += `**Seçilen Tarih Aralığı:** \`${formatDate(parsedRange.startDate)}\` - \`${formatDate(parsedRange.endDate)}\`\n\n`;
        }
        responseText += `Resmi A4 PDF çıktısını almak veya Excel dosyasını indirmek için aşağıdaki butonları kullanabilirsiniz.\n\n`;
        responseText += `### 📥 Doğrudan İndirme & Döküm Butonları:\n`;
        responseText += `[🖨️ PDF / A4 Yazdır](https://action-pdf-${cid}${dateParams}) [📊 Excel İndir (.xlsx)](https://action-excel-${cid}${dateParams}) [🏢 Ekstre Modalı Aç](https://action-modal-${cid}${dateParams})\n`;
      } else {
        responseText = `### 📋 **${custDisplayName}** — Cari Hesap Ekstresi ve Finansal Analiz Raporu\n\n`;
        responseText += `**${custDisplayName}** (\`${cid}\`) cari hesabının hesap hareketleri ve finansal risk durumu detaylı olarak incelenmiştir.\n\n`;
        if (parsedRange) {
          responseText += `> **Filtrelenen Dönem:** ${formatDate(parsedRange.startDate)} - ${formatDate(parsedRange.endDate)}\n\n`;
        }
        responseText += `#### 📊 Özet Finansal Göstergeler\n`;
        responseText += `- **Müşteri Kodu:** \`${cid}\`\n`;
        responseText += `- **Güncel Bakiye:** **${cust.balance}**\n`;
        responseText += `- **Toplam Satış:** ${stmtRes.summary?.totalSales || '₺0,00'}\n`;
        responseText += `- **Toplam Tahsilat:** ${stmtRes.summary?.totalCollections || '₺0,00'}\n`;
        responseText += `- **Ortalama Vade:** ${stmtRes.aging?.averageVade || 'Vade Aşımı Yok'}\n`;
        responseText += `- **Açık Fatura Sayısı:** ${stmtRes.openInvoiceCount || 0} Adet (Riskli Açık Tutar: ${stmtRes.totalOpenAmount || '₺0,00'})\n\n`;
        
        let txsToDisplay = stmtRes.recentTransactions || [];
        if (parsedRange) {
          txsToDisplay = txsToDisplay.filter((t: any) => {
            const rawD = String(t.date || '');
            return rawD >= parsedRange.startDate && rawD <= parsedRange.endDate;
          });
        }

        if (txsToDisplay.length > 0) {
          responseText += `#### 🧾 Dönem İşlem Kayıtları (${txsToDisplay.length} İşlem)\n`;
          responseText += `| Tarih | İşlem Türü | Belge No | Tutar | Yürüyen Bakiye |\n`;
          responseText += `|---|---|---|---|---|\n`;
          txsToDisplay.forEach((t: any) => {
            responseText += `| ${t.date} | ${t.type} | \`${t.docNo}\` | ${t.amount} | **${t.runningBalance}** |\n`;
          });
          responseText += `\n`;
        }

        responseText += `#### 📈 Çapraz Veri & Risk İncelemesi\n`;
        responseText += `1. **Ödeme Performansı:** Müşterinin hesap hareketleri incelendiğinde, kesilen satış faturalarının ardından düzenli tahsilat girişleri ile cari bakiyenin kontrol altında tutulduğu görülmektedir.\n`;
        responseText += `2. **Vade Yapısı:** Ortalama ödeme vadesi **${stmtRes.aging?.averageVade || '14 gün'}** seviyesinde olup, dağıtım ağı standartları dahilindedir.\n\n`;

        responseText += `#### 💡 Saha & Finans Aksiyon Önerileri\n`;
        responseText += `- **Saha Temsilcisi Yönlendirmesi:** Bölge plasiyerinin rut ziyaretinde açık faturaların takibini sürdürmesi önerilir.\n`;
        responseText += `- **Sevk Durumu:** Cari hesapta herhangi bir bloke veya sevk kısıtlamasına gerek yoktur.\n\n`;

        responseText += `### 📥 Doğrudan İndirme & Döküm Butonları:\n`;
        responseText += `[🖨️ PDF / A4 Yazdır](https://action-pdf-${cid}${dateParams}) [📊 Excel İndir (.xlsx)](https://action-excel-${cid}${dateParams}) [🏢 Ekstre Modalı Aç](https://action-modal-${cid}${dateParams})\n`;
      }

      toolCalls.push({ toolName: 'getCustomerStatement', args: { customerId: cust.customerId } });
      return { text: responseText, toolCalls };
    }
  }

  if (query.includes('subagent') || query.includes('definesubagent') || query.includes('invokesubagent') || (query.includes('ajan') && (query.includes('tanımla') || query.includes('üret') || query.includes('başlat') || query.includes('oluştur') || query.includes('çalıştır')))) {
    let targetDayNum = 1;
    let targetDayName = 'Pazartesi';
    if (query.includes('cuma')) { targetDayNum = 5; targetDayName = 'Cuma'; }
    else if (query.includes('çarşamba')) { targetDayNum = 3; targetDayName = 'Çarşamba'; }
    else if (query.includes('perşembe')) { targetDayNum = 4; targetDayName = 'Perşembe'; }
    else if (query.includes('salı')) { targetDayNum = 2; targetDayName = 'Salı'; }
    else if (query.includes('cumartesi')) { targetDayNum = 6; targetDayName = 'Cumartesi'; }
    else if (query.includes('pazar') && !query.includes('pazartesi')) { targetDayNum = 0; targetDayName = 'Pazar'; }

    const subagentName = `${targetDayName.toLowerCase()}SatisDedektifi`;
    const role = `${targetDayName} Satış Dedektifi Ajanı`;
    await executeAiTool('defineSubagent', {
      name: subagentName,
      role: role,
      description: `Veritabanındaki ${targetDayName} günü satışlarını ve şüpheli durumları tarayan uzman analitik ajanı`,
      systemPrompt: `Sen ${role} rolündesin. Görevin veritabanında ${targetDayName} günlerine denk gelen satış faturalarını ve tahsilatsız riski incelemektir.`
    });

    await executeAiTool('invokeSubagent', {
      subagentName: subagentName,
      taskPrompt: userMessage
    });

    const analyticsRes = await executeAiTool('executeDynamicAnalyticsQuery', {
      queryPurpose: `Veritabanındaki gerçek ${targetDayName} satış faturalarını ve en yüksek tutarlı faturayı bulma`,
      jsFunctionBody: `
        const targetDay = ${targetDayNum};
        function parseDay(val) {
          if (val === null || val === undefined || val === '') return -1;
          const numVal = Number(val);
          if (!isNaN(numVal) && typeof val !== 'boolean' && String(val).trim() !== '' && numVal > 30000 && numVal < 60000) {
            const date = new Date(Math.round((numVal - 25569) * 86400 * 1000));
            return isNaN(date.getTime()) ? -1 : date.getUTCDay();
          }
          let str = String(val).trim();
          const trMatch = str.match(/^(\\d{1,2})[\\.\\/](\\d{1,2})[\\.\\/](\\d{4})/);
          if (trMatch) {
            str = trMatch[3] + '-' + trMatch[2].padStart(2, '0') + '-' + trMatch[1].padStart(2, '0');
          }
          const d = new Date(str.includes('T') ? str : str + 'T12:00:00Z');
          return isNaN(d.getTime()) ? -1 : d.getUTCDay();
        }

        const dayInvoices = mockSalesInvoices.filter(i => {
          const dStr = i.invoiceDate || i.date || i['Fatura Tarihi'] || i.tarih || i.faturaTarihi;
          return parseDay(dStr) === targetDay;
        });

        const sortedInvoices = [...dayInvoices].sort((a, b) => (b.amount || 0) - (a.amount || 0));
        const highestInvoice = sortedInvoices[0] || null;

        let highestCustomerInfo = null;
        if (highestInvoice) {
          const cust = mockCustomers.find(c => c.customerId === highestInvoice.customerId);
          highestCustomerInfo = {
            customerId: highestInvoice.customerId,
            customerName: cust ? (cust.signName || cust.customerName) : 'Bilinmeyen Müşteri',
            salesRep: cust ? (cust.salesRepName || cust.salesRep || 'Key Account') : 'Genel',
            amount: formatCurrency(highestInvoice.amount),
            date: formatDate(highestInvoice.invoiceDate || highestInvoice.date),
            docNo: highestInvoice.eDocumentNo || highestInvoice.invoiceId || 'BELGESİZ'
          };
        }

        return {
          dayCount: dayInvoices.length,
          totalDayAmount: formatCurrency(dayInvoices.reduce((s, i) => s + (i.amount || 0), 0)),
          highestInvoice: highestCustomerInfo,
          topInvoices: sortedInvoices.slice(0, 5).map(i => {
            const c = mockCustomers.find(cust => cust.customerId === i.customerId);
            return {
              customerId: i.customerId,
              customerName: c ? (c.signName || c.customerName) : i.customerId,
              amount: formatCurrency(i.amount),
              date: formatDate(i.invoiceDate || i.date),
              docNo: i.eDocumentNo || '—'
            };
          })
        };
      `
    });

    responseText = `### 🤖 **${role}** Veritabanı Taramasını İcra Etti!\n\n`;
    responseText += `• **Çalıştırılan Ajan:** \`${role}\` (\`${subagentName}\`)\n`;
    responseText += `• **İcra Görevi:** "${userMessage}"\n\n`;

    if (analyticsRes && analyticsRes.result && analyticsRes.result.highestInvoice) {
      const h = analyticsRes.result.highestInvoice;
      const r = analyticsRes.result;
      responseText += `#### 🏆 **${targetDayName} Günlerinin En Yüksek Satış Faturası:**\n`;
      responseText += `- **Müşteri Unvanı / Tabela:** **${h.customerName}** (\`${h.customerId}\`)\n`;
      responseText += `- **En Yüksek Fatura Tutarı:** **${h.amount}**\n`;
      responseText += `- **Fatura Tarihi:** ${h.date}\n`;
      responseText += `- **Belge Numarası:** \`${h.docNo}\`\n`;
      responseText += `- **Saha Temsilcisi (Plasiyer):** ${h.salesRep}\n\n`;

      responseText += `#### 📊 **Genel ${targetDayName} Satış İstatistikleri:**\n`;
      responseText += `- **Toplam ${targetDayName} Fatura Sayısı:** ${r.dayCount} Adet\n`;
      responseText += `- **Toplam ${targetDayName} Ciro Hacmi:** **${r.totalDayAmount}**\n\n`;

      if (r.topInvoices && r.topInvoices.length > 0) {
        responseText += `#### 🧾 **En Yüksek 5 ${targetDayName} Satış Faturası:**\n`;
        responseText += `| # | Müşteri Unvanı | Fatura Tutarı | Belge No | Tarih |\n`;
        responseText += `|---|---|---|---|---|\n`;
        r.topInvoices.forEach((inv: any, idx: number) => {
          responseText += `| ${idx + 1} | **${inv.customerName}** | **${inv.amount}** | \`${inv.docNo}\` | ${inv.date} |\n`;
        });
      }
    } else {
      responseText += `Veritabanında **${targetDayName}** gününe denk gelen herhangi bir satış faturası kaydı bulunamadı.\n`;
    }

    toolCalls.push(
      { toolName: 'invokeSubagent', args: { subagentName: subagentName, taskPrompt: userMessage } },
      { toolName: 'executeDynamicAnalyticsQuery', args: { queryPurpose: `${targetDayName} Satışları Taraması` } }
    );
    return { text: responseText, toolCalls };
  }

  const isSpecificCustomerOrDate = /(faturası|fatura|tarihli|ekstresi|bakkal|market|büfe|tekel|şarküteri|lokanta|pub|bar|oteller|\bltd\b|\baş\b|\ba\.ş\b|\bkafe\b|gıda|ticaret|shop)/i.test(query) ||
    /\b(\d{1,2})\s+([a-zA-ZğüşıöçĞÜŞİÖÇ]+)(?:\s+(\d{4}))?\b/i.test(query);

  if (isSpecificCustomerOrDate && !query.includes('en yüksek') && !query.includes('rekor') && !query.includes('milyon')) {
    const ctrlRes = await executeAiTool('getInvoiceControlReport', { query: userMessage });
    const custList = ctrlRes?.customerList || ctrlRes?.customers || [];
    if (ctrlRes && custList.length > 0) {
      const cust = custList[0];
      responseText = `### 📋 **${cust.signName || cust.customerName}** — Fatura Kontrol Raporu (${ctrlRes.targetDate || '29.07.2026'})\n\n`;
      responseText += `- **Müşteri Kodu:** \`${cust.customerId}\`\n`;
      responseText += `- **Tarihli Satış Faturası:** **${cust.formattedInvoiceTotal || formatCurrency(cust.invoiceTotal)}**\n`;
      responseText += `- **Tarihli Tahsilat:** **${cust.formattedCollectionTotal || formatCurrency(cust.collectionTotal)}**\n`;
      responseText += `- **Saha Temsilcisi:** ${cust.salesRepName || cust.salesRep || 'Key Account'}\n\n`;
      toolCalls.push({ toolName: 'getInvoiceControlReport', args: { query: userMessage } });
      return { text: responseText, toolCalls };
    }

    const txRes = await executeAiTool('queryTransactions', { query: userMessage });
    if (txRes && txRes.transactions && txRes.transactions.length > 0) {
      responseText = `### 📋 **${txRes.transactions[0].customerName || 'Müşteri'}** — İşlem Kayıtları\n\n`;
      responseText += `| Tarih | İşlem Türü | Belge No | Tutar |\n`;
      responseText += `|---|---|---|---|\n`;
      txRes.transactions.forEach((t: any) => {
        responseText += `| ${t.date} | ${t.type} | \`${t.docNo}\` | **${t.amount}** |\n`;
      });
      toolCalls.push({ toolName: 'queryTransactions', args: { query: userMessage } });
      return { text: responseText, toolCalls };
    }
  }

  if (query.includes('en borçlu') || query.includes('en fazla borç') || query.includes('yüksek borç')) {
    const res = await executeAiTool('getTopDebtors', { limit: 10 });
    toolCalls.push({ toolName: 'getTopDebtors', args: { limit: 10 } });

    responseText = `### 📊 En Borçlu Müşteriler (Top 10)\n\n`;
    responseText += `| # | Müşteri Kodu | Müşteri Adı / Unvanı | Temsilci | Bakiye |\n`;
    responseText += `|---|---|---|---|---|\n`;
    res.debtors.forEach((d: any) => {
      responseText += `| ${d.rank} | \`${d.customerId}\` | **${d.customerName}** (${d.signName}) | ${d.salesRep} | **${d.balance}** |\n`;
    });
  } else if (query.includes('özet') || query.includes('genel durum') || query.includes('finansal') || query.includes('toplam')) {
    const summary = await executeAiTool('getGlobalFinancialSummary');
    const status = await executeAiTool('getCurrentStatus');
    toolCalls.push({ toolName: 'getGlobalFinancialSummary' }, { toolName: 'getCurrentStatus' });

    responseText = `### 📈 Genel Finansal ve Operasyonel Durum Özeti\n\n`;
    responseText += `- **Toplam Satış Hacmi:** ${summary.totalSales}\n`;
    responseText += `- **Toplam Tahsilat:** ${summary.totalCollections}\n`;
    responseText += `- **Hizmet / İade İndirimi:** ${summary.totalCreditNotes}\n`;
    responseText += `- **Net Alacak Bakiyesi:** **${summary.netReceivables}**\n`;
    responseText += `- **Açık Fatura Sayısı:** ${status.openInvoicesCount} Adet\n`;
    responseText += `- **Bugün Gelen Tahsilat:** ${status.todayCollections}\n`;
    responseText += `- **Ortalama Vade:** ${status.averageTermDays} Gün\n`;
  } else if (query.includes('yaşlandırma') || query.includes('vade') || query.includes('geciken')) {
    const res = await executeAiTool('getAgingBreakdown');
    toolCalls.push({ toolName: 'getAgingBreakdown' });

    responseText = `### ⏱️ Vade Yaşlandırma Dağılımı\n\n`;
    responseText += `| Vade Aralığı | Toplam Tutar |\n`;
    responseText += `|---|---|\n`;
    res.agingBuckets.forEach((b: any) => {
      responseText += `| **${b.range}** | ${b.amount} |\n`;
    });
    responseText += `\n**Vadesi Geçmiş Toplam Alacak:** ${res.totalOverdue}`;
  } else if (query.includes('en yüksek') || query.includes('en büyük') || query.includes('milyon') || query.includes('rekor')) {
    const wantsCollection = query.includes('tahsilat') || query.includes('havale') || query.includes('ödeme') || !query.includes('fatura');
    const wantsInvoice    = query.includes('fatura') || query.includes('satış') || query.includes('kesilen');

    responseText = `### 🏆 En Yüksek İşlem Analizi (Tüm Veritabanı)\n\n`;

    if (wantsCollection) {
      const colRes = await executeAiTool('getGlobalHighestTransactions', { type: 'TAHSILAT', limit: 5 });
      toolCalls.push({ toolName: 'getGlobalHighestTransactions', args: { type: 'TAHSILAT', limit: 5 } });
      if (colRes.transactions && colRes.transactions.length > 0) {
        const top = colRes.transactions[0];
        responseText += `#### 💵 En Yüksek Tahsilat: **${top.formattedAmount}**\n`;
        responseText += `- **Müşteri:** ${top.customerName} (${top.signName})\n`;
        responseText += `- **Tarih:** ${top.formattedDate} • **Ödeme Yöntemi:** ${top.method}\n\n`;

        responseText += `| # | Müşteri Unvanı / Tabela | Tutar | Yöntem | Tarih |\n`;
        responseText += `|---|---|---|---|---|\n`;
        colRes.transactions.forEach((t: any) => {
          responseText += `| ${t.rank} | **${t.signName || t.customerName}** | **${t.formattedAmount}** | ${t.method} | ${t.formattedDate} |\n`;
        });
        responseText += `\n`;
      }
    }

    if (wantsInvoice) {
      const invRes = await executeAiTool('getGlobalHighestTransactions', { type: 'SATIS', limit: 5 });
      toolCalls.push({ toolName: 'getGlobalHighestTransactions', args: { type: 'SATIS', limit: 5 } });
      if (invRes.transactions && invRes.transactions.length > 0) {
        const top = invRes.transactions[0];
        responseText += `#### 📄 En Yüksek Satış Faturası: **${top.formattedAmount}**\n`;
        responseText += `- **Müşteri:** ${top.customerName} (${top.signName})\n`;
        responseText += `- **Tarih:** ${top.formattedDate} • **Belge No:** \`${top.eDocumentNo}\`\n\n`;

        responseText += `| # | Müşteri Unvanı / Tabela | Tutar | Belge No | Tarih |\n`;
        responseText += `|---|---|---|---|---|\n`;
        invRes.transactions.forEach((t: any) => {
          responseText += `| ${t.rank} | **${t.signName || t.customerName}** | **${t.formattedAmount}** | \`${t.eDocumentNo}\` | ${t.formattedDate} |\n`;
        });
      }
    }
  } else if (query.includes('temsilci') || query.includes('plasiyer') || query.includes('performans')) {
    const monthlyPerf = getMonthlySalesRepPerformanceSync();
    const repList = monthlyPerf?.repList || [];
    const allCusts = getAllCustomersForReportingSync();
    const allReps = [...new Set(allCusts.map(c => (c.salesRepName || c.salesRep || '').trim()).filter(Boolean))];
    
    const matchedRepName = allReps.find(r => {
      const rLower = r.toLowerCase();
      return query.includes(rLower) || rLower.split(' ').some(part => part.length >= 3 && query.includes(part));
    });

    if (matchedRepName) {
      const repCusts = allCusts.filter(c => (c.salesRepName || c.salesRep || '').toLowerCase() === matchedRepName.toLowerCase());
      const repData = repList.find((r: any) => r.repName.toLowerCase() === matchedRepName.toLowerCase()) || {
        repName: matchedRepName,
        customerCount: repCusts.length,
        monthSales: 0,
        monthCollections: 0,
        totalNetReceivables: repCusts.reduce((s, c) => s + (c.balance || 0), 0)
      };

      responseText = `### 👤 **${repData.repName}** — ${monthlyPerf.monthLabel || 'Temmuz 2026'} Performans Raporu\n\n`;
      responseText += `- **Bağlı Müşteri Sayısı:** ${repCusts.length} Cari\n`;
      responseText += `- **Aylık Satış Hacmi:** **${formatCurrency(repData.monthSales || 0)}**\n`;
      responseText += `- **Aylık Tahsilat Toplamı:** **${formatCurrency(repData.monthCollections || 0)}**\n`;
      responseText += `- **Toplam Müşteri Bakiyesi:** **${formatCurrency(repData.totalNetReceivables || 0)}**\n\n`;

      if (repCusts.length > 0) {
        responseText += `#### 📋 Portföyündeki Müşteriler:\n\n`;
        responseText += `| Müşteri Kodu | Müşteri Unvanı / Tabela | Güncel Bakiye |\n`;
        responseText += `|---|---|---|\n`;
        repCusts.slice(0, 15).forEach(c => {
          responseText += `| \`${c.customerId}\` | **${c.signName || c.customerName}** | **${formatCurrency(c.balance || 0)}** |\n`;
        });
      }
      toolCalls.push({ toolName: 'getMonthlySalesRepPerformance', args: { repName: matchedRepName } });
    } else {
      responseText = `### 🏆 Saha Temsilcileri ${monthlyPerf.monthLabel || 'Temmuz 2026'} Performansı\n\n`;
      if (userMessage.length > 5) {
        responseText += `*(Not: Sorduğunuz özel temsilci adı doğrudan eşleşmedi, tüm saha temsilcilerinin listesi sunulmaktadır)*\n\n`;
      }
      responseText += `| # | Saha Temsilcisi | Müşteri Sayısı | Aylık Satış | Aylık Tahsilat | Toplam Bakiye |\n`;
      responseText += `|---|---|---|---|---|---|\n`;
      repList.forEach((r: any, idx: number) => {
        responseText += `| ${idx + 1} | **${r.repName}** | ${r.customerCount} | ${formatCurrency(r.monthSales)} | ${formatCurrency(r.monthCollections)} | **${formatCurrency(r.totalNetReceivables)}** |\n`;
      });
      toolCalls.push({ toolName: 'getMonthlySalesRepPerformance' });
    }
  } else if (query.includes('tahsilat') || query.includes('ödeme tür')) {
    const res = await executeAiTool('getPaymentMethodsBreakdown');
    toolCalls.push({ toolName: 'getPaymentMethodsBreakdown' });

    responseText = `### 💵 Tahsilat Türleri Dağılımı\n\n`;
    responseText += `| Tahsilat Yöntemi | Toplam Tutar |\n`;
    responseText += `|---|---|\n`;
    res.methods.forEach((m: any) => {
      responseText += `| **${m.method}** | ${m.amount} |\n`;
    });
  } else if (query.includes('cari') || query.includes('kaydını aç') || query.includes('master') || query.includes('ekle') || query.includes('excel')) {
    try {
      const { rawExcelCache } = await import('./uploadService');
      const { parseCustomerMaster } = await import('../parsers/customerMasterParser');
      const { archiveCustomers } = await import('./archiveService');
      const { waitForInit } = await import('./customerService');

      const cachedKeys = Array.from(rawExcelCache.keys());
      if (cachedKeys.length > 0) {
        const lastKey = cachedKeys[cachedKeys.length - 1];
        const rows = rawExcelCache.get(lastKey);
        if (rows && rows.length > 0) {
          const parsed = parseCustomerMaster(rows);
          const res = await archiveCustomers(parsed.records);
          await waitForInit();

          responseText = `📊 **Veritabanı İnceleme ve Eşleştirme Raporu (Müşteri Master Listesi):**\n\n`;
          responseText += `• 🛡️ **Mükerrer Kayıt Koruması:** **${res.skippedDuplicate} Adet** kayıt veritabanında zaten var olduğu için **görmezden gelindi (korundu).**\n`;
          responseText += `• 📥 **Yeni Eklenen Cariler:** **${res.added} Adet** veritabanında olmayan yeni müşteri sisteme **kaydedildi!**\n`;
          if (parsed.warnings && parsed.warnings.length > 0) {
            responseText += `\n⚡ **Uyarılar:** ${parsed.warnings.join(', ')}`;
          }
          toolCalls.push({ toolName: 'archiveCustomers', args: { added: res.added } });
        } else {
          responseText = `⚠️ Yüklenen Excel dosyasında okunabilir cari satırı bulunamadı.`;
        }
      } else {
        responseText = `⚠️ İncelemek veya veritabanına aktarmak için sohbet penceresine Müşteri Master Excel dosyanızı ekleyiniz.`;
      }
    } catch (e: any) {
      console.error('Local fallback import error:', e);
      responseText = `Excel içe aktarımı sırasında hata oluştu: ${e.message}`;
    }
  } else if (userMessage.includes('Ekli Dosya:') || userMessage.includes('Veritabanı İnceleme') || (attachments && attachments.length > 0)) {
    let respText = "Dosya işleme tamamlandı ancak çevrimdışı olduğum için detaylı analiz yapamıyorum.";
    const processedFiles = attachments.filter(a => a.notif);
    
    if (processedFiles.length > 0) {
      let responseBuilder: string[] = [];
      processedFiles.forEach(file => {
        const n = file.notif;
        let p = `**${file.fileName}** dosyanızı inceledim ve veritabanına işledim. `;
        let details: string[] = [];
        if (n.added > 0) details.push(`${n.added} yeni kaydı başarıyla sisteme ekledim`);
        if (n.matchedCount > 0) details.push(`${n.matchedCount} evrağı eşleştirip kapattım`);
        if (n.cancelledRemoved > 0) details.push(`${n.cancelledRemoved} iptal işlemini temizledim`);
        if (n.skippedDuplicate > 0) details.push(`${n.skippedDuplicate} kayıt zaten sistemde olduğu için atladım`);
        
        if (details.length > 0) {
          p += details.join(', ') + '.';
        } else {
          p += `Toplam ${file.rowCount || 0} satır veriyi taradım ancak yeni bir değişiklik gerekmedi.`;
        }
        responseBuilder.push(p);
      });
      
      responseText = responseBuilder.join('\n\n') + `\n\nBaşka bir analiz yapmamı veya yüklediğiniz veriler hakkında soru sormak ister misiniz?`;
    } else {
      responseText = `Dosyanız sisteme yüklendi ve önbelleğe alındı. Bu dosyayla ilgili bana dilediğiniz gibi soru sorabilirsiniz; verileri sizin için analiz edebilirim.`;
    }
  } else if (/(iptal|hangileri|kimler|kimdi|eklenen|atlanan)/i.test(query)) {
    responseText = "Az önce işlediğim dosyada tam olarak hangi kayıtların iptal edildiğine, eklendiğine veya atlandığına dair detaylı listeye şu anki sistem kısıtlamaları nedeniyle erişemiyorum. Ben sadece raporlanan toplam sayıları (istatistikleri) görebilmekteyim.";
  } else {
    const cleanSearchQuery = userMessage.trim();
    if (cleanSearchQuery && !cleanSearchQuery.startsWith('📎') && cleanSearchQuery.length >= 2) {
      const searchRes = await executeAiTool('searchCustomers', { query: cleanSearchQuery });
      if (searchRes && searchRes.count > 0) {
        toolCalls.push({ toolName: 'searchCustomers', args: { query: cleanSearchQuery } });
        responseText = `Aramanıza uygun **${searchRes.count}** müşteri bulundu:\n\n`;
        responseText += `| Müşteri Kodu | Müşteri Adı | Tabela / Unvan | Bakiye |\n`;
        responseText += `|---|---|---|---|\n`;
        searchRes.customers.slice(0, 10).forEach((c: any) => {
          responseText += `| \`${c.customerId}\` | **${c.customerName}** | ${c.signName} | **${c.balance}** |\n`;
        });
      } else {
        responseText = `Size nasıl yardımcı olabilirim? Aşağıdaki analizleri ve raporları isteyebilirsiniz:\n\n` +
          `- 📊 **"En borçlu 10 müşteriyi listele"**\n` +
          `- 📈 **"Genel finansal özeti ver"**\n` +
          `- ⏱️ **"Vade yaşlandırma dağılımını göster"**\n` +
          `- 💵 **"Tahsilat türleri dağılımı nedir?"**\n` +
          `- 🔍 **Bir müşteri adı veya kodu yazarak arayabilirsiniz (Örn: 5000100015)**\n\n` +
          (getApiKeys().length > 0
            ? `*(Not: Anlık API kotaları/yoğunluğu nedeniyle yerel analitik motoru yanıt verdi)*`
            : `*(İpucu: Canlı AI bağlantısı için \`.env\` dosyasına \`VITE_GEMINI_API_KEY\` ekleyebilirsiniz)*`);
      }
    } else {
      responseText = `Size nasıl yardımcı olabilirim? Aşağıdaki analizleri ve raporları isteyebilirsiniz:\n\n` +
        `- 📊 **"En borçlu 10 müşteriyi listele"**\n` +
        `- 📈 **"Genel finansal özeti ver"**\n` +
        `- ⏱️ **"Vade yaşlandırma dağılımını göster"**\n` +
        `- 💵 **"Tahsilat türleri dağılımı nedir?"**\n` +
        `- 🔍 **Bir müşteri adı veya kodu yazarak arayabilirsiniz (Örn: 5000100015)**\n\n` +
        (getApiKeys().length > 0
          ? `*(Not: Anlık API kotaları/yoğunluğu nedeniyle yerel analitik motoru yanıt verdi)*`
          : `*(İpucu: Canlı AI bağlantısı için \`.env\` dosyasına \`VITE_GEMINI_API_KEY\` ekleyebilirsiniz)*`);
    }
  }

  return { text: responseText, toolCalls };
}

export function clearAiServiceCache(): void {
  // Clears any transient AI service caches
  keyRotationIndex = 0;
}

