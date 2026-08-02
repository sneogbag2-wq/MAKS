import React, { useState, useEffect, useMemo } from 'react';
import {
  getInvoiceControlDataSync,
  searchCustomersSync,
  subscribeDataChange,
  setDashboardActiveFilters,
  setHoverAnalyticsData
} from '../services/customerService';
import { formatCurrency, formatDate } from '../utils/formatters';
import CustomerStatementModal from '../components/modals/CustomerStatementModal';
import CustomerAnalysisModal from '../components/modals/CustomerAnalysisModal';
import './FaturaKontrolPage.css';

function getVadeBadge(c: any) {
  const days = typeof c === 'number' ? c : (typeof c?.averageVade === 'number' ? c.averageVade : 0);

  if (days <= 0) {
    return (
      <span className="vade-pill-badge vade-pill-badge--neutral">
        <i className="fa-solid fa-clock" /> 0 Gün
      </span>
    );
  } else if (days <= 30) {
    return (
      <span className="vade-pill-badge vade-pill-badge--green">
        <i className="fa-solid fa-clock" /> {days} Gün
      </span>
    );
  } else if (days <= 60) {
    return (
      <span className="vade-pill-badge vade-pill-badge--amber">
        <i className="fa-solid fa-clock" /> {days} Gün
      </span>
    );
  } else {
    return (
      <span className="vade-pill-badge vade-pill-badge--red">
        <i className="fa-solid fa-triangle-exclamation" /> {days} Gün
      </span>
    );
  }
}

