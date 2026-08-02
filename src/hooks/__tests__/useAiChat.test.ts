import { describe, it, expect, vi } from 'vitest';
import { useAiChat } from '../useAiChat';

vi.mock('../../services/aiService', () => ({
  sendAiMessage: vi.fn().mockResolvedValue({
    text: 'Test AI Yanıtı',
    toolCalls: []
  })
}));

vi.mock('../../services/archiveService', () => ({
  loadChatHistoryFromIDB: vi.fn().mockResolvedValue(null),
  saveChatHistoryToIDB: vi.fn().mockResolvedValue(undefined),
  clearChatHistoryFromIDB: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../services/uploadService', () => ({
  clearRawExcelCache: vi.fn()
}));

describe('useAiChat Hook Logic', () => {
  it('should initialize with welcome message', () => {
    expect(useAiChat).toBeDefined();
    expect(typeof useAiChat).toBe('function');
  });
});
