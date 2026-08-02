import React, { useState, useEffect } from 'react';
import { MascotAvatar } from './MascotAvatar';
import { formatCurrency } from '../../utils/formatters';
import { getCustomerPaymentTrendSync, getCustomerStatement } from '../../services/customerService';
import { sendAiMessage } from '../../services/aiService';
import './CustomerAiBubble.css';

interface CustomerAiBubbleProps {
  customer: any;
  onClose: () => void;
  onActionClick?: (actionType: string, customer: any) => void;
}

export function CustomerAiBubble({ customer, onClose, onActionClick }: CustomerAiBubbleProps) {
  const [statement, setStatement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const customerId = customer?.customerId || '';
  const customerName = customer?.signName || customer?.customerName || 'Müşteri';
  const balance = customer?.balance || 0;

  const paymentTrend = customerId ? getCustomerPaymentTrendSync(customerId) : null;

  useEffect(() => {
    if (!customerId) return;
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const stmt = await getCustomerStatement(customerId);
        if (isMounted) {
          setStatement(stmt);
          setLoading(false);
        }
      } catch (err) {
        console.error('CustomerAiBubble load error:', err);
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [customerId]);

  if (!customer) return null;

  const generateGunluInsight = () => {
    if (balance <= 0) {
      if (balance < 0) {
        return {
          riskLevel: 'LOW',
          badgeText: '🟢 Alacaklı (Avans)',
          insightText: `✅ **${customerName}** hesabında **${formatCurrency(Math.abs(balance))}** alacak (avans) bakiyesi bulunuyor. Müşterinin açık borcu yoktur; sipariş sevkiyatlarında öncelik verilebilir.`
        };
      }
      return {
        riskLevel: 'LOW',
        badgeText: '🟢 Risk Yok (₺0 Borç)',
        insightText: `✨ **${customerName}** hesabının açık borcu bulunmamaktadır. Tüm geçmiş faturaları düzenli olarak kapanmıştır.`
      };
    }

    const realizedDays = paymentTrend?.averagePaymentDays || 0;
    const isHighRisk = balance > 30000 || realizedDays > 45;
    const isMediumRisk = balance > 10000 || realizedDays > 30;

    let riskBadge = '🟡 Orta Risk';
    let riskLevel = 'MEDIUM';
    if (isHighRisk) {
      riskBadge = '🔴 Yüksek Risk';
      riskLevel = 'HIGH';
    } else if (!isMediumRisk) {
      riskBadge = '🟢 Düşük Risk';
      riskLevel = 'LOW';
    }

    const suggestedPartial = Math.round((balance * 0.4) / 1000) * 1000 || Math.round(balance / 2);

    let insightText = `⚠️ **${customerName}** kullanıcısının **${formatCurrency(balance)}** net borç bakiyesi bulunmaktadır.`;
    
    if (realizedDays > 0) {
      insightText += ` Müşteri ödemelerini ortalama **${realizedDays} günde** gerçekleştiriyor.`;
    }

    if (isHighRisk) {
      insightText += `\n\n💡 **Günlü'nün Akıllı Tavsiyesi:** Müşterinin alacak riski yüksek seviyededir. Yeni ürün/sipariş sevkiyatı yapmadan önce en az **${formatCurrency(suggestedPartial)}** tutarında tahsilat talep edilmesi tavsiye edilir.`;
    } else {
      insightText += `\n\n💡 **Günlü'nün Akıllı Tavsiyesi:** Müşteri ödeme performansı makul seviyededir. Rutin vadede tahsilat takibi yapabilirsiniz.`;
    }

    return { riskLevel, badgeText: riskBadge, insightText };
  };

  const insight = generateGunluInsight();

  const handleSendBubbleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || aiLoading) return;

    const userQ = chatInput.trim();
    setChatInput('');
    
    const newHistory = [
      ...chatMessages,
      { role: 'user', content: userQ, id: Date.now() }
    ];
    setChatMessages(newHistory);
    setAiLoading(true);

    try {
      const promptWithContext = `Müşteri Kodu: ${customerId}, Müşteri Adı: ${customerName}, Net Bakiye: ${balance} TL. Kullanıcı Sorusu: "${userQ}"`;
      const res = await sendAiMessage(promptWithContext, []);
      setChatMessages([
        ...newHistory,
        { role: 'assistant', content: res.text, toolCalls: res.toolCalls, id: Date.now() + 1 }
      ]);
    } catch (err) {
      setChatMessages([
        ...newHistory,
        { role: 'assistant', content: 'Üzgünüm, sorunuzu yanıtlarken bir hata oluştu.', isError: true, id: Date.now() + 1 }
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="customer-ai-bubble-overlay" onClick={onClose}>
      <div className="customer-ai-bubble-card" onClick={(e) => e.stopPropagation()}>
        {/* Header with Günlü Mascot */}
        <div className="bubble-header">
          <div className="bubble-mascot-title">
            <MascotAvatar size="small" isTyping={aiLoading} />
            <div>
              <div className="bubble-title-row">
                <span className="bubble-ai-name">Günlü</span>
                <span className="bubble-ai-tag">Finansal Yorumcu</span>
              </div>
              <span className="bubble-cust-name">{customerName} ({customerId})</span>
            </div>
          </div>
          <button className="bubble-close-btn" onClick={onClose} title="Kapat">✕</button>
        </div>

        {/* Body Content */}
        <div className="bubble-body">
          {/* Risk & Summary Badge */}
          <div className="bubble-status-row">
            <span className={`risk-badge risk-${insight.riskLevel.toLowerCase()}`}>
              {insight.badgeText}
            </span>
            <span className="bubble-balance-val num">
              {formatCurrency(balance)}
            </span>
          </div>

          {/* Günlü's Live Insight Box */}
          <div className="gunlu-insight-box">
            <div className="insight-content">
              {insight.insightText.split('\n\n').map((para, i) => (
                <p key={i}>{para.replace(/\*\*(.*?)\*\*/g, '$1')}</p>
              ))}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="bubble-quick-metrics">
            <div className="q-metric">
              <span className="q-lbl">Gerçekleşen Vade</span>
              <span className="q-val num">{paymentTrend?.averagePaymentDays || 0} Gün</span>
            </div>
            <div className="q-metric">
              <span className="q-lbl">Ödeme Yöntemi</span>
              <span className="q-val num">{paymentTrend?.preferredMethod || 'Kredi Kartı / Havale'}</span>
            </div>
          </div>

          {/* Chat / Q&A Log */}
          {chatMessages.length > 0 && (
            <div className="bubble-chat-log">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`bubble-msg-row ${msg.role}`}>
                  <span className="msg-sender">{msg.role === 'user' ? 'Siz' : 'Günlü'}</span>
                  <div className={`msg-bubble ${msg.role}`}>{msg.content}</div>
                </div>
              ))}
            </div>
          )}

          {/* Action Chips */}
          <div className="bubble-actions">
            <button 
              className="bubble-action-chip"
              onClick={() => onActionClick && onActionClick('tahsilat', customer)}
            >
              💵 Tahsilat Ekle
            </button>
            <button 
              className="bubble-action-chip"
              onClick={() => onActionClick && onActionClick('analiz', customer)}
            >
              📊 Trend Analizi
            </button>
            <button 
              className="bubble-action-chip"
              onClick={() => onActionClick && onActionClick('ekstre', customer)}
            >
              📄 Ekstre İncele
            </button>
          </div>
        </div>

        {/* Input Bar inside Bubble */}
        <form className="bubble-input-bar" onSubmit={handleSendBubbleQuery}>
          <input
            type="text"
            placeholder={`${customerName} hakkında Günlü'ye soru sor...`}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={aiLoading}
          />
          <button type="submit" disabled={!chatInput.trim() || aiLoading}>
            {aiLoading ? '...' : '▲'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default CustomerAiBubble;
