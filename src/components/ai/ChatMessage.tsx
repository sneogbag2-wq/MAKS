import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MascotAvatar } from './MascotAvatar';
import { triggerOpenCustomerModal } from '../../services/customerService';
import { ChatMessage as ChatMessageType } from '../../types';
import './ChatMessage.css';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`chat-message-row ${isUser ? 'user-row' : 'assistant-row'}`}>
      {!isUser && (
        <MascotAvatar size="small" className="message-avatar" />
      )}

      <div className="chat-bubble-container">
        <div className="chat-bubble-header">
          <span className="chat-sender-name">{isUser ? 'Siz' : 'Günlü (AI Asistan)'}</span>
          <span className="chat-time">
            {message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>

        <div className={`chat-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'} ${message.isError ? 'error-bubble' : ''}`}>
          {isUser ? (
            <>
              {message.attachments && message.attachments.length > 0 && (
                <div className="message-image-previews">
                  {message.attachments.filter((a: any) => a.isImage).map((att: any, idx: number) => (
                    <img key={idx} src={`data:${att.mimeType};base64,${att.base64}`} alt={att.fileName} className="message-img-thumb" />
                  ))}
                </div>
              )}
              <p className="user-text">{message.content}</p>
            </>
          ) : (
            <>
              {!message.content && message.isStreaming ? (
                <div className="typing-dots">
                  <span></span><span></span><span></span>
                </div>
              ) : (
                <div className="markdown-content-wrapper">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => {
                        const h = String(href || '');
                        let startDate = '';
                        let endDate = '';
                        if (h.includes('?')) {
                          try {
                            const queryPart = h.split('?')[1] || '';
                            const searchParams = new URLSearchParams(queryPart);
                            startDate = searchParams.get('startDate') || '';
                            endDate = searchParams.get('endDate') || '';
                          } catch (e) {}
                        }

                        if (h.includes('action-pdf') || h.includes('action:pdf')) {
                          const cleanHref = h.split('?')[0];
                          const parts = cleanHref.split(/action-pdf-|\/action-pdf\/|action:pdf:/);
                          const rawId = parts.length > 1 ? parts.pop() : '';
                          const custId = (rawId || '').trim();
                          return (
                            <button
                              type="button"
                              className="chat-action-btn pdf-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if ((window as any).__triggerCustomerPDFPrint) {
                                  (window as any).__triggerCustomerPDFPrint(custId, { startDate, endDate });
                                }
                              }}
                            >
                              {children}
                            </button>
                          );
                        }
                        if (h.includes('action-excel') || h.includes('action:excel')) {
                          const cleanHref = h.split('?')[0];
                          const parts = cleanHref.split(/action-excel-|\/action-excel\/|action:excel:/);
                          const rawId = parts.length > 1 ? parts.pop() : '';
                          const custId = (rawId || '').trim();
                          return (
                            <button
                              type="button"
                              className="chat-action-btn excel-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if ((window as any).__triggerCustomerExcelExport) {
                                  (window as any).__triggerCustomerExcelExport(custId, { startDate, endDate });
                                }
                              }}
                            >
                              {children}
                            </button>
                          );
                        }
                        if (h.includes('action-modal') || h.includes('action:modal')) {
                          const cleanHref = h.split('?')[0];
                          const parts = cleanHref.split(/action-modal-|\/action-modal\/|action:modal:/);
                          const rawId = parts.length > 1 ? parts.pop() : '';
                          const custId = (rawId || '').trim();
                          return (
                            <button
                              type="button"
                              className="chat-action-btn modal-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                triggerOpenCustomerModal({ customerId: custId, startDate, endDate });
                              }}
                            >
                              {children}
                            </button>
                          );
                        }
                        return (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              if (href && href.includes('action')) {
                                e.preventDefault();
                                e.stopPropagation();
                              }
                            }}
                          >
                            {children}
                          </a>
                        );
                      }
                    }}
                  >
                    {message.content || 'Yanıt oluşturulamadı.'}
                  </ReactMarkdown>
                  {message.isStreaming && <span className="streaming-cursor-blink">▌</span>}
                </div>
              )}
            </>
          )}

          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="tool-badge-container">
              {message.toolCalls.map((tc: any, idx: number) => (
                <div key={idx} className="tool-badge-item">
                  <i className="ti ti-database" aria-hidden="true"></i>
                  <span>{tc.toolName}</span>
                  <i className="ti ti-check check-icon" aria-hidden="true"></i>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isUser && (
          <div className="chat-actions">
            <button className="chat-copy-btn" onClick={handleCopy} title="Kopyala">
              {copied ? '✓ Kopyalandı' : '📋 Kopyala'}
            </button>
          </div>
        )}
      </div>

      {isUser && (
        <div className="chat-avatar user-avatar">
          <i className="ti ti-user" aria-hidden="true"></i>
        </div>
      )}
    </div>
  );
}

export default ChatMessage;
