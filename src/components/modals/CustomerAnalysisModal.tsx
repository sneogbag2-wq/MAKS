// src/components/modals/CustomerAnalysisModal.tsx
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getCustomerPaymentTrendSync } from '../../services/customerService';
import CopyBadge from '../common/CopyBadge';
import CustomerStatementModal from './CustomerStatementModal';

interface CustomerAnalysisModalProps {
  customer: any;
  onClose: () => void;
}

export default function CustomerAnalysisModal({ customer, onClose }: CustomerAnalysisModalProps) {
  const [showStatement, setShowStatement] = useState(false);

  if (!customer) return null;

  const trendData = getCustomerPaymentTrendSync(customer);

  return createPortal(
    <div className="popup-modal-overlay" onClick={onClose} style={{ zIndex: 10050 }}>
      <div className="modal modal-md" onClick={(e) => e.stopPropagation()}>
        <div className="modal-glow-line" style={{ background: 'linear-gradient(90deg, transparent, #6366F1, transparent)', boxShadow: '0 0 25px rgba(99, 102, 241, 0.35)' }}></div>
        
        {/* Header */}
        <div className="modal-header" style={{ paddingBottom: '24px' }}>
          <div className="header-profile">
            <div className="avatar" style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)' }}>
              📊
            </div>
            <div className="profile-info">
              <h2>{customer.signName || customer.customerName}</h2>
              <div className="metadata-row">
                <div className="meta-item">
                  <span className="icon">🔑</span>
                  Cari Kod: <span className="meta-val">{customer.customerId}</span>
                  <CopyBadge textToCopy={customer.customerId} className="copy-badge-ghost" />
                </div>
                <div className="meta-item">
                  <span className="icon">👤</span>
                  Temsilci: <span className="meta-val">{customer.salesRepName || 'Key Account'}</span>
                </div>
              </div>
            </div>
          </div>
          
          <button className="btn-close" onClick={onClose} title="Kapat">✕</button>
        </div>

        {/* Navigation Tabs */}
        <div className="modern-nav-wrapper">
          <div className="modern-nav-item active">Ödeme & Risk Trend Analizi</div>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* Trend Grid Cards */}
          <div className="analysis-grid" style={{ marginBottom: '24px' }}>
            <div className="glass-card">
              <span className="stat-label">Ortalama Vade (Açık Borç)</span>
              <span className="stat-value text-gold">{trendData.contractualVade}</span>
              <span className="stat-sub">Anlaşmalı/Açık Borç Yaşı</span>
            </div>

            <div className="glass-card highlight">
              <span className="stat-label">3 Aylık Ödeme Hızı</span>
              <span className="stat-value text-green">{trendData.actualPaymentDays.days3M}</span>
              <span className="stat-sub">Son 90 Gün Gerçekleşen</span>
            </div>

            <div className="glass-card">
              <span className="stat-label">6 Aylık Ödeme Hızı</span>
              <span className="stat-value text-blue">{trendData.actualPaymentDays.days6M}</span>
              <span className="stat-sub">Son 180 Gün Ortalama</span>
            </div>

            <div className="glass-card">
              <span className="stat-label">12 Aylık Ödeme Hızı</span>
              <span className="stat-value text-purple">{trendData.actualPaymentDays.days12M}</span>
              <span className="stat-sub">Son 365 Gün Yıllık</span>
            </div>
          </div>

          {/* AI Insight Box */}
          <div className="ai-insight">
            <div className="ai-icon">💡</div>
            <div className="ai-content">
              <h3>Akıllı Tahsilat & Risk Öngörüsü</h3>
              <p>{trendData.riskInsight}</p>
              <div className="ai-insight-sub" style={{ marginTop: '10px' }}>
                <strong>Tahmini Tahsilat Süreci:</strong> Yeni kesilecek faturaların tahsilatının müşterinin son 3 aylık ortalama 
                ödeme alışkanlığı olan <strong>{trendData.actualPaymentDays.days3M}</strong> içerisinde gerçekleşmesi öngörülmektedir.
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Kapat</button>
        </div>
      </div>

      {showStatement && (
        <CustomerStatementModal 
          customer={customer} 
          onClose={() => setShowStatement(false)} 
        />
      )}
    </div>,
    document.body
  );
}

