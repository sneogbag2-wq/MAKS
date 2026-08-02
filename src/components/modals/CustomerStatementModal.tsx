import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, formatDate, getCustomerStatement, setDashboardActiveFilters } from '../../services/customerService';
import { exportToCorporateExcel, printReportHTML } from '../../utils/exportUtils';
import CopyBadge from '../common/CopyBadge';

interface CustomerStatementModalProps {
  customer: any;
  onClose: () => void;
  initialStartDate?: string;
  initialEndDate?: string;
}

export default function CustomerStatementModal({ customer, onClose, initialStartDate = '', initialEndDate = '' }: CustomerStatementModalProps) {
  const [statementData, setStatementData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'asc' });

  const effectiveStart = customer?.startDate || initialStartDate || '';
  const effectiveEnd = customer?.endDate || initialEndDate || '';

  const [datePreset, setDatePreset] = useState(effectiveStart || effectiveEnd ? 'CUSTOM' : 'ALL');
  const [startDate, setStartDate] = useState(effectiveStart);
  const [endDate, setEndDate] = useState(effectiveEnd);

  useEffect(() => {
    if (customer) {
      setDashboardActiveFilters({
        modalCustomer: customer,
        modalStartDate: startDate,
        modalEndDate: endDate
      });
    }
    return () => {
      setDashboardActiveFilters({
        modalCustomer: null,
        modalStartDate: '',
        modalEndDate: ''
      });
    };
  }, [customer, startDate, endDate]);

  useEffect(() => {
    if (customer) {
      const s = customer.startDate || initialStartDate || '';
      const e = customer.endDate || initialEndDate || '';
      setStartDate(s);
      setEndDate(e);
      setDatePreset(s || e ? 'CUSTOM' : 'ALL');

      setLoading(true);
      getCustomerStatement(customer.customerId).then(data => {
        setStatementData(data);
        setLoading(false);
      }).catch(err => {
        console.error('Ekstre yükleme hatası:', err);
        setLoading(false);
      });
    }
  }, [customer, initialStartDate, initialEndDate]);

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

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();

    if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      setStartDate(firstDay);
      setEndDate(lastDay);
    } else if (preset === 'LAST_3M') {
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
      setStartDate(threeMonthsAgo);
      setEndDate(now.toISOString().slice(0, 10));
    } else if (preset === 'YEAR_2026') {
      setStartDate('2026-01-01');
      setEndDate('2026-12-31');
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const filteredAndSortedTransactions = useMemo(() => {
    if (!statementData || !statementData.transactions) return [];
    let list = [...statementData.transactions];

    if (filterType !== 'ALL') {
      list = list.filter(t => t.type.toUpperCase().includes(filterType));
    }

    if (filterText) {
      const q = filterText.toLowerCase();
      list = list.filter(t => 
        (t.docNo || '').toLowerCase().includes(q) ||
        (t.type || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }

    if (startDate) {
      list = list.filter(t => String(t.date || '').slice(0, 10) >= startDate);
    }
    if (endDate) {
      list = list.filter(t => String(t.date || '').slice(0, 10) <= endDate);
    }

    list.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];

      if (sortConfig.key === 'date') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
        
        if (aVal === bVal && a._originalIndex !== undefined && b._originalIndex !== undefined) {
          return sortConfig.direction === 'asc' 
            ? a._originalIndex - b._originalIndex 
            : b._originalIndex - a._originalIndex;
        }
      } else if (['debit', 'credit', 'balance'].includes(sortConfig.key)) {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else {
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [statementData, filterText, filterType, startDate, endDate, sortConfig]);

  const handleExportExcel = () => {
    if (!filteredAndSortedTransactions.length) return;
    exportToCorporateExcel({
      title: 'CARİ HESAP EKSTRESİ',
      customer,
      subtitle: `Toplam ${filteredAndSortedTransactions.length} Hareket`,
      fileName: `Cari_Ekstre_${customer?.customerId}_${Date.now()}.xlsx`,
      sheetName: 'Ekstre',
      columns: [
        { header: 'İşlem Tarihi', excelValue: (r: any) => formatDate(r.date) },
        { header: 'İşlem Türü', excelValue: (r: any) => r.type },
        { header: 'Açıklama', excelValue: (r: any) => r.description || '' },
        { header: 'Belge / Fatura No', excelValue: (r: any) => r.docNo || '' },
        { header: 'Borç (TL)', key: 'debit', isNumeric: true, excelValue: (r: any) => r.debit || 0 },
        { header: 'Alacak (TL)', key: 'credit', isNumeric: true, excelValue: (r: any) => r.credit || 0 },
        { header: 'Küm. Bakiye (TL)', key: 'balance', isNumeric: true, excelValue: (r: any) => r.balance || 0 }
      ],
      rows: filteredAndSortedTransactions
    });
  };

  const handlePrintPDF = () => {
    if (!filteredAndSortedTransactions.length) return;
    printReportHTML({
      title: 'CARİ HESAP EKSTRESİ',
      customer,
      subtitle: `Toplam ${filteredAndSortedTransactions.length} Hareket`,
      summaryBoxes: [
        { label: 'GÜNCEL BAKİYE', value: `${formatCurrency(Math.abs(statementData?.balance || 0))} ${statementData?.balance > 0 ? '(B)' : '(A)'}`, color: statementData?.balance > 0 ? '#dc2626' : '#059669' },
        { label: 'TOPLAM SATIŞ', value: formatCurrency(statementData?.transactions?.filter((t: any) => t.debit > 0).reduce((s: number, t: any) => s + t.debit, 0) || 0), color: '#2563eb' },
        { label: 'TOPLAM TAHSİLAT', value: formatCurrency(statementData?.transactions?.filter((t: any) => t.credit > 0).reduce((s: number, t: any) => s + t.credit, 0) || 0), color: '#059669' }
      ],
      columns: [
        { header: 'İşlem Tarihi', render: (r: any) => formatDate(r.date) },
        { header: 'İşlem Türü', render: (r: any) => r.type },
        { header: 'Belge No', render: (r: any) => r.docNo },
        { header: 'Açıklama', render: (r: any) => r.description },
        { header: 'Borç (TL)', align: 'right', render: (r: any) => r.debit > 0 ? formatCurrency(r.debit) : '-' },
        { header: 'Alacak (TL)', align: 'right', render: (r: any) => r.credit > 0 ? formatCurrency(r.credit) : '-' },
        { header: 'Bakiye (TL)', align: 'right', render: (r: any) => `${formatCurrency(Math.abs(r.balance))} ${r.balance > 0 ? '(B)' : '(A)'}` }
      ],
      rows: filteredAndSortedTransactions
    });
  };

  if (!customer) return null;

  return createPortal(
    <div className="popup-modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div 
        className="modal modal-lg" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-glow-line"></div>
        <div className="modal-header" style={{ paddingBottom: '24px' }}>
          <div className="header-profile">
            <div className="avatar" style={{ background: 'linear-gradient(135deg, #2563EB, #4F46E5)' }}>
              📄
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button 
              onClick={handleExportExcel}
              className="btn btn-outline"
              title="Listeyi Excel (.xlsx) olarak indir"
              style={{ background: '#059669', border: 'none', color: '#fff' }}
            >
              📊 Excel
            </button>
            <button 
              onClick={handlePrintPDF}
              className="btn btn-primary"
              title="Resmi PDF Ekstre / Yazdır"
            >
              🖨️ PDF / Yazdır
            </button>

            {statementData && (
              <div className="balance-box" style={{ background: 'rgba(255,255,255,0.06)', padding: '6px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700, letterSpacing: '0.05em' }}>GÜNCEL BAKİYE</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: statementData.balance > 0 ? '#F87171' : (statementData.balance < 0 ? '#4ADE80' : '#FFFFFF') }} className="num">
                  {formatCurrency(Math.abs(statementData.balance))} {statementData.balance > 0 ? '(B)' : (statementData.balance < 0 ? '(A)' : '')}
                </div>
              </div>
            )}
            
            <button className="btn-close" onClick={onClose} title="Kapat">✕</button>
          </div>
        </div>

        <div className="modern-nav-wrapper">
          <div className="modern-nav-item active">Hesap Ekstresi</div>
          {statementData && (
            <div className="modern-nav-item" style={{ pointerEvents: 'none', color: '#60A5FA' }}>
              📊 Toplam {filteredAndSortedTransactions.length} Hareket
            </div>
          )}
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxHeight: '75vh', background: 'transparent' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '12px', color: '#94A3B8', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</span>
                <input 
                  type="text" 
                  placeholder="Fatura no, işlem türü veya açıklama ara..." 
                  value={filterText}
                  onChange={e => setFilterText(e.target.value)}
                  style={{ 
                    width: '100%', 
                    padding: '9px 12px 9px 36px', 
                    borderRadius: '8px', 
                    border: '1px solid rgba(255, 255, 255, 0.15)', 
                    background: 'rgba(255, 255, 255, 0.06)', 
                    color: '#F8FAFC', 
                    fontSize: '0.85rem', 
                    fontWeight: 500,
                    boxShadow: 'none',
                    outline: 'none'
                  }}
                />
              </div>
              <select 
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                style={{ 
                  padding: '9px 14px', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(255, 255, 255, 0.15)', 
                  background: 'rgba(255, 255, 255, 0.06)', 
                  color: '#F8FAFC', 
                  fontSize: '0.85rem', 
                  fontWeight: 600, 
                  minWidth: '180px',
                  boxShadow: 'none',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="ALL">Tüm İşlem Türleri</option>
                <option value="SATIŞ">Satış Faturaları</option>
                <option value="TAHSİLAT">Tahsilatlar</option>
                <option value="ALACAK DEKONTU">Alacak Dekontları / İadeler</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', background: 'rgba(255, 255, 255, 0.04)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94A3B8', marginRight: '4px' }}>📅 Tarih Süzgeci:</span>
              
              {[
                { id: 'ALL', label: 'Tüm Zamanlar' },
                { id: 'THIS_MONTH', label: 'Bu Ay' },
                { id: 'LAST_3M', label: 'Son 3 Ay' },
                { id: 'YEAR_2026', label: '2026 Yılı' },
              ].map(preset => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetChange(preset.id)}
                  style={{
                    background: datePreset === preset.id ? '#2563EB' : 'rgba(255, 255, 255, 0.08)',
                    color: datePreset === preset.id ? '#FFFFFF' : '#CBD5E1',
                    border: `1px solid ${datePreset === preset.id ? '#1D4ED8' : 'rgba(255, 255, 255, 0.15)'}`,
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {preset.label}
                </button>
              ))}

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                <input 
                  type="date"
                  value={startDate}
                  onChange={e => { setStartDate(e.target.value); setDatePreset('CUSTOM'); }}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.15)', fontSize: '0.75rem', color: '#F8FAFC', background: 'rgba(255, 255, 255, 0.06)' }}
                />
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>-</span>
                <input 
                  type="date"
                  value={endDate}
                  onChange={e => { setEndDate(e.target.value); setDatePreset('CUSTOM'); }}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.15)', fontSize: '0.75rem', color: '#F8FAFC', background: 'rgba(255, 255, 255, 0.06)' }}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontWeight: 600 }}>
              ⟳ Hesap ekstresi yükleniyor...
            </div>
          ) : !statementData || !statementData.transactions || statementData.transactions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              Bu müşteriye ait hesap hareketi bulunmamaktadır.
            </div>
          ) : (
            <table className="popup-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('date')}>İşlem Tarihi{getSortIcon('date')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('type')}>İşlem Türü{getSortIcon('type')}</th>
                  <th style={{ cursor: 'pointer' }} onClick={() => requestSort('docNo')}>Belge / Fatura No{getSortIcon('docNo')}</th>
                  <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => requestSort('debit')}>Borç (₺){getSortIcon('debit')}</th>
                  <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => requestSort('credit')}>Alacak (₺){getSortIcon('credit')}</th>
                  <th style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => requestSort('balance')}>Bakiye (₺){getSortIcon('balance')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedTransactions.map((tr: any, idx: number) => {
                  const isSales = tr.type.includes('SATIŞ');
                  const isCollection = tr.type.includes('TAHSİLAT');
                  
                  return (
                    <tr key={`${tr.id}-${idx}`}>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{formatDate(tr.date)}</td>
                      <td>
                        <span style={{ 
                          fontWeight: 700, 
                          color: isSales ? '#DC2626' : (isCollection ? '#059669' : '#4F46E5'),
                          background: isSales ? 'rgba(220,38,38,0.1)' : (isCollection ? 'rgba(5,150,105,0.1)' : 'rgba(79,70,229,0.1)'),
                          border: `1px solid ${isSales ? 'rgba(220,38,38,0.2)' : (isCollection ? 'rgba(5,150,105,0.2)' : 'rgba(79,70,229,0.2)')}`,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          display: 'inline-block'
                        }}>
                          {tr.type}
                        </span>
                        <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '3px' }}>{tr.description}</div>
                      </td>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <code style={{ fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{tr.docNo}</code>
                          {tr.docNo && <CopyBadge textToCopy={tr.docNo} size="small" />}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', color: tr.debit > 0 ? '#DC2626' : '#94A3B8', fontWeight: tr.debit > 0 ? 700 : 400 }} className="num">
                        {tr.debit > 0 ? formatCurrency(tr.debit) : '-'}
                      </td>
                      <td style={{ textAlign: 'right', color: tr.credit > 0 ? '#059669' : '#94A3B8', fontWeight: tr.credit > 0 ? 700 : 400 }} className="num">
                        {tr.credit > 0 ? formatCurrency(tr.credit) : '-'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#0F172A' }} className="num">
                        {formatCurrency(Math.abs(tr.balance))} {tr.balance > 0 ? '(B)' : (tr.balance < 0 ? '(A)' : '')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