export default function FaturaKontrolPage() {
  const [selectedDate, setSelectedDate]       = useState('');
  const [activeRepFilter, setActiveRepFilter] = useState('');
  const [searchQuery, setSearchQuery]         = useState('');
  const [sortBy, setSortBy]                   = useState('balance');
  const [displayLimit, setDisplayLimit]       = useState(18);

  const [allCustomers, setAllCustomers]       = useState<any[]>(() => searchCustomersSync());
  const [controlData, setControlData]         = useState<any>(() => getInvoiceControlDataSync(''));

  const [selectedCustForModal, setSelectedCustForModal]     = useState<any>(null);
  const [selectedCustForAnalysis, setSelectedCustForAnalysis] = useState<any>(null);

  const { statementStartDate, statementEndDate } = useMemo(() => {
    if (!selectedDate) return { statementStartDate: '', statementEndDate: '' };
    const endDate = selectedDate;
    const dt = new Date(selectedDate + 'T00:00:00');
    dt.setDate(dt.getDate() - 1);
    const startDate = dt.toISOString().slice(0, 10);
    return { statementStartDate: startDate, statementEndDate: endDate };
  }, [selectedDate]);

  const grandTotals = useMemo(() => {
    if (!selectedDate || !controlData?.stats) {
      return null;
    }
    const totalInvoices = controlData.stats.totalInvoices || 0;
    const totalCollections = controlData.stats.totalCollections || 0;
    const totalPrevCollections = controlData.stats.totalPrevCollections || 0;
    const invoiceCount = controlData.stats.invoiceCount || 0;
    const collectionCount = controlData.stats.collectionCount || 0;

    const openInvoiceTotal = Math.max(0, totalInvoices - totalCollections);
    const coverageRatio = totalInvoices > 0
      ? Math.min(100, Math.round((totalCollections / totalInvoices) * 100))
      : (totalCollections > 0 ? 100 : 0);

    const custs: any[] = controlData.customers || [];

    // Top Invoice Customer
    const sortedByInvoice = [...custs].filter(c => (c.invoiceTotal || 0) > 0).sort((a, b) => b.invoiceTotal - a.invoiceTotal);
    const topInvoiceCust = sortedByInvoice[0] || null;

    // Most Risky Invoice Customer (highest balance/vade among invoice receivers)
    const sortedByRisk = [...custs]
      .filter(c => (c.invoiceTotal || 0) > 0)
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));
    const mostRiskyCust = sortedByRisk[0] || null;

    // Top Collection Customer
    const sortedByCollection = [...custs].filter(c => (c.collectionTotal || 0) > 0).sort((a, b) => b.collectionTotal - a.collectionTotal);
    const topCollectionCust = sortedByCollection[0] || null;

    // Same Day Closed Customers Count
    const sameDayClosedCount = custs.filter(c => (c.invoiceTotal || 0) > 0 && (c.collectionTotal || 0) >= (c.invoiceTotal || 0)).length;

    // Top 3 Open Invoice Debtors on Selected Date
    const openInvoiceCusts = custs
      .map(c => ({
        ...c,
        openAmt: Math.max(0, (c.invoiceTotal || 0) - (c.collectionTotal || 0))
      }))
      .filter(c => c.openAmt > 0)
      .sort((a, b) => b.openAmt - a.openAmt);

    const top3OpenCusts = openInvoiceCusts.slice(0, 3);

    let aiTone: 'healthy' | 'warning' | 'danger' = 'healthy';
    let aiBadge = '🟢 Yüksek Tahsilat Performansı';
    let aiSummary = '';
    let aiAdvice = '';

    const formattedDate = formatDate(selectedDate);
    const top3NamesStr = top3OpenCusts.map(c => `${c.signName || c.customerName} (${formatCurrency(c.openAmt)})`).join(', ');

    if (totalInvoices === 0 && totalCollections === 0) {
      aiBadge = 'ℹ️ İşlem Yok';
      aiSummary = `${formattedDate} tarihinde kaydedilmiş fatura veya tahsilat hareketi bulunmamaktadır.`;
      aiAdvice = 'Tarih aralığını değiştirebilir veya arşive yeni dosya yükleyebilirsiniz.';
    } else if (coverageRatio >= 80) {
      aiTone = 'healthy';
      aiBadge = `🟢 Yüksek Tahsilat Performansı (%${coverageRatio} Karşılama)`;
      aiSummary = `${formattedDate} tarihinde kesilen ${formatCurrency(totalInvoices)} faturanın %${coverageRatio}'si (${formatCurrency(totalCollections)}) aynı gün tahsil edildi.`;
      aiAdvice = `Nakit akışı çok sağlıklıdır. Açık fatura riski yalnızca ${formatCurrency(openInvoiceTotal)} seviyesindedir.`;
    } else if (coverageRatio >= 40) {
      aiTone = 'warning';
      aiBadge = `🟡 Dengeli Tahsilat & Kısmi Açık Bakiye (%${coverageRatio} Karşılama)`;
      aiSummary = `${formattedDate} tarihinde kesilen ${formatCurrency(totalInvoices)} faturalara karşılık ${formatCurrency(totalCollections)} tahsilat alındı (%${coverageRatio} karşılama).`;
      aiAdvice = `${formatCurrency(openInvoiceTotal)} açık fatura tutarı mevcuttur. En yüksek açık borçlular: ${top3NamesStr || 'Yok'}. Plasiyer takibi önerilir.`;
    } else {
      aiTone = 'danger';
      aiBadge = `🔴 Yüksek Açık Fatura Riski (%${coverageRatio} Karşılama)`;
      aiSummary = `${formattedDate} tarihinde ${formatCurrency(totalInvoices)} fatura kesilmesine rağmen tahsilat ${formatCurrency(totalCollections)} seviyesinde kalmıştır (%${coverageRatio} karşılama).`;
      aiAdvice = `⚠️ ${formatCurrency(openInvoiceTotal)} tutarında açık bakiye mevcuttur! En yüksek açık borçlular: ${top3NamesStr || 'Yok'}. Peşin/POS tahsilat şartı koyun.`;
    }

    const card1Metrics = [
      {
        label: 'En Yüksek Fatura',
        value: topInvoiceCust ? `${topInvoiceCust.signName || topInvoiceCust.customerName} (${formatCurrency(topInvoiceCust.invoiceTotal)})` : 'Fatura Yok',
        color: '#10B981'
      },
      {
        label: 'En Riskli Cari',
        value: mostRiskyCust ? `${mostRiskyCust.signName || mostRiskyCust.customerName} (${formatCurrency(mostRiskyCust.balance)} Borç • ${mostRiskyCust.averageVade || 0}G Vade)` : 'Risk Yok',
        color: '#EF4444'
      },
      {
        label: 'Ortalama Fatura',
        value: invoiceCount > 0 ? formatCurrency(Math.round(totalInvoices / invoiceCount)) : '—',
        color: '#3B82F6'
      }
    ];

    const card2Metrics = [
      {
        label: 'En Yüksek Tahsilat',
        value: topCollectionCust ? `${topCollectionCust.signName || topCollectionCust.customerName} (${formatCurrency(topCollectionCust.collectionTotal)})` : 'Tahsilat Yok',
        color: '#2563EB'
      },
      {
        label: 'Tam Ödeyen Cariler',
        value: `${sameDayClosedCount} Müşteri Faturasını Kapattı`,
        color: '#10B981'
      },
      {
        label: 'Önceki Gün Tahsilat',
        value: formatCurrency(totalPrevCollections),
        color: '#8A6D1F'
      }
    ];

    const card3Metrics = top3OpenCusts.length > 0
      ? top3OpenCusts.map((c, idx) => ({
          label: `${idx + 1}. En Yüksek Açık Borç`,
          value: `${c.signName || c.customerName} (${formatCurrency(c.openAmt)}${c.averageVade > 0 ? ` • ${c.averageVade}G Vade` : ''})`,
          color: '#DC2626'
        }))
      : [
          {
            label: 'Açık Fatura Durumu',
            value: 'Tüm faturalar kapatıldı, açık bakiye yok',
            color: '#10B981'
          }
        ];

    return {
      totalInvoices,
      totalCollections,
      totalPrevCollections,
      openInvoiceTotal,
      coverageRatio,
      invoiceCount,
      collectionCount,
      formattedDate,
      topInvoiceCust,
      mostRiskyCust,
      topCollectionCust,
      top3OpenCusts,
      card1Metrics,
      card2Metrics,
      card3Metrics,
      aiTone,
      aiBadge,
      aiSummary,
      aiAdvice
    };
  }, [selectedDate, controlData]);

  const reloadData = () => {
    setAllCustomers(searchCustomersSync());
    setControlData(getInvoiceControlDataSync(selectedDate));
  };

  useEffect(() => {
    setControlData(getInvoiceControlDataSync(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    setDashboardActiveFilters({
      page: 'fatura-kontrol',
      selectedDate,
      repFilter: activeRepFilter || 'ALL',
      searchQuery
    });
  }, [selectedDate, activeRepFilter, searchQuery]);

  useEffect(() => {
    return () => {
      setDashboardActiveFilters({ page: 'dashboard', selectedDate: '', repFilter: 'ALL', searchQuery: '' });
    };
  }, []);

  useEffect(() => {
    setDisplayLimit(18);
  }, [selectedDate, activeRepFilter, searchQuery, sortBy]);

  useEffect(() => {
    const unsub = subscribeDataChange(reloadData);
    return () => unsub();
  }, [selectedDate]);

  const availableReps = useMemo(() => {
    const counts: Record<string, number> = {};
    allCustomers.forEach(c => {
      const rep = c.salesRepName?.trim() || 'Key Account';
      counts[rep] = (counts[rep] || 0) + 1;
    });
    return Object.keys(counts).sort((a, b) => a.localeCompare(b));
  }, [allCustomers]);

  const displayedCustomers = useMemo(() => {
    let list: any[] = controlData.customers || [];
    const q = searchQuery.trim().toLowerCase();

    if (activeRepFilter) {
      list = list.filter(c => (c.salesRepName?.trim() || 'Key Account') === activeRepFilter);
    }

    if (q) {
      list = list.filter(c => {
        const searchStr = (c.customerName || '') + ' ' + (c.signName || '') + ' ' + (c.customerId || '');
        return searchStr.toLowerCase().includes(q);
      });
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'invoice') {
        return (b.invoiceTotal || 0) - (a.invoiceTotal || 0);
      } else if (sortBy === 'name') {
        return (a.signName || a.customerName || '').localeCompare(b.signName || b.customerName || '');
      }
      return (b.balance || 0) - (a.balance || 0);
    });
  }, [controlData.customers, activeRepFilter, searchQuery, sortBy]);

  return (
    <div className="fatura-kontrol-page animate-fadeIn">
      <div className="fk-control-header animate-fadeIn">
        <div className="fk-ch-main">
          <div className="fk-ch-title-wrap">
            <h1 className="fk-ch-title">
              <i className="fa-solid fa-folder-open" style={{ color: '#8A6D1F' }} /> Fatura Kontrol
            </h1>
            <span className="fk-ch-count-badge">
              {selectedDate ? `${displayedCustomers.length} Cari Kaydı Bulundu` : 'Tarih Bazlı Panel'}
            </span>
          </div>

          <div className="fk-ch-filters">
            <div className="fk-date-wrap">
              <span className="fk-filter-icon"><i className="fa-solid fa-calendar-days" /></span>
              <input
                type="date"
                className="fk-date-input"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>

            {availableReps.length > 0 && (
              <select
                value={activeRepFilter}
                onChange={(e) => setActiveRepFilter(e.target.value)}
                className="fk-select-chip"
              >
                <option value="">👤 Tüm Temsilciler</option>
                {availableReps.map(rep => (
                  <option key={rep} value={rep}>{rep}</option>
                ))}
              </select>
            )}

            <div className="fk-search-wrap">
              <input
                type="text"
                placeholder="Müşteri adı veya kodu ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="fk-search-input"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="fk-search-clear">
                  ✕
                </button>
              )}
            </div>

            {selectedDate && (
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="fk-select-chip"
              >
                <option value="balance">Sırala: Kalan Borç</option>
                <option value="invoice">Sırala: Fatura Tutarı</option>
                <option value="name">Sırala: Müşteri Adı</option>
              </select>
            )}
          </div>

          <div className="dashboard-badge-compact">
            <span className="dashboard-badge-dot" /> Canlı Veri Modu
          </div>
        </div>

        <div className="fk-ch-sub">
          <span><i className="fa-solid fa-circle-info" /></span> Buluttaki arşivde aktif veri var — Toplam {controlData.stats.totalArchiveSalesCount || 0} fatura, {controlData.stats.totalArchiveColCount || 0} tahsilat kaydı inceleniyor.
        </div>
      </div>

      {selectedDate && grandTotals && (
        <div className="fk-grand-totals-bar animate-fadeIn">
          <div className="fk-gt-header">
            <div className="fk-gt-title">
              <span><i className="fa-solid fa-chart-pie" /></span> Genel Toplam & Tarihsel Finansal Denge
            </div>
            <div className="fk-gt-date-tag">
              <i className="fa-solid fa-calendar-check" /> {grandTotals.formattedDate}
            </div>
          </div>

          <div className="fk-gt-grid">
            <div
              className="fk-gt-card fk-gt-card--invoice"
              onMouseEnter={(e) => setHoverAnalyticsData({
                type: 'KPI',
                title: `Kesilen Toplam Fatura (${grandTotals.formattedDate})`,
                subtitle: `${grandTotals.invoiceCount} adet satış faturası kesildi`,
                metrics: grandTotals.card1Metrics,
                advice: grandTotals.topInvoiceCust
                  ? `Seçilen tarihte en yüksek fatura ${grandTotals.topInvoiceCust.signName || grandTotals.topInvoiceCust.customerName} cari hesabına (${formatCurrency(grandTotals.topInvoiceCust.invoiceTotal)}) kesilmiştir.`
                  : grandTotals.aiAdvice,
                page: 'fatura-kontrol',
                selectedDate,
                targetRect: e.currentTarget.getBoundingClientRect()
              })}
              onMouseLeave={() => setHoverAnalyticsData(null)}
            >
              <div className="fk-gt-card__top">
                <span className="fk-gt-card__icon"><i className="fa-solid fa-file-invoice-dollar" style={{ color: '#34D399' }} /></span>
                <span className="fk-gt-card__lbl">KESİLEN TOPLAM FATURA</span>
              </div>
              <div className="fk-gt-card__val num" style={{ color: '#34D399' }}>
                {formatCurrency(grandTotals.totalInvoices)}
              </div>
              <div className="fk-gt-card__sub">
                {grandTotals.invoiceCount > 0 ? `${grandTotals.invoiceCount} Adet Fatura İşlendi` : 'Fatura Kaydı Yok'}
              </div>
            </div>

            <div
              className="fk-gt-card fk-gt-card--collection"
              onMouseEnter={(e) => setHoverAnalyticsData({
                type: 'KPI',
                title: `Alınan Toplam Tahsilat (${grandTotals.formattedDate})`,
                subtitle: `${grandTotals.collectionCount} adet tahsilat kaydı işlendi`,
                metrics: grandTotals.card2Metrics,
                advice: grandTotals.topCollectionCust
                  ? `Günün en yüksek tahsilatı ${grandTotals.topCollectionCust.signName || grandTotals.topCollectionCust.customerName} müşterisinden (${formatCurrency(grandTotals.topCollectionCust.collectionTotal)}) alınmıştır.`
                  : `Seçilen tarihte alınan tahsilatlar fatura tutarının %${grandTotals.coverageRatio}'sini karşılamaktadır.`,
                page: 'fatura-kontrol',
                selectedDate,
                targetRect: e.currentTarget.getBoundingClientRect()
              })}
              onMouseLeave={() => setHoverAnalyticsData(null)}
            >
              <div className="fk-gt-card__top">
                <span className="fk-gt-card__icon"><i className="fa-solid fa-hand-holding-dollar" style={{ color: '#60A5FA' }} /></span>
                <span className="fk-gt-card__lbl">ALINAN TOPLAM TAHSİLAT</span>
              </div>
              <div className="fk-gt-card__val num" style={{ color: '#60A5FA' }}>
                {formatCurrency(grandTotals.totalCollections)}
              </div>
              <div className="fk-gt-card__sub">
                {grandTotals.collectionCount > 0 ? `${grandTotals.collectionCount} Kayıt (${formatCurrency(grandTotals.totalPrevCollections)} Önc. Gün)` : 'Tahsilat Kaydı Yok'}
              </div>
            </div>

            <div
              className={`fk-gt-card fk-gt-card--open ${grandTotals.openInvoiceTotal > 0 ? 'fk-gt-card--open-risk' : 'fk-gt-card--open-clear'}`}
              onMouseEnter={(e) => setHoverAnalyticsData({
                type: 'KPI',
                title: `Kalan Açık Fatura Tutarı (${grandTotals.formattedDate})`,
                subtitle: `Tahsilat Karşılama Oranı: %${grandTotals.coverageRatio}`,
                metrics: grandTotals.card3Metrics,
                advice: grandTotals.top3OpenCusts.length > 0
                  ? `Tarihteki en yüksek açık faturası olan müşteri ${grandTotals.top3OpenCusts[0].signName || grandTotals.top3OpenCusts[0].customerName} (${formatCurrency(grandTotals.top3OpenCusts[0].openAmt)}) hesabıdır. Saha plasiyer takibi önerilir.`
                  : grandTotals.aiAdvice,
                page: 'fatura-kontrol',
                selectedDate,
                targetRect: e.currentTarget.getBoundingClientRect()
              })}
              onMouseLeave={() => setHoverAnalyticsData(null)}
            >
              <div className="fk-gt-card__top">
                <span className="fk-gt-card__icon">
                  {grandTotals.openInvoiceTotal > 0 ? <i className="fa-solid fa-triangle-exclamation" style={{ color: '#F87171' }} /> : <i className="fa-solid fa-circle-check" style={{ color: '#34D399' }} />}
                </span>
                <span className="fk-gt-card__lbl">KALAN AÇIK FATURA TUTARI</span>
              </div>
              <div className="fk-gt-card__val num" style={{ color: grandTotals.openInvoiceTotal > 0 ? '#F87171' : '#34D399' }}>
                {formatCurrency(grandTotals.openInvoiceTotal)}
              </div>
              <div className="fk-gt-card__sub">
                %{grandTotals.coverageRatio} Tahsilat Karşılama Oranı
              </div>
            </div>
          </div>

          <div className={`fk-gt-ai-box fk-gt-ai-box--${grandTotals.aiTone}`}>
            <div className="fk-gt-ai-header">
              <div className="fk-gt-ai-badge">
                <span className="fk-gt-ai-pulse" />
                <span>✨ Günlü (AI) Finansal Yorumu</span>
              </div>
              <div className="fk-gt-ai-tag">
                {grandTotals.aiBadge}
              </div>
            </div>
            <div className="fk-gt-ai-body">
              <p className="fk-gt-ai-summary">{grandTotals.aiSummary}</p>
              <p className="fk-gt-ai-advice">💡 <strong>CFO Aksiyon Tavsiyesi:</strong> {grandTotals.aiAdvice}</p>
            </div>
          </div>
        </div>
      )}

      {!selectedDate ? (
        <div className="fk-empty-card animate-scaleIn">
          <div className="fk-empty-icon">📅</div>
          <div>Sonuçları görmek için yukarıdan bir tarih seçin.</div>
        </div>
      ) : displayedCustomers.length === 0 ? (
        <div className="fk-empty-card animate-scaleIn">
          <div className="fk-empty-icon">🔍</div>
          <div>Seçilen tarihte ({selectedDate}) kriterlere uyan fatura veya tahsilat kaydı bulunamadı.</div>
        </div>
      ) : (
        <>
          <div className="customer-grid animate-scaleIn">
            {displayedCustomers.slice(0, displayLimit).map((c) => {
              const custName = c.signName || c.customerName || 'Müşteri';
              const repName = c.salesRepName || c.salesRep || 'Key Account';

              return (
                <div 
                  key={c.customerId} 
                  className="cust-card"
                  onMouseEnter={(e) => setHoverAnalyticsData({ type: 'CUSTOMER', title: custName, customerObj: c, page: 'fatura-kontrol', selectedDate, targetRect: e.currentTarget.getBoundingClientRect() } as any)}
                  onMouseLeave={() => setHoverAnalyticsData(null)}
                >
                  <div className="cust-card__top">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="cust-card__name" title={custName}>
                        {custName}
                      </div>
                      <div className="cust-card__sub" title={`${c.customerId} • ${repName}`}>
                        {c.customerId} • {repName}
                      </div>
                    </div>
                    {getVadeBadge(c)}
                  </div>

                  <div className="cust-card__balance num" style={{ color: c.balance > 0 ? 'var(--text-primary)' : c.balance < 0 ? '#0F766E' : 'var(--text-dim)' }}>
                    {formatCurrency(c.balance)}
                  </div>

                  <div className="fk-stats-row">
                    <div className="fk-stat-col">
                      <span className="fk-stat-lbl">FATURA</span>
                      <span className={`fk-stat-val num ${c.invoiceTotal > 0 ? 'fk-stat-val--invoice' : ''}`}>
                        {c.invoiceTotal > 0 ? formatCurrency(c.invoiceTotal) : '—'}
                      </span>
                    </div>

                    <div className="fk-stat-col">
                      <span className="fk-stat-lbl">TAHSİLAT</span>
                      <span className={`fk-stat-val num ${c.collectionTotal > 0 ? 'fk-stat-val--collection' : ''}`}>
                        {c.collectionTotal > 0 ? formatCurrency(c.collectionTotal) : '—'}
                      </span>
                    </div>

                    <div className="fk-stat-col">
                      <span className="fk-stat-lbl">ÖNC. GÜN TAHS.</span>
                      <span className={`fk-stat-val num ${c.prevCollectionTotal > 0 ? 'fk-stat-val--prev' : ''}`}>
                        {c.prevCollectionTotal > 0 ? formatCurrency(c.prevCollectionTotal) : '—'}
                      </span>
                    </div>
                  </div>

                  {c.cekSenet > 0 && (
                    <div className="cust-card__cek-risk">
                      <span className="cust-card__cek-dot"></span>
                      <span>Çek/Senet:</span>
                      <span className="num">{formatCurrency(c.cekSenet)}</span>
                    </div>
                  )}

                  <div className="cust-card__meta">
                    <span style={{ color: 'var(--text-muted)' }}>
                      {c.province || 'Bölge Yok'} {c.district ? `/ ${c.district}` : ''}
                    </span>
                    <button
                      className="btn-cust-detay"
                      onClick={() => setSelectedCustForModal(c)}
                    >
                      Detay ↗
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {displayedCustomers.length > displayLimit && (
            <div style={{ textAlign: 'center', margin: '24px 0 10px' }}>
              <button
                onClick={() => setDisplayLimit(prev => prev + 18)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  padding: '10px 24px',
                  borderRadius: '99px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all var(--transition)',
                  boxShadow: 'var(--shadow-xs)'
                }}
              >
                Daha Fazla Göster ({displayedCustomers.length - displayLimit} kart kaldı)
              </button>
            </div>
          )}
        </>
      )}

      <div className="fk-footer-note">
        Bu rapor yüklü ham veri dosyalarından tarayıcınızda anlık olarak hesaplanmıştır. Hiçbir veri sunucuya gönderilmez.
      </div>

      {selectedCustForModal && (
        <CustomerStatementModal
          customer={selectedCustForModal}
          onClose={() => setSelectedCustForModal(null)}
          initialStartDate={statementStartDate}
          initialEndDate={statementEndDate}
        />
      )}

      {selectedCustForAnalysis && (
        <CustomerAnalysisModal
          onClose={() => setSelectedCustForAnalysis(null)}
          customer={selectedCustForAnalysis}
        />
      )}
    </div>
  );
}
