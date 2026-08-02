import React, { useState, useRef, useEffect } from 'react';
import { useAiChat } from '../hooks/useAiChat';
import { ChatMessage } from '../components/ai/ChatMessage';
import { SuggestedQuestions } from '../components/ai/SuggestedQuestions';
import { MascotAvatar } from '../components/ai/MascotAvatar';
import { 
  isAdminAuthenticated, 
  authenticateAdmin, 
  logoutAdmin, 
  getCustomRules, 
  addCustomRule, 
  deleteCustomRule 
} from '../services/customRulesService';
import { detectFileType } from '../utils/fileTypeDetector';
import { processFile } from '../services/uploadService';
import './AiChatPage.css';

export function AiChatPage() {
  const { messages, loading, sendMessage, clearChat } = useAiChat();
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAdmin, setIsAdmin] = useState(isAdminAuthenticated());
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [customRules, setCustomRules] = useState(getCustomRules());
  const [newRuleText, setNewRuleText] = useState('');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      clearChat();
    };
  }, [clearChat]);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const processed: any[] = [];
    for (const file of Array.from(files)) {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      if (isExcel) {
        if (!isAdminAuthenticated()) {
          setShowAdminModal(true);
          processed.push({
            fileName: file.name,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            textContent: `🔒 Yetki Korumalı İşlem: Veritabanına Excel verisi yüklemek ve kaydetmek için Admin girişi yapılması gerekmektedir. Dosyanız işlenmedi.`,
            isExcel: true,
          });
          continue;
        }

        try {
          const detection = await detectFileType(file);
          let typeKey = detection.key;
          if (!typeKey) {
            const fname = file.name.toLowerCase();
            if (fname.includes('cek') || fname.includes('çek')) typeKey = 'CEK';
            else if (fname.includes('senet')) typeKey = 'SENET';
            else if (fname.includes('havale') || fname.includes('eft') || fname.includes('banka')) typeKey = 'HAVALE_TAHSILAT';
            else if (fname.includes('nakit') || fname.includes('kasa') || fname.includes('pos')) typeKey = 'NAKIT_TAHSILAT';
            else if (fname.includes('müşteri') || fname.includes('musteri') || fname.includes('master')) typeKey = 'MUSTERI_MASTER';
            else if (fname.includes('satın') || fname.includes('satin') || fname.includes('alım') || fname.includes('alim')) typeKey = 'SATIN_ALMA';
            else typeKey = 'SATIS';
          }
          const res = await processFile(file, typeKey);
          if (res.success) {
            const notif = res.result?.notificationSummary;
            const typeLabels: Record<string, string> = {
              MUSTERI_MASTER: 'Müşteri Master Listesi',
              SATIS: 'Satış Faturaları',
              SATIN_ALMA: 'Satın Alma / Hizmet Faturaları',
              NAKIT_TAHSILAT: 'Nakit Tahsilatlar',
              HAVALE_TAHSILAT: 'Havale Tahsilatlar',
              CEK: 'Çek Riski',
              SENET: 'Senet Riski'
            };
            const label = typeLabels[typeKey] || typeKey;
            let summaryText = `📊 **Veritabanı İnceleme ve Eşleştirme Raporu (${label}):**\n\n`;
            if (notif) {
              if (notif.skippedDuplicate > 0) summaryText += `• 🛡️ **Mükerrer Kayıt Koruması:** **${notif.skippedDuplicate} Adet** kayıt veritabanında zaten var olduğu için **görmezden gelindi.**\n`;
              if (notif.cancelledRemoved > 0) summaryText += `• 🚫 **Ters İşlemle İptal Edilenler:** **${notif.cancelledRemoved} Adet** CANCELLED kayıt ayıklandı.\n`;
              if (notif.matchedCount > 0) summaryText += `• 💳 **Ödemesi Atılan Çek/Senetler:** **${notif.matchedCount} Adet** evrak **ÖDENDİ** durumuna alındı!\n`;
              if (notif.added > 0) summaryText += `• 📥 **Yeni Eklenen İşlemler:** **${notif.added} Adet** yeni hareket kaydedildi.\n`;
            } else {
              summaryText += `Toplam ${res.result?.records?.length || 0} kayıt işlendi.`;
            }

            processed.push({
              fileName: file.name,
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              textContent: summaryText,
              isExcel: true,
              rowCount: res.result?.records?.length || 0,
              typeKey
            });
          } else if (res.isFormatError && res.rawRows) {
            const sampleRows = res.rawRows.slice(0, 30);
            const columnNames = Object.keys(sampleRows[0] || {}).join(', ');
            processed.push({
              fileName: file.name,
              mimeType: 'application/json',
              textContent: `TANIMSIZ EXCEL DOSYASI (${file.name})\nSütunlar: ${columnNames}\nSatır Sayısı: ${res.rawRows.length}\nÖrnek Veriler:\n${JSON.stringify(sampleRows, null, 2)}`,
              isExcel: true,
              isUnknownFormat: true
            });
          }
        } catch (err) {
          console.error('Excel otomatik işleme hatası:', err);
        }
        continue;
      }

      const reader = new FileReader();
      const item = await new Promise((resolve) => {
        if (isImage || isPdf) {
          reader.onload = (e) => {
            const base64Data = (e.target?.result as string).split(',')[1];
            resolve({
              fileName: file.name,
              mimeType: isPdf ? 'application/pdf' : file.type,
              base64: base64Data,
              isImage,
              isPdf
            });
          };
          reader.readAsDataURL(file);
        } else {
          reader.onload = (e) => {
            resolve({
              fileName: file.name,
              mimeType: file.type || 'text/plain',
              textContent: (e.target?.result as string).slice(0, 15000),
              isImage: false,
              isPdf: false
            });
          };
          reader.readAsText(file);
        }
      });
      processed.push(item);
    }
    setAttachments(prev => [...prev, ...processed]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputText.trim() && attachments.length === 0) || loading) return;
    sendMessage(inputText, attachments);
    setInputText('');
    setAttachments([]);
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Tarayıcınız sesli aramayı desteklemiyor (Chrome/Edge kullanın).');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'tr-TR';
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputText(prev => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.start();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleAdminLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authenticateAdmin(adminPasswordInput)) {
      setIsAdmin(true);
      setShowAdminModal(false);
      setAdminPasswordInput('');
      setAdminAuthError('');
    } else {
      setAdminAuthError('Hatalı Şifre! Admin şifresi 2580 olmalıdır.');
    }
  };

  const handleAdminLogout = () => {
    logoutAdmin();
    setIsAdmin(false);
    setShowRulesModal(false);
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleText.trim()) return;
    addCustomRule(newRuleText);
    setCustomRules(getCustomRules());
    setNewRuleText('');
  };

  const handleDeleteRule = (id: string) => {
    deleteCustomRule(id);
    setCustomRules(getCustomRules());
  };

  return (
    <div 
      className={`ai-chat-page-container ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="ai-page-header">
        <div className="ai-header-info">
          <MascotAvatar size="medium" />
          <div className="ai-header-title-group">
            <div className="ai-title-row">
              <span className="ai-header-title">Günlü</span>
              <span className="online-status-dot"></span>
              <span className="online-status-text">Aktif</span>
              {isAdmin && <span className="admin-badge-glowing">🛡️ Admin</span>}
            </div>
            <span className="ai-header-subtitle">AKGÜN Akıllı Finansal Asistan & Görsel Analiz</span>
          </div>
        </div>

        <div className="ai-header-actions">
          <button className="ai-action-btn" onClick={clearChat} title="Sohbeti Temizle">
            <i className="ti ti-eraser" aria-hidden="true"></i>
            <span>Temizle</span>
          </button>
          
          <button className="ai-action-btn" onClick={() => setShowRulesModal(true)} title="Yapay Zeka Kuralları">
            <i className="ti ti-settings" aria-hidden="true"></i>
            <span>Kurallar</span>
          </button>

          {isAdmin ? (
            <button className="ai-action-btn danger" onClick={handleAdminLogout} title="Admin Çıkışı">
              <i className="ti ti-lock" aria-hidden="true"></i>
              <span>Çıkış</span>
            </button>
          ) : (
            <button className="ai-action-btn" onClick={() => setShowAdminModal(true)} title="Admin Girişi">
              <i className="ti ti-key" aria-hidden="true"></i>
              <span>Admin Girişi</span>
            </button>
          )}
        </div>
      </div>

      {isDragging && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-box">
            <i className="ti ti-file-upload" style={{ fontSize: '36px', color: '#C9922E' }}></i>
            <strong>Görsel veya Dosyayı Bırakın</strong>
            <small>Dekont, Fatura Fotoğrafı, Excel veya PDF</small>
          </div>
        </div>
      )}

      <div className="ai-messages-feed">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {messages.length <= 1 && (
          <SuggestedQuestions onSelectQuestion={(q) => sendMessage(q)} />
        )}

        {loading && (
          <div className="ai-loading-indicator">
            <MascotAvatar size="small" isTyping={true} />
            <div className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="ai-loading-text">Günlü verileri ve finansal analizleri işliyor...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {attachments.length > 0 && (
        <div className="attachment-preview-bar">
          {attachments.map((att, idx) => (
            <div key={idx} className="attachment-chip">
              <i className={att.isPdf ? 'ti ti-file-text' : (att.isImage ? 'ti ti-photo' : 'ti ti-paperclip')}></i>
              <span className="file-name">{att.fileName}</span>
              <button 
                type="button" 
                className="remove-att-btn"
                onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ai-input-footer">
        <form className="ai-input-pill" onSubmit={handleSubmit} autoComplete="off">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/*,.pdf,.xlsx,.csv,.txt"
            multiple
            onChange={(e) => handleFileUpload(e.target.files)}
          />

          <input
            type="text"
            className="ai-input-field"
            placeholder="Soru yazın veya görsel/fatura sürükleyin..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
            autoComplete="off"
          />

          <button
            type="button"
            className="icon-action-btn"
            onClick={handleVoiceInput}
            title="Sesli Konuş"
          >
            <i className="ti ti-microphone" aria-hidden="true"></i>
          </button>

          <button
            type="button"
            className="icon-action-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Dosya / Görsel Ekle"
          >
            <i className="ti ti-paperclip" aria-hidden="true"></i>
          </button>

          <button
            type="submit"
            className="send-gold-btn"
            disabled={(!inputText.trim() && attachments.length === 0) || loading}
            aria-label="Gönder"
          >
            <i className="ti ti-arrow-up" aria-hidden="true"></i>
          </button>
        </form>
      </div>

      {showAdminModal && (
        <div className="ai-modal-overlay" onClick={() => setShowAdminModal(false)}>
          <div className="ai-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3>🔑 Admin Yetki Girişi</h3>
              <button className="ai-modal-close" onClick={() => setShowAdminModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAdminLoginSubmit} className="ai-modal-body">
              <p>Tahsilat ekleme, silme ve veritabanı değişiklikleri yapabilmek için <strong>Admin Şifresini</strong> giriniz:</p>
              <input
                type="password"
                placeholder="Admin Şifresi"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                autoFocus
                className="admin-pwd-input"
              />
              {adminAuthError && <div className="admin-auth-error">{adminAuthError}</div>}
              <div className="ai-modal-actions">
                <button type="button" className="btn-sec" onClick={() => setShowAdminModal(false)}>İptal</button>
                <button type="submit" className="btn-pri">Giriş Yap</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showRulesModal && (
        <div className="ai-modal-overlay" onClick={() => setShowRulesModal(false)}>
          <div className="ai-modal-card wide" onClick={(e) => e.stopPropagation()}>
            <div className="ai-modal-header">
              <h3>⚙️ Canlı Yapay Zeka Kuralları & Yönetimi</h3>
              <button className="ai-modal-close" onClick={() => setShowRulesModal(false)}>✕</button>
            </div>
            <div className="ai-modal-body">
              <p className="rules-info-text">
                Buraya eklediğiniz yeni kurallar <strong>tüm cihazlar ve kullanıcılar için canlıda geçerli olur</strong>. 
                Yapay zeka her mesaj yanıtında bu kuralları anayasa kabul eder.
              </p>

              <form onSubmit={handleAddRule} className="add-rule-form">
                <input
                  type="text"
                  placeholder="Örn: Müşterilere iskonto oranlarını %10 üzerinde önerme..."
                  value={newRuleText}
                  onChange={(e) => setNewRuleText(e.target.value)}
                />
                <button type="submit" className="btn-pri">+ Kural Ekle</button>
              </form>

              <div className="custom-rules-list">
                <h4>📌 Yönetici Tarafından Eklenen Canlı Kurallar ({customRules.length})</h4>
                {customRules.length === 0 ? (
                  <div className="empty-rules-note">Henüz dinamik kural eklenmedi. Yukarıdaki formdan yeni kural ekleyebilirsiniz.</div>
                ) : (
                  customRules.map((rule, idx) => (
                    <div key={rule.id} className="rule-item">
                      <span className="rule-num">K-{idx + 1}</span>
                      <span className="rule-text">{rule.text}</span>
                      <button 
                        type="button" 
                        className="delete-rule-btn"
                        onClick={() => handleDeleteRule(rule.id)}
                        title="Kuralı Sil"
                      >
                        🗑️
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AiChatPage;
