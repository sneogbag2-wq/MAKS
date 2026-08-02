// src/pages/CariPage.tsx — Lazy Load v2 + Manual Entry & Sliced Transaction Rendering
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  searchCustomers,
  getCustomerStatement,
  subscribeDataChange,
  addManualInvoice,
  addManualCollection,
  addVirmanTransfer,
  deleteTransactionRecord,
  setHoverAnalyticsData
} from '../services/customerService';
import { useDebounce } from '../hooks/useDebounce';
import { formatCurrency, formatDate } from '../utils/formatters';
import { isAdminAuthenticated, subscribeAdminAuthChange } from '../services/customRulesService';
import './CariPage.css';

const MIN_QUERY_LENGTH = 2;
const BAR_COUNT = 5;
const INITIAL_LIMIT = 15;

function buildAgingCards(aging: any) {
  const dist = aging?.distribution || {};
  return [
    { label: '0–30 Gün Vade',  value: aging?.current || 0,  tone: 'var(--accent-green)',  amounts: dist.current || [] },
    { label: '31–60 Gün Vade', value: aging?.days30 || 0,   tone: 'var(--accent-orange)', amounts: dist.days30 || [] },
    { label: '61–90 Gün Vade', value: aging?.days60 || 0,   tone: 'var(--accent-red)',    amounts: dist.days60 || [] },
    {
      label: '> 90 Gün Vade',
      value: (aging?.days90 || 0) + (aging?.over90 || 0),
      tone: 'var(--accent-rose)',
      amounts: [...(dist.days90 || []), ...(dist.over90 || [])].sort((a: number, b: number) => b - a),
    },
  ];
}

