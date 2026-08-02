// src/components/modals/ChequeSenetModal.tsx
// Müşteri Çek & Senet Portföy, Risk Detayı ve Manuel Yönetim (CRUD) Modalı

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  formatCurrency,
  formatDate,
  getCustomerCheques,
  addManualCheque,
  updateManualCheque,
  deleteManualCheque,
  getAllCustomersForReportingSync,
} from '../../services/customerService';
import { exportToCorporateExcel, printReportHTML } from '../../utils/exportUtils';
import CopyBadge from '../common/CopyBadge';
import { isAdminAuthenticated, subscribeAdminAuthChange } from '../../services/customRulesService';

interface ChequeSenetModalProps {
  customer: any;
  onClose: () => void;
  onDataChange?: () => void;
}

export function ChequeSenetModal({ customer, onClose, onDataChange }: ChequeSenetModalProps) {
  const [isAdmin, setIsAdmin] = useState(isAdminAuthenticated());
  const [cheques, setCheques] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  useEffect(() => {
    return subscribeAdminAuthChange(() => setIsAdmin(isAdminAuthenticated()));
  }, []);

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'dueDate', direction: 'asc' });
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterRep, setFilterRep] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const allCustomers = useMemo(() => getAllCustomersForReportingSync(), []);
  
  const repMap = useMemo(() => {
    const map: Record<string, string> = {};
    allCustomers.forEach(c => {
      map[c.customerId] = c.salesRepName || 'Key Account';
    });
    return map;
  }, [allCustomers]);

  const uniqueReps = useMemo(() => {
    return [...new Set(Object.values(repMap))].sort();
  }, [repMap]);

  const [formData, setFormData] = useState({
    type: 'ÇEK',
    docNo: '',
    subNo: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    amount: '',
    bankName: '',
    description: '',
    status: 'PORTFOY',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const fetchId = customer?.customerId === 'GLOBAL' ? null : customer?.customerId;
      const list = await getCustomerCheques(fetchId);
      setCheques(list);
    } catch (e) {
      console.error('Çek listesi okuma hatası:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (customer) {
      loadData();
    }
  }, [customer]);

  const totalChequeRisk = cheques.filter(c => (c.status || 'PORTFOY') === 'PORTFOY').reduce((s, c) => s + (c.amount || 0), 0);
  const cekList = cheques.filter((c) => c.type === 'ÇEK' && (c.status || 'PORTFOY') === 'PORTFOY');
  const senetList = cheques.filter((c) => c.type === 'SENET' && (c.status || 'PORTFOY') === 'PORTFOY');

  const cekSum = cekList.reduce((s, c) => s + (c.amount || 0), 0);
  const senetSum = senetList.reduce((s, c) => s + (c.amount || 0), 0);

  const upcomingMonthBreakdown = useMemo(() => {
    const monthsMap: Record<string, { key: string; label: string; count: number; sum: number }> = {};
    cheques.filter(c => (c.status || 'PORTFOY') === 'PORTFOY').forEach(c => {
      if (!c.dueDate) return;
      const date = new Date(c.dueDate);
      if (isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthNames = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
      const label = `${monthNames[date.getMonth() + 1]} ${date.getFullYear()}`;
      
      if (!monthsMap[key]) {
        monthsMap[key] = { key, label, count: 0, sum: 0 };
      }
      monthsMap[key].count++;
      monthsMap[key].sum += (c.amount || 0);
    });

    return Object.values(monthsMap).sort((a, b) => a.key.localeCompare(b.key)).slice(0, 3);
  }, [cheques]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' 🔼' : ' 🔽';
  };

  const filteredAndSortedCheques = useMemo(() => {
    let result = [...cheques];

    if (filterStatus !== 'ALL') {
      result = result.filter(c => (c.status || 'PORTFOY') === filterStatus);
    }

    if (filterText) {
      const q = filterText.toLowerCase();
      result = result.filter(c => 
        (c.customerName || '').toLowerCase().includes(q) ||
        (c.customerId || '').toLowerCase().includes(q) ||
        (c.docNo || '').toLowerCase().includes(q) ||
        (c.subNo || '').toLowerCase().includes(q) ||
        (c.bankName || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q)
      );
    }

    if (filterRep !== 'ALL') {
      result = result.filter(c => repMap[c.customerId] === filterRep);
    }

    if (startDate) {
      result = result.filter(c => new Date(c.dueDate) >= new Date(startDate));
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(c => new Date(c.dueDate) <= end);
    }

    result.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.key === 'amount') {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else if (sortConfig.key === 'issueDate' || sortConfig.key === 'dueDate') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [cheques, sortConfig, filterText, filterStatus, filterRep, startDate, endDate, repMap]);

  const getVadeBadge = (dueDate: string, status: string) => {
    const st = status || 'PORTFOY';
    if (st === 'ODENDI' || st === 'TAHSIL_EDILDI') {
      return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>🟢 Ödendi</span>;
    }
    if (st === 'IADE' || st === 'KARSILIKSIZ' || st === 'CANCELLED') {
      return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>🔴 İade</span>;
    }

    if (!dueDate) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, background: '#ef4444', color: '#ffffff', boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}>🚨 BUGÜN VADELİ</span>;
    }
    if (diffDays < 0) {
      return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(239,68,68,0.15)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)' }}>🔴 {Math.abs(diffDays)} Gün Geçti</span>;
    }
    return <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(16,185,129,0.15)', color: '#059669', border: '1px solid rgba(16,185,129,0.3)' }}>🟢 {diffDays} Gün Var</span>;
  };

  const handleExportExcel = () => {
    if (!filteredAndSortedCheques.length) return;
    exportToCorporateExcel({
      title: 'ÇEK & SENET PORTFÖYÜ VE RİSK RAPORU',
      customer,
      subtitle: `Toplam ${filteredAndSortedCheques.length} Evrak`,
      fileName: `Cek_Senet_Portfoyu_${customer?.customerId || 'GLOBAL'}_${Date.now()}.xlsx`,
      sheetName: 'Portfoy',
      columns: [
        { header: 'Tür', excelValue: (c: any) => c.type },
        { header: 'Cari Adı / Firma', excelValue: (c: any) => c.customerName || c.customerId || '-' },
        { header: 'Belge / Seri No', excelValue: (c: any) => c.docNo || '-' },
        { header: 'Çek/Senet No', excelValue: (c: any) => c.subNo || '-' },
        { header: 'İşlem Tarihi', excelValue: (c: any) => formatDate(c.issueDate) },
        { header: 'Vade Tarihi', excelValue: (c: any) => formatDate(c.dueDate) },
        { header: 'Banka / Açıklama', excelValue: (c: any) => c.bankName || c.description || '-' },
        { header: 'Tutar (TL)', key: 'amount', isNumeric: true, excelValue: (c: any) => c.amount || 0 },
        { header: 'Durum', excelValue: (c: any) => c.status || 'PORTFOY' }
      ],
      rows: filteredAndSortedCheques
    });
  };

  const handlePrintPDF = () => {
    if (!filteredAndSortedCheques.length) return;
    printReportHTML({
      title: 'ÇEK & SENET PORTFÖYÜ VE RİSK RAPORU',
      customer,
      subtitle: `Toplam ${filteredAndSortedCheques.length} Evrak`,
      summaryBoxes: [
        { label: 'TOPLAM RİSK', value: formatCurrency(totalChequeRisk), color: '#ec4899' },
        { label: 'ÇEK PORTFÖYÜ', value: formatCurrency(cekSum), color: '#2563eb' },
        { label: 'SENET PORTFÖYÜ', value: formatCurrency(senetSum), color: '#8b5cf6' }
      ],
      columns: [
        { header: 'Tür', render: (r: any) => r.type },
        { header: 'Cari Adı', render: (r: any) => r.customerName || r.customerId || '-' },
        { header: 'Belge No', render: (r: any) => `${r.docNo || ''} ${r.subNo ? '/ '+r.subNo : ''}` },
        { header: 'İşlem Tarihi', render: (r: any) => formatDate(r.issueDate) },
        { header: 'Vade Tarihi', render: (r: any) => formatDate(r.dueDate) },
        { header: 'Banka / Açıklama', render: (r: any) => r.bankName || r.description || '-' },
        { header: 'Tutar (TL)', align: 'right', render: (r: any) => formatCurrency(r.amount) },
        { header: 'Durum', render: (r: any) => r.status || 'PORTFOY' }
      ],
      rows: filteredAndSortedCheques
    });
  };

  const resetForm = () => {
    setFormData({
      type: 'ÇEK',
      docNo: '',
      subNo: '',
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: '',
      amount: '',
      bankName: '',
      description: '',
      status: 'PORTFOY',
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.dueDate) {
      alert('Lütfen Tutar ve Vade Tarihi alanlarını doldurunuz.');
      return;
    }

    try {
      const payload = {
        ...formData,
        customerId: customer.customerId === 'GLOBAL' ? '5000078523' : customer.customerId,
        customerName: customer.customerId === 'GLOBAL' ? 'MANUEL KAYIT' : (customer.signName || customer.customerName),
        amount: parseFloat(formData.amount),
      };

      if (editingItem) {
        const itemId = editingItem.id || editingItem.chequeId || (editingItem.docNo && editingItem.subNo ? `${editingItem.docNo}_${editingItem.subNo}` : editingItem.docNo);
        await updateManualCheque(itemId, payload);
      } else {
        await addManualCheque(payload);
      }

      resetForm();
      await loadData();
      if (onDataChange) onDataChange();
    } catch (err: any) {
      console.error('Kayıt oluşturma hatası:', err);
      alert(`Kayıt kaydedilirken hata oluştu: ${err.message}`);
    }
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      type: item.type || 'ÇEK',
      docNo: item.docNo || '',
      subNo: item.subNo || '',
      issueDate: item.issueDate ? item.issueDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      dueDate: item.dueDate ? item.dueDate.slice(0, 10) : '',
      amount: item.amount || '',
      bankName: item.bankName || '',
      description: item.description || '',
      status: item.status || 'PORTFOY',
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bu çek/senet kaydını silmek istediğinize emin misiniz?')) return;
    try {
      await deleteManualCheque(id);
      await loadData();
      if (onDataChange) onDataChange();
    } catch (err: any) {
      alert(`Silme hatası: ${err.message}`);
    }
  };

  if (!customer) return null;

  return createPortal(
    <div className="popup-modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal modal-lg"
        style={{ width: '95%', maxWidth: customer?.customerId === 'GLOBAL' ? '1150px' : '950px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-glow-line" style={{ background: 'linear-gradient(90deg, transparent, #ec4899, transparent)', boxShadow: '0 0 25px rgba(236, 72, 153, 0.35)' }}></div>
        
        <div className="modal-header" style={{ paddingBottom: '24px' }}>
          <div className="header-profile">
            <div
              className="avatar"
              style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)' }}
            >
              📄
            </div>
            <div className="profile-info">
              <h2>{customer.signName || customer.customerName}</h2>
              <div className="metadata-row">
                <div className="meta-item">
                  <span className="icon">🔑</span>
                  Cari Kod: <span className="meta-val">{customer.customerId}</span>
                </div>
                {customer.customerId !== 'GLOBAL' && (
                  <div className="meta-item">
                    <span className="icon">💵</span>
                    Açık Bakiye: <span className="meta-val">{formatCurrency(customer.balance)}</span>
                  </div>
                )}
                <div className="meta-item">
                  <span className="icon">🎟️</span>
                  Çek/Senet Riski: <span className="meta-val" style={{ color: '#f472b6', fontWeight: 700 }}>{formatCurrency(totalChequeRisk)}</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              onClick={handleExportExcel}
              className="btn btn-outline"
              style={{ background: '#059669', border: 'none', color: '#fff' }}
              title="Çek/Senet listesini Excel olarak indir"
            >
              📊 Excel
            </button>
            <button 
              onClick={handlePrintPDF}
              className="btn btn-primary"
              title="Çek/Senet listesini PDF olarak yazdır"
            >
              🖨️ PDF / Yazdır
            </button>
            <button className="btn-close" onClick={onClose} title="Kapat">✕</button>
          </div>
        </div>

        <div className="modern-nav-wrapper">
          <div className="modern-nav-item active">Çek & Senet Portföyü</div>
        </div>


        <div style={{ padding: '0 20px 20px 20px', overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: '75vh' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px', marginTop: '20px' }}>
            <div className="glass-mini-card">
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOPLAM ÇEK/SENET RİSKİ</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }} className="num">
                {formatCurrency(totalChequeRisk)}
              </div>
            </div>
            <div className="glass-mini-card">
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>ÇEK PORTFÖYÜ ({cekList.length} Adet)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ec4899', marginTop: '4px' }} className="num">
                {formatCurrency(cekSum)}
              </div>
            </div>
            <div className="glass-mini-card">
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>SENET PORTFÖYÜ ({senetList.length} Adet)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#8b5cf6', marginTop: '4px' }} className="num">
                {formatCurrency(senetSum)}
              </div>
            </div>
          </div>

          {upcomingMonthBreakdown.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', background: 'rgba(255, 255, 255, 0.04)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8', alignSelf: 'center' }}>🗓️ Gelecek Vade Dağılımı:</span>
              {upcomingMonthBreakdown.map(m => (
                <div key={m.key} style={{ background: 'rgba(255, 255, 255, 0.06)', padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(255, 255, 255, 0.12)', flex: 1 }}>
                  <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600 }}>{m.label} ({m.count} Evrak)</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#F8FAFC', marginTop: '2px' }} className="num">{formatCurrency(m.sum)}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <h4 style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                Müşteri Evrak Listesi ({filteredAndSortedCheques.length} / {cheques.length})
              </h4>

              {!showAddForm && isAdmin && (
                <button
                  onClick={() => setShowAddForm(true)}
                  style={{
                    background: 'var(--accent-primary)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  + Manuel Çek/Senet Ekle
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', background: 'rgba(255, 255, 255, 0.04)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <input 
                type="text" 
                placeholder="Cari Adı, Belge No, Banka veya Açıklama ara..." 
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                style={{ flex: 2, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.15)', background: 'rgba(255, 255, 255, 0.06)', color: '#F8FAFC', fontSize: '0.8rem', minWidth: '200px' }}
              />
              <select 
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.15)', background: 'rgba(255, 255, 255, 0.06)', color: '#F8FAFC', fontSize: '0.8rem', minWidth: '140px' }}
              >
                <option value="ALL">Tüm Durumlar</option>
                <option value="PORTFOY">Portföy (Açık)</option>
                <option value="ODENDI">Ödendi / Tahsil Edildi</option>
                <option value="IADE">İade / Karşılıksız</option>
                <option value="CREATED">Manuel Eklenen</option>
              </select>
              {customer?.customerId === 'GLOBAL' && (
                <select 
                  value={filterRep}
                  onChange={e => setFilterRep(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.15)', background: 'rgba(255, 255, 255, 0.06)', color: '#F8FAFC', fontSize: '0.8rem', minWidth: '140px' }}
                >
                  <option value="ALL">Tüm Temsilciler</option>
                  {uniqueReps.map(rep => (
                    <option key={rep} value={rep}>{rep}</option>
                  ))}
                </select>
              )}

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94A3B8' }}>Vade:</span>
                <input 
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.15)', fontSize: '0.75rem', color: '#F8FAFC', background: 'rgba(255, 255, 255, 0.06)' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>-</span>
                <input 
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.15)', fontSize: '0.75rem', color: '#F8FAFC', background: 'rgba(255, 255, 255, 0.06)' }}
                />
              </div>
            </div>
          </div>

          {showAddForm && (
            <form onSubmit={handleSubmit} className="glass-mini-card" style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                  {editingItem ? '✏️ Çek/Senet Düzenle' : '➕ Yeni Çek/Senet Kaydı'}
                </strong>
                <button type="button" onClick={resetForm} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Evrak Tipi</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="form-input"
                  >
                    <option value="ÇEK">🎟️ ÇEK</option>
                    <option value="SENET">📄 SENET</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Belge No</label>
                  <input
                    type="text"
                    value={formData.docNo}
                    onChange={(e) => setFormData({ ...formData, docNo: e.target.value })}
                    placeholder="Örn: 1501507156"
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Çek/Senet No</label>
                  <input
                    type="text"
                    value={formData.subNo}
                    onChange={(e) => setFormData({ ...formData, subNo: e.target.value })}
                    placeholder="Örn: 253846"
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Tutar (TL) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="Örn: 50000"
                    className="form-input"
                    style={{ fontWeight: 'bold' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Alınış / İşlem Tarihi</label>
                  <input
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Vade Tarihi *</label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2', marginBottom: 0 }}>
                  <label className="form-label">Banka / Açıklama</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    placeholder="Banka adı veya açıklama..."
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Durum</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="form-input"
                  >
                    <option value="PORTFOY">Portföyde (Riskte Kalır)</option>
                    <option value="TAHSILDE">Tahsilde / Bankada (Riskte Kalır)</option>
                    <option value="ODENDI">✅ Ödendi / Tahsil Edildi</option>
                    <option value="IADE">⚠️ İade Edildi / Karşılıksız</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn btn-outline"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: '#ec4899', boxShadow: '0 4px 15px rgba(236, 72, 153, 0.4)' }}
                >
                  {editingItem ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)' }}>
              ⟳ Çek & Senet kayıtları yükleniyor...
            </div>
          ) : cheques.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              Bu cari için kayıtlı çek veya senet bulunmamaktadır.
            </div>
          ) : (
            <table className="popup-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('type')}>Tür{getSortIcon('type')}</th>
                  {customer?.customerId === 'GLOBAL' && (
                    <th style={{ cursor: 'pointer' }} onClick={() => requestSort('customerName')}>Cari Adı / Firma{getSortIcon('customerName')}</th>
                  )}
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('docNo')}>Belge / Seri No{getSortIcon('docNo')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('issueDate')}>İşlem Tarihi{getSortIcon('issueDate')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('dueDate')}>Vade Tarihi{getSortIcon('dueDate')}</th>
                  <th>Vade Durumu</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('bankName')}>Banka / Açıklama{getSortIcon('bankName')}</th>
                  <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => requestSort('amount')}>Tutar{getSortIcon('amount')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('status')}>Durum{getSortIcon('status')}</th>
                  {isAdmin && <th style={{ textAlign: 'center' }}>İşlemler</th>}
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedCheques.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: item.type === 'SENET' ? 'rgba(99,102,241,0.15)' : 'rgba(236,72,153,0.15)',
                          color: item.type === 'SENET' ? '#8b5cf6' : '#ec4899',
                        }}
                      >
                        {item.type === 'SENET' ? '📄 SENET' : '🎟️ ÇEK'}
                      </span>
                    </td>
                    {customer?.customerId === 'GLOBAL' && (
                      <td style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.customerName || item.customerId || '-'}
                      </td>
                    )}
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <code style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>
                          {item.docNo || '-'}{item.subNo ? ` / ${item.subNo}` : ''}
                        </code>
                        {(item.docNo || item.subNo) && <CopyBadge textToCopy={item.docNo || item.subNo} size="small" />}
                      </div>
                    </td>
                    <td>{formatDate(item.issueDate)}</td>
                    <td style={{ fontWeight: 600 }}>{formatDate(item.dueDate)}</td>
                    <td>{getVadeBadge(item.dueDate, item.status)}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {item.bankName || item.description || '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }} className="num">
                      {formatCurrency(item.amount)}
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: item.status === 'IADE' || item.status === 'KARSILIKSIZ' || item.status === 'CANCELLED' 
                            ? 'rgba(239,68,68,0.12)' 
                            : item.status === 'ODENDI' || item.status === 'TAHSIL_EDILDI'
                            ? 'rgba(16,185,129,0.12)'
                            : item.status === 'CREATED'
                            ? 'rgba(245,158,11,0.12)'
                            : 'rgba(59,130,246,0.12)',
                          color: item.status === 'IADE' || item.status === 'KARSILIKSIZ' || item.status === 'CANCELLED' 
                            ? '#ef4444' 
                            : item.status === 'ODENDI' || item.status === 'TAHSIL_EDILDI'
                            ? '#10b981'
                            : item.status === 'CREATED'
                            ? '#f59e0b'
                            : '#3b82f6',
                        }}
                      >
                        {item.status || 'PORTFOY'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => handleEdit(item)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', marginRight: '8px', fontSize: '0.85rem' }}
                          title="Düzenle"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}
                          title="Sil"
                        >
                          🗑️
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
