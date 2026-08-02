import { useState, useCallback, useEffect } from 'react';
import { sendAiMessage, clearAiServiceCache } from '../services/aiService';
import { clearRawExcelCache } from '../services/uploadService';
import { ChatMessage } from '../types';

const STORAGE_KEY = 'akgun_ai_chat_history';

function loadSavedMessages(): ChatMessage[] {
  try {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load chat history from localStorage:', e);
  }
  return [
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Merhaba! Ben AKGÜN Meşrubat akıllı finans ve operasyon asistanıyım. Müşteri bakiyeleri, risk durumları, tahsilat raporları veya yaşlandırma analizi hakkında bana soru sorabilirsiniz.',
      timestamp: new Date().toISOString()
    }
  ];
}

function sanitizeMessagesForStorage(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map((m) => {
    if (!m.attachments || m.attachments.length === 0) return m;
    const cleanAtts = m.attachments.map((att: any) => {
      const { base64, textContent, ...rest } = att;
      return {
        ...rest,
        textContent: textContent ? (textContent.slice(0, 300) + '...') : undefined,
      };
    });
    return { ...m, attachments: cleanAtts };
  });
}

function saveMessages(msgs: ChatMessage[]) {
  try {
    if (typeof window === 'undefined') return;
    if (!msgs || msgs.length <= 1) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const sanitized = sanitizeMessagesForStorage(msgs.slice(-20));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (inner) {}
    }
  }
}

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadSavedMessages);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  const sendMessage = useCallback(async (userText: string, attachments: any[] = []) => {
    const textContent = (userText || '').trim();
    if (!textContent && (!attachments || attachments.length === 0)) return;

    const attachmentNames = attachments.map((a: any) => a.fileName).join(', ');
    const displayContent = attachmentNames 
      ? (textContent ? `${textContent}\n📎 Ekli Dosya: ${attachmentNames}` : `📎 Ekli Dosya: ${attachmentNames}`)
      : textContent;

    const userMessageObj: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: displayContent,
      attachments,
      timestamp: new Date().toISOString()
    };

    const aiMessageId = `ai-${Date.now()}`;
    const initialAiMessageObj: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: new Date().toISOString(),
      isStreaming: true
    };

    setMessages(prev => [...prev, userMessageObj, initialAiMessageObj]);
    setLoading(true);
    setError(null);

    try {
      const history = [...messages, userMessageObj].map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: m.content,
        attachments: m.attachments || []
      }));

      const handleChunk = (_chunkText: string, fullText: string) => {
        setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: fullText } : m));
      };

      const res = await sendAiMessage(textContent, history, attachments, handleChunk);

      setMessages(prev => prev.map(m => 
        m.id === aiMessageId 
          ? {
              ...m,
              content: res.text || m.content || 'Yanıt oluşturulamadı.',
              toolCalls: res.toolCalls,
              isStreaming: false
            }
          : m
      ));
    } catch (err: any) {
      setError(err.message || 'AI yanıt oluştururken bir hata oluştu');
      setMessages(prev => prev.map(m => 
        m.id === aiMessageId 
          ? {
              ...m,
              content: 'Üzgünüm, sorunuzu işlerken bir hata oluştu. Lütfen tekrar deneyin.',
              isError: true,
              isStreaming: false
            }
          : m
      ));
    } finally {
      setLoading(false);
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, isStreaming: false } : m));
    }
  }, [messages]);

  const clearChat = useCallback(() => {
    const resetMsgs: ChatMessage[] = [
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: 'Sohbet geçmişi temizlendi. Yeni bir soru sorabilirsiniz.',
        timestamp: new Date().toISOString()
      }
    ];
    setMessages(resetMsgs);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {}
    clearRawExcelCache();
    clearAiServiceCache();
  }, []);

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearChat
  };
}