function AgingBars({ amounts }: { amounts: number[] }) {
  const values = (amounts || []).slice(0, BAR_COUNT);
  const max = values.length > 0 ? Math.max(...values) : 0;

  return (
    <div className="cari-aging-bars" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const amount = values[i];
        const on = amount > 0 && max > 0;
        const height = on ? 30 + (amount / max) * 70 : 14;
        return (
          <span
            key={i}
            className={`cari-aging-bar${on ? ' cari-aging-bar--on' : ''}`}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}

export default function CariPage() {
  const [isAdmin, setIsAdmin]       = useState(isAdminAuthenticated());
  const [query, setQuery]           = useState('');
  const [customers, setCustomers]   = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statement, setStatement]   = useState<any>(null);
  const [listLoading, setListLoading]       = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    return subscribeAdminAuthChange(() => setIsAdmin(isAdminAuthenticated()));
  }, []);

  const [displayLimit, setDisplayLimit] = useState(INITIAL_LIMIT);
  const [sortOrder, setSortOrder]       = useState<'NEWEST_FIRST' | 'CHRONOLOGICAL'>('NEWEST_FIRST');

  const [showInvoiceModal, setShowInvoiceModal]       = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showVirmanModal, setShowVirmanModal]         = useState(false);
  const [actionLoading, setActionLoading]             = useState(false);
  const [formError, setFormError]                     = useState('');

  const [invoiceForm, setInvoiceForm] = useState({ date: new Date().toISOString().split('T')[0], docNo: '', amount: '', description: '' });
  const [collectionForm, setCollectionForm] = useState({ date: new Date().toISOString().split('T')[0], docNo: '', amount: '', method: 'NAKİT', description: '' });
  const [virmanForm, setVirmanForm] = useState({ targetCustomerId: '', targetSearch: '', date: new Date().toISOString().split('T')[0], amount: '', description: '' });
  const [targetSearchResults, setTargetSearchResults] = useState<any[]>([]);

  const debouncedQuery = useDebounce(query, 300);
  const debouncedTargetQuery = useDebounce(virmanForm.targetSearch, 300);
  const abortRef = useRef<any>(null);

  useEffect(() => {
    if (debouncedQuery.trim().length < MIN_QUERY_LENGTH) {
      setCustomers([]);
      setHasSearched(false);
      setSelectedId(null);
      setStatement(null);
      return;
    }

    let active = true;
    setListLoading(true);
    setHasSearched(true);
    let runId = 0;

    const fetch = () => {
      const myRun = ++runId;
      searchCustomers(debouncedQuery, true).then((res) => {
        if (!active || myRun !== runId) return;
        setCustomers(res);
        setListLoading(false);
        setSelectedId((prev) => (prev && res.some((c: any) => c.customerId === prev) ? prev : null));
      });
    };

    fetch();
    const unsub = subscribeDataChange(fetch);
    return () => { active = false; unsub(); };
  }, [debouncedQuery]);

  const reloadStatement = () => {
    if (!selectedId) return;
    setStatementLoading(true);
    getCustomerStatement(selectedId).then((st) => {
      setStatement(st);
      setStatementLoading(false);
    });
  };

  useEffect(() => {
    setDisplayLimit(INITIAL_LIMIT);
    if (!selectedId) { setStatement(null); return; }

    if (abortRef.current) abortRef.current.cancelled = true;
    const token = { cancelled: false };
    abortRef.current = token;

    setStatementLoading(true);
    setStatement(null);

    getCustomerStatement(selectedId).then((st) => {
      if (token.cancelled) return;
      setStatement(st);
      setStatementLoading(false);
    });

    return () => { token.cancelled = true; };
  }, [selectedId]);

  useEffect(() => {
    if (debouncedTargetQuery.trim().length < 2) {
      setTargetSearchResults([]);
      return;
    }
    let isMounted = true;
    searchCustomers(debouncedTargetQuery, true).then((res) => {
      if (isMounted) {
        setTargetSearchResults(res.filter(c => c.customerId !== selectedId));
      }
    });
    return () => { isMounted = false; };
  }, [debouncedTargetQuery, selectedId]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.customerId === selectedId) ?? statement?.customer ?? null,
    [customers, selectedId, statement]
  );

  const sortedTransactions = useMemo(() => {
    if (!statement?.transactions) return [];
    const list = [...statement.transactions];
    if (sortOrder === 'NEWEST_FIRST') {
      list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    } else {
      list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    }
    return list;
  }, [statement?.transactions, sortOrder]);

  const visibleTransactions = useMemo(
    () => sortedTransactions.slice(0, displayLimit),
    [sortedTransactions, displayLimit]
  );

  const remainingCount = sortedTransactions.length - visibleTransactions.length;

  const handleAddInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!invoiceForm.amount || parseFloat(invoiceForm.amount) <= 0) {
      setFormError('Lütfen geçerli bir fatura tutarı girin');
      return;
    }
    setActionLoading(true);
    try {
      if (selectedId) {
        await addManualInvoice({
          customerId: selectedId,
          invoiceDate: invoiceForm.date,
          amount: parseFloat(invoiceForm.amount),
          eDocumentNo: invoiceForm.docNo.trim(),
          description: invoiceForm.description.trim()
        });
      }
      setShowInvoiceModal(false);
      setInvoiceForm({ date: new Date().toISOString().split('T')[0], docNo: '', amount: '', description: '' });
      reloadStatement();
    } catch (err: any) {
      setFormError(err.message || 'Fatura eklenirken hata oluştu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!collectionForm.amount || parseFloat(collectionForm.amount) <= 0) {
      setFormError('Lütfen geçerli bir tahsilat tutarı girin');
      return;
    }
    setActionLoading(true);
    try {
      if (selectedId) {
        await addManualCollection({
          customerId: selectedId,
          date: collectionForm.date,
          amount: parseFloat(collectionForm.amount),
          method: collectionForm.method,
          eDocumentNo: collectionForm.docNo.trim(),
          description: collectionForm.description.trim()
        });
      }
      setShowCollectionModal(false);
      setCollectionForm({ date: new Date().toISOString().split('T')[0], docNo: '', amount: '', method: 'NAKİT', description: '' });
      reloadStatement();
    } catch (err: any) {
      setFormError(err.message || 'Tahsilat eklenirken hata oluştu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddVirman = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!virmanForm.targetCustomerId) {
      setFormError('Lütfen borcun aktarılacağı hedef cariyi seçin');
      return;
    }
    if (!virmanForm.amount || parseFloat(virmanForm.amount) <= 0) {
      setFormError('Lütfen geçerli bir virman tutarı girin');
      return;
    }
    setActionLoading(true);
    try {
      if (selectedId) {
        await addVirmanTransfer({
          sourceCustomerId: selectedId,
          targetCustomerId: virmanForm.targetCustomerId,
          date: virmanForm.date,
          amount: parseFloat(virmanForm.amount),
          description: virmanForm.description.trim()
        });
      }
      setShowVirmanModal(false);
      setVirmanForm({ targetCustomerId: '', targetSearch: '', date: new Date().toISOString().split('T')[0], amount: '', description: '' });
      reloadStatement();
    } catch (err: any) {
      setFormError(err.message || 'Virman transferi yapılırken hata oluştu');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTransaction = async (tx: any) => {
    const confirmMsg = `Bu işlemi silmek istediğinize emin misiniz?\n\nİşlem: ${tx.type}\nBelge No: ${tx.docNo}\nTutar: ${formatCurrency(tx.debit || tx.credit)}`;
    if (!window.confirm(confirmMsg)) return;

    setActionLoading(true);
    try {
      if (selectedId) {
        await deleteTransactionRecord({ id: tx.id, type: tx.type, customerId: selectedId });
      }
      reloadStatement();
    } catch (err: any) {
      alert('İşlem silinirken hata oluştu: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="cari-page animate-fadeIn">
      <div className="cari-header">
        <div className="cari-header__top">
          <div>
            <div className="cari-header__title">Cari Yönetimi</div>
            <div className="cari-header__desc">
              En az {MIN_QUERY_LENGTH} karakter girerek cari kodu, müşteri adı veya tabela adıyla arama yapın.
            </div>
          </div>
          <span className="badge badge--purple">🤖 AI & Manuel Yönetim Ready</span>
        </div>

        <div className="cari-search-wrap">
          <span className="cari-search-icon">🔍</span>
          <input
            type="text"
            className="cari-search-input"
            placeholder="Cari kodu (5000XXXXXX), müşteri adı veya tabela adı..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {listLoading && (
            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-primary)', fontSize: '0.85rem' }}>
              <span className="animate-spin">⟳</span>
            </span>
          )}
        </div>
      </div>

      {!hasSearched && (
        <div className="cari-empty-home">
          <div className="cari-empty-home__icon">🔍</div>
          <div className="cari-empty-home__title">Cari aramaya başlayın</div>
          <div className="cari-empty-home__desc">
            Arama kutusuna en az {MIN_QUERY_LENGTH} karakter girerek müşteri listesi yüklenir.
            Ardından bir cari seçerek ekstreyi, manuel işlemleri (fatura, tahsilat, virman) ve yaşlandırma analizini yönetebilirsiniz.
          </div>
        </div>
      )}

      {hasSearched && (
        <div className="cari-content-grid animate-scaleIn">
          <div className="cari-list-card">
            <div className="cari-list-header">
              <span className="cari-list-header__label">{listLoading ? 'Aranıyor...' : `SONUÇLAR`}</span>
              {!listLoading && <span className="badge badge--neutral">{customers.length}</span>}
            </div>

            <div className="cari-list-scroll">
              {listLoading ? (
                <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[1,2,3,4,5].map((i) => (
                    <div key={i} className="skeleton" style={{ height: '66px', borderRadius: '9px' }} />
                  ))}
                </div>
              ) : customers.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-state__icon">😶</span>
                  <span>"{debouncedQuery}" için sonuç bulunamadı</span>
                </div>
              ) : customers.map((c) => (
                <div
                  key={c.customerId}
                  className={`cari-item${c.customerId === selectedId ? ' cari-item--selected' : ''}`}
                  onClick={() => setSelectedId(c.customerId)}
                  onMouseEnter={() => setHoverAnalyticsData({ type: 'CUSTOMER', title: c.signName || c.customerName, customerObj: c })}
                  onMouseLeave={() => setHoverAnalyticsData(null)}
                >
                  <span className="cari-item__id">{c.customerId}</span>
                  <div className="cari-item__name">{c.signName || c.customerName}</div>
                  <div className="cari-item__meta">
                    <span>{[c.district, c.province].filter(Boolean).join(', ') || '—'}</span>
                    <span
                      className="num"
                      style={{
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        color: c.balance > 0 ? 'var(--text-primary)' : c.balance < 0 ? 'var(--accent-green)' : 'var(--text-dim)',
                      }}
                    >
                      {formatCurrency(c.balance)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="cari-statement-card">
            {!selectedId ? (
              <div className="empty-state">
                <span className="empty-state__icon">👈</span>
                <span>Ekstre ve işlem yönetimi için listeden bir cari seçin</span>
              </div>
            ) : statementLoading ? (
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="skeleton" style={{ height: '72px', borderRadius: '12px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '4px' }}>
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="skeleton" style={{ height: '56px', borderRadius: '8px' }} />
                  ))}
                </div>
              </div>
            ) : statement && selectedCustomer ? (
              <>
                <div className="cari-info-card">
                  <div className="cari-info-card__left">
                    <div className="cari-info-card__name">{selectedCustomer.customerName}</div>
                    <div className="cari-info-card__meta">
                      <strong style={{ color: 'var(--accent-purple)' }}>{selectedCustomer.customerId}</strong>
                      {selectedCustomer.signName && <> &nbsp;·&nbsp; {selectedCustomer.signName}</>}
                      {selectedCustomer.salesRepName && <> &nbsp;·&nbsp; {selectedCustomer.salesRepName}</>}
                      {selectedCustomer.salesChannel && <> &nbsp;·&nbsp; {selectedCustomer.salesChannel}</>}
                    </div>
                  </div>
                  <div className="cari-info-card__right">
                    <div className="cari-balance-label">
                      {statement.balance > 0 ? 'BORÇ BAKİYE' : statement.balance < 0 ? 'ALACAK BAKİYE' : 'NET BAKİYE'}
                    </div>
                    <div
                      className="cari-balance-value num"
                      style={{
                        color: statement.balance > 0 ? 'var(--accent-red)'
                          : statement.balance < 0 ? 'var(--accent-green)'
                          : 'var(--text-primary)'
                      }}
                    >
                      {formatCurrency(statement.balance)}
                    </div>
                  </div>
                </div>

                {statement.aging && (
                  <>
                    <div className="cari-aging-grid">
                      {buildAgingCards(statement.aging).map((card) => (
                        <div
                          key={card.label}
                          className={`cari-aging-card${card.value > 0 ? ' cari-aging-card--filled' : ''}`}
                          style={{ '--aging-tone': card.tone } as React.CSSProperties}
                        >
                          <div className="cari-aging-card__top">
                            <span className="cari-aging-card__label">{card.label}</span>
                            <span className="cari-aging-card__dot" aria-hidden="true" />
                          </div>
                          <span className="cari-aging-card__val num">{formatCurrency(card.value)}</span>
                          <AgingBars amounts={card.amounts} />
                        </div>
                      ))}
                    </div>

                    <div className="cari-aging-summary">
                      <span className="cari-aging-summary__label">Ortalama Vade</span>
                      <span
                        className="cari-aging-summary__val num"
                        style={{ color: statement.aging.averageVade > 60 ? 'var(--accent-red)' : 'var(--accent-purple)' }}
                      >
                        {statement.aging.averageVade || 0} Gün
                      </span>
                      <span className="cari-aging-summary__note">
                        Ödenmemiş açık fatura bakiyesine göre ağırlıklı ortalama
                      </span>
                    </div>
                  </>
                )}

                <div className="cari-statement-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="cari-statement-header__title">Ekstre Hareketleri</span>
                    <span className="badge badge--neutral">{sortedTransactions.length} işlem</span>
                    <button
                      className="btn-action-sm"
                      style={{ fontSize: '0.72rem', padding: '4px 8px' }}
                      onClick={() => setSortOrder(prev => prev === 'NEWEST_FIRST' ? 'CHRONOLOGICAL' : 'NEWEST_FIRST')}
                    >
                      {sortOrder === 'NEWEST_FIRST' ? '⬇️ En Yeni Üstte' : '⬆️ Kronolojik'}
                    </button>
                  </div>

                  {isAdmin && (
                    <div className="cari-actions-bar">
                      <button className="btn-action-sm btn-action-sm--orange" onClick={() => { setFormError(''); setShowInvoiceModal(true); }}>
                        <span>📄</span> + Fatura Ekle
                      </button>
                      <button className="btn-action-sm btn-action-sm--green" onClick={() => { setFormError(''); setShowCollectionModal(true); }}>
                        <span>💵</span> + Tahsilat Ekle
                      </button>
                      <button className="btn-action-sm btn-action-sm--blue" onClick={() => { setFormError(''); setShowVirmanModal(true); }}>
                        <span>🔄</span> Virman Transferi
                      </button>
                    </div>
                  )}
                </div>

                <div className="cari-statement-table-wrap">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th className="col-date">Tarih</th>
                        <th className="col-type">İşlem Türü</th>
                        <th className="col-doc">Belge No</th>
                        <th className="col-debit">Borç</th>
                        <th className="col-credit">Alacak</th>
                        <th className="col-balance">Yürüyen Bakiye</th>
                        {isAdmin && <th className="col-action">İşlem</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-dim)' }}>
                            Bu cari için henüz hareket kaydı yok
                          </td>
                        </tr>
                      ) : visibleTransactions.map((t: any, i: number) => (
                        <tr key={t.id + i}>
                          <td className="col-date" style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td>
                          <td className="col-type">
                            <span className={`badge ${t.debit > 0 ? 'badge--ghost-orange' : 'badge--ghost-green'}`}>
                              {t.type}
                            </span>
                          </td>
                          <td className="col-doc">
                            <code style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-dim)' }}>
                              {t.docNo}
                            </code>
                          </td>
                          <td className="col-debit">
                            {t.debit > 0 ? (
                              <span className="num" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(t.debit)}</span>
                            ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                          </td>
                          <td className="col-credit">
                            {t.credit > 0 ? (
                              <span className="num" style={{ fontWeight: 600, color: 'var(--accent-green)' }}>{formatCurrency(t.credit)}</span>
                            ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                          </td>
                          <td className="col-balance">
                            <span
                              className="num"
                              style={{
                                fontWeight: 700,
                                color: t.balance > 0 ? 'var(--text-primary)' : t.balance < 0 ? 'var(--accent-green)' : 'var(--text-dim)',
                              }}
                            >
                              {formatCurrency(t.balance)}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="col-action">
                              <button
                                className="btn-delete-icon"
                                title="İşlemi Sil"
                                onClick={() => handleDeleteTransaction(t)}
                                disabled={actionLoading}
                              >
                                🗑️
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {remainingCount > 0 && (
                    <div className="cari-show-more-wrap">
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                        Toplam <strong>{sortedTransactions.length}</strong> kayıttan <strong>{visibleTransactions.length}</strong> tanesi gösteriliyor.
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn-show-more"
                          onClick={() => setDisplayLimit(prev => prev + 15)}
                        >
                          👇 Devamını Gör (+15 Kayıt)
                        </button>
                        <button
                          className="btn-show-more"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
                          onClick={() => setDisplayLimit(sortedTransactions.length)}
                        >
                          Tümünü Göster ({sortedTransactions.length})
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {showInvoiceModal && selectedCustomer && (
        <div className="cari-modal-overlay">
          <div className="cari-modal-card">
            <div className="cari-modal-header">
              <div className="cari-modal-title">📄 Manuel Fatura Ekle</div>
              <button className="cari-modal-close" onClick={() => setShowInvoiceModal(false)}>✕</button>
            </div>

            <form onSubmit={handleAddInvoice}>
              <div className="cari-modal-body">
                {formError && <div className="badge badge--rose" style={{ padding: '8px 12px', fontSize: '0.8rem' }}>⚠️ {formError}</div>}

                <div className="cari-form-group">
                  <label className="cari-form-label">Cari Müşteri</label>
                  <input className="cari-form-input" value={`${selectedCustomer.customerName} (${selectedCustomer.customerId})`} disabled />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="cari-form-group">
                    <label className="cari-form-label">Fatura Tarihi</label>
                    <input
                      type="date"
                      className="cari-form-input"
                      value={invoiceForm.date}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="cari-form-group">
                    <label className="cari-form-label">Fatura / Belge No</label>
                    <input
                      type="text"
                      className="cari-form-input"
                      placeholder="Örn: FAT-2026-001"
                      value={invoiceForm.docNo}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, docNo: e.target.value })}
                    />
                  </div>
                </div>

                <div className="cari-form-group">
                  <label className="cari-form-label">Fatura Tutarı (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="cari-form-input"
                    placeholder="0.00"
                    value={invoiceForm.amount}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                    required
                  />
                </div>

                <div className="cari-form-group">
                  <label className="cari-form-label">Açıklama / Not</label>
                  <input
                    type="text"
                    className="cari-form-input"
                    placeholder="Örn: Manuel satış faturası girişi"
                    value={invoiceForm.description}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="cari-modal-footer">
                <button type="button" className="btn-action-sm" onClick={() => setShowInvoiceModal(false)}>İptal</button>
                <button type="submit" className="btn-action-sm btn-action-sm--orange" disabled={actionLoading}>
                  {actionLoading ? 'Kaydediliyor...' : 'Faturayı Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCollectionModal && selectedCustomer && (
        <div className="cari-modal-overlay">
          <div className="cari-modal-card">
            <div className="cari-modal-header">
              <div className="cari-modal-title">💵 Manuel Tahsilat Ekle</div>
              <button className="cari-modal-close" onClick={() => setShowCollectionModal(false)}>✕</button>
            </div>

            <form onSubmit={handleAddCollection}>
              <div className="cari-modal-body">
                {formError && <div className="badge badge--rose" style={{ padding: '8px 12px', fontSize: '0.8rem' }}>⚠️ {formError}</div>}

                <div className="cari-form-group">
                  <label className="cari-form-label">Cari Müşteri</label>
                  <input className="cari-form-input" value={`${selectedCustomer.customerName} (${selectedCustomer.customerId})`} disabled />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="cari-form-group">
                    <label className="cari-form-label">Tahsilat Tarihi</label>
                    <input
                      type="date"
                      className="cari-form-input"
                      value={collectionForm.date}
                      onChange={(e) => setCollectionForm({ ...collectionForm, date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="cari-form-group">
                    <label className="cari-form-label">Ödeme Yöntemi</label>
                    <select
                      className="cari-form-select"
                      value={collectionForm.method}
                      onChange={(e) => setCollectionForm({ ...collectionForm, method: e.target.value })}
                    >
                      <option value="NAKİT">Nakit</option>
                      <option value="HAVALE">Bank / Havale</option>
                      <option value="KREDİ_KARTI">Kredi Kartı</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="cari-form-group">
                    <label className="cari-form-label">Tahsilat Tutarı (₺)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="cari-form-input"
                      placeholder="0.00"
                      value={collectionForm.amount}
                      onChange={(e) => setCollectionForm({ ...collectionForm, amount: e.target.value })}
                      required
                    />
                  </div>

                  <div className="cari-form-group">
                    <label className="cari-form-label">Makbuz / Belge No</label>
                    <input
                      type="text"
                      className="cari-form-input"
                      placeholder="Örn: TAH-2026-001"
                      value={collectionForm.docNo}
                      onChange={(e) => setCollectionForm({ ...collectionForm, docNo: e.target.value })}
                    />
                  </div>
                </div>

                <div className="cari-form-group">
                  <label className="cari-form-label">Açıklama / Not</label>
                  <input
                    type="text"
                    className="cari-form-input"
                    placeholder="Örn: Elden nakit tahsilat"
                    value={collectionForm.description}
                    onChange={(e) => setCollectionForm({ ...collectionForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="cari-modal-footer">
                <button type="button" className="btn-action-sm" onClick={() => setShowCollectionModal(false)}>İptal</button>
                <button type="submit" className="btn-action-sm btn-action-sm--green" disabled={actionLoading}>
                  {actionLoading ? 'Kaydediliyor...' : 'Tahsilatı Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showVirmanModal && selectedCustomer && (
        <div className="cari-modal-overlay">
          <div className="cari-modal-card">
            <div className="cari-modal-header">
              <div className="cari-modal-title">🔄 Cariler Arası Virman Transferi</div>
              <button className="cari-modal-close" onClick={() => setShowVirmanModal(false)}>✕</button>
            </div>

            <form onSubmit={handleAddVirman}>
              <div className="cari-modal-body">
                {formError && <div className="badge badge--rose" style={{ padding: '8px 12px', fontSize: '0.8rem' }}>⚠️ {formError}</div>}

                <div className="cari-form-group">
                  <label className="cari-form-label">1. Kaynak Cari (Borcu Azalacak / Alacak Kaydı)</label>
                  <input className="cari-form-input" value={`${selectedCustomer.customerName} (${selectedCustomer.customerId})`} disabled />
                </div>

                <div className="cari-form-group" style={{ position: 'relative' }}>
                  <label className="cari-form-label">2. Hedef Cari (Borcu Artacak / Borç Kaydı)</label>
                  <input
                    type="text"
                    className="cari-form-input"
                    placeholder="Hedef cari adı veya kodu ara..."
                    value={virmanForm.targetSearch}
                    onChange={(e) => setVirmanForm({ ...virmanForm, targetSearch: e.target.value, targetCustomerId: '' })}
                  />
                  {targetSearchResults.length > 0 && !virmanForm.targetCustomerId && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: '8px', maxHeight: '160px', overflowY: 'auto', zIndex: 10,
                      boxShadow: 'var(--shadow-card)', marginTop: '2px'
                    }}>
                      {targetSearchResults.map((c: any) => (
                        <div
                          key={c.customerId}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}
                          onClick={() => setVirmanForm({ ...virmanForm, targetCustomerId: c.customerId, targetSearch: `${c.signName || c.customerName} (${c.customerId})` })}
                        >
                          <strong>{c.signName || c.customerName}</strong> ({c.customerId})
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="cari-form-group">
                    <label className="cari-form-label">Virman Tarihi</label>
                    <input
                      type="date"
                      className="cari-form-input"
                      value={virmanForm.date}
                      onChange={(e) => setVirmanForm({ ...virmanForm, date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="cari-form-group">
                    <label className="cari-form-label">Virman Tutarı (₺)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="cari-form-input"
                      placeholder="0.00"
                      value={virmanForm.amount}
                      onChange={(e) => setVirmanForm({ ...virmanForm, amount: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="cari-form-group">
                  <label className="cari-form-label">Açıklama / Not</label>
                  <input
                    type="text"
                    className="cari-form-input"
                    placeholder="Örn: Cari hesap virman mahsubu"
                    value={virmanForm.description}
                    onChange={(e) => setVirmanForm({ ...virmanForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="cari-modal-footer">
                <button type="button" className="btn-action-sm" onClick={() => setShowVirmanModal(false)}>İptal</button>
                <button type="submit" className="btn-action-sm btn-action-sm--blue" disabled={actionLoading}>
                  {actionLoading ? 'İşleniyor...' : 'Virman Transferini Tamamla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
