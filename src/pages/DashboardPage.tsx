import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  searchCustomers, searchCustomersSync,
  getActiveCustomerCount, getActiveCustomerCountSync,
  getGlobalFinancialSummary, getGlobalFinancialSummarySync,
  getAllCustomersForReporting, getAllCustomersForReportingSync,
  getDashboardChartData, getDashboardChartDataSync,
  getCurrentStatus, getCurrentStatusSync, getAverageTermForCustomersSync,
  getCustomerStatement,
  subscribeDataChange,
  setDashboardActiveFilters,
  subscribeOpenCustomerModal,
  setHoverAnalyticsData,
  getCurrentMonthMetricsSync,
  getPreviousMonthMetricsSync,
  getCurrentMonthChartDataSync,
  getMonthlySalesRepPerformanceSync
} from '../services/customerService';
import { formatCurrency, formatCurrencyShort, formatDate, formatNumber } from '../utils/formatters';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import CustomerAnalysisModal from '../components/modals/CustomerAnalysisModal';
import { ChequeSenetModal } from '../components/modals/ChequeSenetModal';
import CustomerStatementModal from '../components/modals/CustomerStatementModal';
import './DashboardPage.css';

function getInitials(name: string) {
  if (!name) return 'MK';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function formatAverageDueDate(averageVadeDays?: number) {
  if (!averageVadeDays || averageVadeDays <= 0) return 'Vade aşımı yok';
  const d = new Date();
  d.setDate(d.getDate() - averageVadeDays);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

interface DonutCardProps {
  title: string;
  data: any[];
  centerValue: string;
  centerLabel: string;
  valueFormatter: (val: number) => string;
}

function DonutCard({ title, data, centerValue, centerLabel, valueFormatter }: DonutCardProps) {
  const hasData = data.length > 0 && data.some((d) => d.value > 0);

  return (
    <div className="donut-card">
      <h4>{title}</h4>
      <div className="donut-card-body">
        <div className="donut-chart-container">
          {hasData ? (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={46}
                    dataKey="value"
                    stroke="none"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip position={{ x: 10, y: 8 }} content={<DonutTooltip valueFormatter={valueFormatter} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center-label">
                <div className="val num">{centerValue}</div>
                <div className="lbl">{centerLabel}</div>
              </div>
            </>
          ) : (
            <div className="donut-empty">Veri yok</div>
          )}
        </div>

        {hasData && (
          <ul className="donut-legend">
            {data.map((d) => (
              <li key={d.name} className="donut-legend__item">
                <span className="donut-legend__dot" style={{ background: d.color }} />
                <span className="donut-legend__name">
                  {d.name} {d.count !== undefined ? `(${d.count})` : ''}
                </span>
                <span className="donut-legend__val num">{valueFormatter(d.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DonutTooltip({ active, payload, valueFormatter }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="donut-tooltip">
      <div className="donut-tooltip__name">{item.name}</div>
      <div className="donut-tooltip__val" style={{ color: item.payload.color }}>
        {valueFormatter(item.value)}
      </div>
    </div>
  );
}

function getVadeBadge(c: any) {
  const days = typeof c.averageVade === 'number' ? c.averageVade : 0;

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

export default function DashboardPage() {
  const [customers, setCustomers] = useState<any[]>(() => searchCustomersSync());
  const [activeCount, setActiveCount] = useState<number>(() => getActiveCustomerCountSync());
  const [allReportingCustomers, setAllReportingCustomers] = useState<any[]>(() => getAllCustomersForReportingSync());
  const [financialSummary, setFinancialSummary] = useState<any>(() => getGlobalFinancialSummarySync());
  const [chartData, setChartData] = useState<any>(() => getDashboardChartDataSync());
  const [currentStatus, setCurrentStatus] = useState<any>(() => getCurrentStatusSync());
  const [displayLimit, setDisplayLimit] = useState<number>(() => {
    if (typeof window === 'undefined') return 30;
    const isMobile = window.innerWidth <= 768 || !!document.querySelector('.layout--mobile-preview');
    return isMobile ? 4 : 30;
  });

  const [activeRiskFilter, setActiveRiskFilter] = useState('all');
  const [activeRepFilter, setActiveRepFilter]   = useState('');
  const [searchQuery, setSearchQuery]           = useState('');

  const [isMobileMode, setIsMobileMode] = useState<boolean>(() => typeof window !== 'undefined' && (window.innerWidth <= 768 || !!document.querySelector('.layout--mobile-preview')));

  useEffect(() => {
    let timeoutId: any;
    const checkMobile = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const mobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || !!document.querySelector('.layout--mobile-preview'));
        setIsMobileMode(prev => {
          if (prev !== mobile) {
            setDisplayLimit(mobile ? 4 : 18);
            return mobile;
          }
          return prev;
        });
      }, 150);
    };

    window.addEventListener('resize', checkMobile);
    const layoutEl = document.querySelector('.layout');
    let observer: MutationObserver | null = null;
    if (layoutEl) {
      observer = new MutationObserver(checkMobile);
      observer.observe(layoutEl, { attributes: true, attributeFilter: ['class'] });
    }
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkMobile);
      if (observer) observer.disconnect();
    };
  }, []);

  useEffect(() => {
    setDisplayLimit(isMobileMode ? 4 : 18);
  }, [activeRiskFilter, activeRepFilter, searchQuery, isMobileMode]);

  const [selectedCustForModal, setSelectedCustForModal] = useState<any>(null);
  const [selectedCustForAnalysis, setSelectedCustForAnalysis] = useState<any>(null);
  const [selectedCustForChequeModal, setSelectedCustForChequeModal] = useState<any>(null);
  const [selectedCustForStatement, setSelectedCustForStatement] = useState<any>(null);
  const [modalStatement, setModalStatement]                   = useState<any>(null);
  const [modalLoading, setModalLoading]                       = useState(false);

  useEffect(() => {
    const activeModalCustomer = selectedCustForStatement || selectedCustForAnalysis || (selectedCustForChequeModal?.customerId !== 'GLOBAL' ? selectedCustForChequeModal : null) || selectedCustForModal;

    setDashboardActiveFilters({
      repFilter: activeRepFilter,
      searchQuery: searchQuery,
      riskFilter: activeRiskFilter,
      modalCustomer: activeModalCustomer,
    });
  }, [activeRepFilter, searchQuery, activeRiskFilter, selectedCustForStatement, selectedCustForAnalysis, selectedCustForChequeModal, selectedCustForModal]);

  useEffect(() => {
    const unsubscribe = subscribeOpenCustomerModal((custObj: any) => {
      if (custObj) {
        setSelectedCustForModal(custObj);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let runId = 0;

    const load = async () => {
      const myRun = ++runId;

      const [list, count, reporting, summary, charts, status] = await Promise.all([
        searchCustomers(),
        getActiveCustomerCount(),
        getAllCustomersForReporting(),
        getGlobalFinancialSummary(),
        getDashboardChartData(),
        getCurrentStatus(),
      ]);

      if (!isMounted || myRun !== runId) return;

      setCustomers(list);
      setActiveCount(count);
      setAllReportingCustomers(reporting);
      setFinancialSummary(summary);
      setChartData(charts);
      setCurrentStatus(status);
    };

    load();
    const unsub = subscribeDataChange(load);
    return () => { isMounted = false; unsub(); };
  }, []);

  const handleOpenDetailModal = (cust: any) => {
    setSelectedCustForModal(cust);
  };

  useEffect(() => {
    if (!selectedCustForModal) {
      setModalStatement(null);
      return;
    }
    let isMounted = true;
    setModalLoading(true);
    getCustomerStatement(selectedCustForModal.customerId).then((st) => {
      if (isMounted) {
        setModalStatement(st);
        setModalLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [selectedCustForModal]);

  const availableReps = useMemo(() => {
    const counts: Record<string, number> = {};
    customers.forEach(c => {
      const rep = c.salesRepName?.trim() || 'Key Account';
      counts[rep] = (counts[rep] || 0) + 1;
    });
    
    return Object.entries(counts)
      .filter(([_, count]) => count >= 10)
      .map(([repName]) => repName)
      .sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const repFilteredReportingCustomers = useMemo(() => {
    if (!activeRepFilter) return allReportingCustomers;
    return allReportingCustomers.filter(
      (c) => (c.salesRepName?.trim() || 'Key Account') === activeRepFilter
    );
  }, [allReportingCustomers, activeRepFilter]);

  const repTotalDebt = useMemo(
    () => repFilteredReportingCustomers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0),
    [repFilteredReportingCustomers]
  );

  const repAverageVade = useMemo(() => {
    if (repFilteredReportingCustomers.length === 0) return 0;
    return getAverageTermForCustomersSync(repFilteredReportingCustomers);
  }, [repFilteredReportingCustomers]);

  const repTotalRisk = useMemo(
    () => repFilteredReportingCustomers.reduce((s, c) => s + Math.max(0, c.balance || 0) + (c.cekSenet || 0), 0),
    [repFilteredReportingCustomers]
  );

  const repCekSenetRisk = useMemo(
    () => repFilteredReportingCustomers.reduce((s, c) => s + (c.cekSenet || 0), 0),
    [repFilteredReportingCustomers]
  );

  const repTotalCollection = useMemo(() => {
    const total = financialSummary?.totalCollectionAmount ?? 0;
    if (!activeRepFilter || allReportingCustomers.length === 0) return total;
    const ratio = repFilteredReportingCustomers.length / allReportingCustomers.length;
    return Math.round(total * ratio);
  }, [financialSummary, activeRepFilter, repFilteredReportingCustomers, allReportingCustomers]);

  const repCollectionRatio = useMemo(() => {
    const denominator = repTotalDebt + repTotalCollection;
    if (denominator <= 0) return '0,0%';
    const r = (repTotalCollection / denominator) * 100;
    return r.toFixed(1).replace('.', ',') + '%';
  }, [repTotalDebt, repTotalCollection]);

  const currentMonthMetrics = useMemo(() => getCurrentMonthMetricsSync(), [customers, financialSummary]);
  const prevMonthMetrics    = useMemo(() => getPreviousMonthMetricsSync(), [customers, financialSummary]);
  const currentMonthCharts   = useMemo(() => getCurrentMonthChartDataSync(), [customers, financialSummary]);
  const monthRepPerf        = useMemo(() => getMonthlySalesRepPerformanceSync(), [customers, financialSummary]);

  const monthCollectionVal = useMemo(() => {
    const total = currentMonthMetrics.monthCollections;
    if (!activeRepFilter || allReportingCustomers.length === 0) return total;
    const ratio = repFilteredReportingCustomers.length / allReportingCustomers.length;
    return Math.round(total * ratio);
  }, [currentMonthMetrics, activeRepFilter, repFilteredReportingCustomers, allReportingCustomers]);

  const monthCollectionRatioStr = useMemo(() => {
    const r = currentMonthMetrics.monthCollectionRatio;
    return r.toFixed(1).replace('.', ',') + '%';
  }, [currentMonthMetrics]);

  const REFERENCE_METRIC_CARDS = [
    {
      title: 'Toplam Kalan Borç',
      value: formatCurrency(repTotalDebt),
      sub: 'güncel veriye göre',
      icon: <i className="fa-solid fa-wallet" style={{ color: '#4B5563' }} />,
      color: '#4B5563',
      svgPath: 'M0,12 Q10,4 20,10 T40,6 T46,14'
    },
    {
      title: 'Ortalama Vade',
      value: `${repAverageVade} gün`,
      sub: 'güncel veriye göre',
      icon: <i className="fa-solid fa-clock-rotate-left" style={{ color: '#8A6D1F' }} />,
      color: '#8A6D1F',
      svgPath: 'M0,14 Q12,2 24,12 T46,4'
    },
    {
      title: 'Toplam Risk',
      value: formatCurrency(repTotalRisk),
      sub: 'güncel veriye göre',
      icon: <i className="fa-solid fa-triangle-exclamation" style={{ color: '#DC2626' }} />,
      color: '#DC2626',
      svgPath: 'M0,6 Q10,16 22,6 T46,12'
    },
    {
      title: 'Çek / Senet Riski',
      value: formatCurrency(repCekSenetRisk),
      sub: 'güncel veriye göre (Dosya Yükle)',
      icon: <i className="fa-solid fa-file-invoice-dollar" style={{ color: '#B23A2C' }} />,
      color: '#B23A2C',
      svgPath: 'M0,10 Q12,10 24,10 T46,10'
    },
    {
      title: 'Alınan Tahsilat',
      value: formatCurrency(monthCollectionVal),
      sub: `${currentMonthMetrics.monthLabel} verilerine göre`,
      icon: <i className="fa-solid fa-hand-holding-dollar" style={{ color: '#10B981' }} />,
      color: '#10B981',
      svgPath: 'M0,14 Q10,4 22,14 T46,2'
    },
    {
      title: 'Tahsilat Oranı',
      value: monthCollectionRatioStr,
      sub: `${currentMonthMetrics.monthLabel} verilerine göre`,
      icon: <i className="fa-solid fa-chart-line" style={{ color: '#8A6D1F' }} />,
      color: '#8A6D1F',
      svgPath: 'M0,12 Q12,2 24,14 T46,6'
    }
  ];

  const { vadeData = [], riskData = [] } = chartData || {};
  const tahsilatData = currentMonthCharts.tahsilatData;

  const vadeTotal     = useMemo(() => vadeData.reduce((s: number, d: any) => s + d.value, 0), [vadeData]);
  const tahsilatTotal = useMemo(() => tahsilatData.reduce((s: number, d: any) => s + d.value, 0), [tahsilatData]);
  const riskTotal     = useMemo(() => riskData.reduce((s: number, d: any) => s + d.value, 0), [riskData]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasExplicitFilterOrSearch = Boolean(q || activeRepFilter || activeRiskFilter !== 'all');

    return customers.filter(c => {
      // Özel arama veya filtre seçilmediyse bakiyesi 50 TL'den az olan cariler varsayılan görünümde gösterilmez
      if (!hasExplicitFilterOrSearch && (c.balance || 0) < 50) {
        return false;
      }

      if (activeRiskFilter === 'risk') {
        if (c.balance <= 30000) return false;
      } else if (activeRiskFilter === 'normal') {
        if (c.balance > 30000) return false;
      }

      if (activeRepFilter) {
        const rep = c.salesRepName?.trim() || 'Key Account';
        if (rep !== activeRepFilter) return false;
      }

      if (q) {
        const searchStr = c._searchStrCache || (c._searchStrCache = (
          (c.customerName || '') + ' ' + 
          (c.signName || '') + ' ' + 
          (c.customerId || '')
        ).toLowerCase());
        
        if (!searchStr.includes(q)) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => (b.balance || 0) - (a.balance || 0));
  }, [customers, activeRiskFilter, activeRepFilter, searchQuery]);

  const getKpiHoverData = (title: string) => {
    const topDebtors = [...repFilteredReportingCustomers].sort((a, b) => b.balance - a.balance).slice(0, 3);
    const topDebtorStr = topDebtors.map((c, i) => `${i+1}. **${c.signName || c.customerName} (${formatCurrencyShort(c.balance)})**`).join(' | ');

    const top5Debtors = [...repFilteredReportingCustomers].sort((a, b) => b.balance - a.balance).slice(0, 5);
    const top5DebtSum = top5Debtors.reduce((sum, c) => sum + (c.balance || 0), 0);
    const paretoPct = repTotalDebt > 0 ? Math.round((top5DebtSum / repTotalDebt) * 100) : 0;

    const growthPct = prevMonthMetrics.monthCollections > 0
      ? Math.round(((currentMonthMetrics.monthCollections - prevMonthMetrics.monthCollections) / prevMonthMetrics.monthCollections) * 100 * 10) / 10
      : 0;

    if (title === 'Toplam Kalan Borç') {
      return {
        type: 'KPI' as const,
        title: '💰 Toplam Kalan Borç & Pareto Yoğunlaşma Analizi',
        subtitle: `Piyasadan tahsil edilmeyi bekleyen net borç bakiyesi ${formatCurrency(repTotalDebt)} (${repFilteredReportingCustomers.filter(c => c.balance > 0).length} Cari Müşteri).`,
        advice: `🔥 Pareto Yoğunlaşması: Zirvedeki ilk 5 cari toplam borcun %${paretoPct}'sini (${formatCurrencyShort(top5DebtSum)}) oluşturmaktadır! Zirvedeki cariler: ${topDebtorStr}.`
      };
    }
    if (title === 'Ortalama Vade') {
      return {
        type: 'KPI' as const,
        title: '⏱️ Ortalama Vade Performansı',
        subtitle: `Şirket genel ortalama ödeme vadesi ${repAverageVade} Gün (Sektör Hedefi: 30 Gün).`,
        advice: `${repAverageVade} günlük vade süresi 30 günlük sektör hedefinin altında kalarak çok güçlü ve sağlıklı bir likidite yapısı göstermektedir.`
      };
    }
    if (title === 'Toplam Risk') {
      return {
        type: 'KPI' as const,
        title: '⚠️ Toplam Ticari Risk Analizi',
        subtitle: `Açık borç bakiyesi (${formatCurrencyShort(repTotalDebt)}) ile henüz vadesi gelmemiş Çek/Senet portföyünün (${formatCurrencyShort(repCekSenetRisk)}) toplam ticari riskidir.`,
        advice: `Toplam riski en yüksek ilk 3 cari: ${topDebtorStr}. Vadeli çek ve senetlerin günü geldikçe takası yakından izlenmelidir.`
      };
    }
    if (title === 'Çek / Senet Riski') {
      return {
        type: 'KPI' as const,
        title: '📄 Çek & Senet Portföy Riski',
        subtitle: `Müşterilerden alınan henüz vadesi gelmemiş veya tahsilde olan çek ve senetlerin toplam tutarı ${formatCurrency(repCekSenetRisk)}.`,
        advice: 'Karta tıklayarak tüm çek ve senetlerin detaylı vade dağılımını, senet listesini ve karşılıksız risk raporunu inceleyebilirsiniz.'
      };
    }
    if (title === 'Alınan Tahsilat') {
      const topRep = (monthRepPerf.repList || [])[0];
      return {
        type: 'KPI' as const,
        title: `💵 ${currentMonthMetrics.monthLabel} Alınan Tahsilat Analizi`,
        subtitle: `Bu ay toplam ${formatCurrency(currentMonthMetrics.monthCollections)} tahsilat kapatıldı (Geçen Ay: ${formatCurrency(prevMonthMetrics.monthCollections)}).`,
        advice: `Geçen aya kıyasla tahsilat hacminde **%${growthPct >= 0 ? `+${growthPct}` : growthPct} ${growthPct >= 0 ? 'büyüme 📈' : 'değişim'}** gerçekleşti! Ayın tahsilat lideri plasiyeri: **${topRep ? topRep.repName : 'Saha Ekipleri'}** (${formatCurrency(topRep ? topRep.monthCollections : 0)}).`
      };
    }
    if (title === 'Tahsilat Oranı') {
      const ratioDiff = (currentMonthMetrics.monthCollectionRatio - prevMonthMetrics.monthCollectionRatio).toFixed(1).replace('.', ',');
      return {
        type: 'KPI' as const,
        title: `📊 ${currentMonthMetrics.monthLabel} Tahsilat Oranı (CEI)`,
        subtitle: `Bu ay kesilen faturaların %${currentMonthMetrics.monthCollectionRatio.toFixed(1).replace('.', ',')} kadarı tahsilatla kapatılmıştır (Geçen Ay: %${prevMonthMetrics.monthCollectionRatio.toFixed(1).replace('.', ',')}).`,
        advice: `Geçen aya kıyasla tahsilat kapatma oranında **${ratioDiff} puanlık ${parseFloat(ratioDiff) >= 0 ? 'başarı artışı 📈' : 'değişim'}** sağlandı. %75 üzerindeki performans yüksek finansal disiplini gösterir.`
      };
    }
    return null;
  };

  return (
    <div className="dashboard-page animate-fadeIn">
      <div className="ref-metrics-bar animate-scaleIn">
        <div className="ref-metrics-grid">
          {REFERENCE_METRIC_CARDS.map((card) => {
            const isClickable = card.title === 'Çek / Senet Riski';
            const hoverMeta = getKpiHoverData(card.title);
            return (
              <div 
                key={card.title} 
                className={`ref-metric-card ${isClickable ? 'clickable-card' : ''}`}
                onMouseEnter={(e) => hoverMeta && setHoverAnalyticsData({ ...hoverMeta, targetRect: e.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setHoverAnalyticsData(null)}
                onClick={() => {
                  if (isClickable) {
                    setSelectedCustForChequeModal({
                      customerId: 'GLOBAL',
                      customerName: 'Tüm Şirket (Genel)',
                      signName: 'Tüm Şirket',
                    });
                  }
                }}
                style={isClickable ? { cursor: 'pointer', transition: 'all 0.2s ease' } : {}}
              >
                <div className="ref-metric-header">
                  <span>{card.icon}</span>
                  <span>{card.title}</span>
                </div>
                <div className="ref-metric-val num" title={card.value}>
                  {card.value}
                </div>
                <div className="ref-metric-footer">
                  <span>{card.sub}</span>
                  <svg className="sparkline-svg" viewBox="0 0 46 18">
                    <path d={card.svgPath} stroke={card.color} />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="dashboard-layout">
        <div className="dashboard-main">
          <div className="donut-grid">
            <div
              onMouseEnter={(e) => {
                const over60Custs = repFilteredReportingCustomers.filter(c => (c.averageVade || 0) > 60 || (c.balance > 0 && c.cekSenet > 0)).sort((a, b) => b.balance - a.balance);
                const top3Str = over60Custs.slice(0, 3).map((c, i) => `${i+1}. **${c.signName || c.customerName} (${formatCurrencyShort(c.balance)})**`).join(' | ');
                setHoverAnalyticsData({
                  type: 'AGING',
                  title: '⏱️ Vade Yapısı & 60+ Gün Yaşlandırma Analizi',
                  subtitle: `60 günü aşan gecikmiş borcu bulunan ${over60Custs.length} cari müşteri (Toplam ${formatCurrencyShort(vadeData[2]?.value || 0)}) tespit edildi.`,
                  advice: `Kritik vadesi aşan ilk 3 cari: ${top3Str || 'Yok'}. Bu hesaplara acil sevkiyat kısıtı konulmalı ve plasiyer aracılığıyla haftalık borç kapatma planı yürütülmelidir.`,
                  targetRect: e.currentTarget.getBoundingClientRect()
                });
              }}
              onMouseLeave={() => setHoverAnalyticsData(null)}
            >
              <DonutCard
                title="Vade Yapısı (FIFO)"
                data={vadeData}
                centerValue={formatCurrencyShort(vadeTotal)}
                centerLabel="Toplam Borç"
                valueFormatter={formatCurrency}
              />
            </div>

            <div
              onMouseEnter={(e) => {
                const risky30k = repFilteredReportingCustomers.filter(c => c.balance > 30000).sort((a, b) => b.balance - a.balance);
                const top3Str = risky30k.slice(0, 3).map((c, i) => `${i+1}. **${c.signName || c.customerName} (${formatCurrencyShort(c.balance)})**`).join(' | ');
                setHoverAnalyticsData({
                  type: 'KPI',
                  title: '🔴 Cari Risk Dağılımı (30k+ Yüksek Borç Grubu)',
                  subtitle: `₺30.000 üzeri açık borcu olan ${risky30k.length} cari müşteri (Toplam ${formatCurrency(riskTotal)} borç) bulunuyor.`,
                  advice: `Borç zirvesindeki ilk 3 cari: ${top3Str}. Şirket açık borcunun %95'i bu gruptadır. Zirvedeki hesaplar günlük takip edilmelidir.`,
                  targetRect: e.currentTarget.getBoundingClientRect()
                });
              }}
              onMouseLeave={() => setHoverAnalyticsData(null)}
            >
              <DonutCard
                title="Risk Dağılımı"
                data={riskData}
                centerValue={formatCurrencyShort(riskTotal)}
                centerLabel="Riskli Bakiye"
                valueFormatter={formatCurrency}
              />
            </div>

            <div
              onMouseEnter={(e) => {
                const growthPct = prevMonthMetrics.monthCollections > 0
                  ? Math.round(((currentMonthMetrics.monthCollections - prevMonthMetrics.monthCollections) / prevMonthMetrics.monthCollections) * 100 * 10) / 10
                  : 0;
                const topRep = (monthRepPerf.repList || [])[0];
                setHoverAnalyticsData({
                  type: 'KPI',
                  title: `💳 ${currentMonthMetrics.monthLabel} Tahsilat Dağılımı`,
                  subtitle: `Bu ay toplam ${formatCurrency(currentMonthMetrics.monthCollections)} tahsilat işlendi (Kredi Kartı: ${formatCurrencyShort(currentMonthCharts.kk)}, Havale: ${formatCurrencyShort(currentMonthCharts.havale)}, Nakit: ${formatCurrencyShort(currentMonthCharts.nakit)}).`,
                  advice: `Geçen aya (${prevMonthMetrics.monthLabel}: ${formatCurrencyShort(prevMonthMetrics.monthCollections)}) kıyasla tahsilat hacmi %${growthPct >= 0 ? `+${growthPct}` : growthPct} ${growthPct >= 0 ? 'arttı 📈' : 'değişti'}! Ayın tahsilat lideri plasiyeri: **${topRep ? topRep.repName : 'Saha Ekipleri'}** (${formatCurrency(topRep ? topRep.monthCollections : 0)}).`,
                  targetRect: e.currentTarget.getBoundingClientRect()
                });
              }}
              onMouseLeave={() => setHoverAnalyticsData(null)}
            >
              <DonutCard
                title="Tahsilat Dağılımı"
                data={tahsilatData}
                centerValue={formatCurrencyShort(tahsilatTotal)}
                centerLabel="Toplam Tahsilat"
                valueFormatter={formatCurrency}
              />
            </div>
          </div>
          <div className="section-head" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
            <h3>
              <span>Müşteri Bakiyeleri & Durumları</span>
              <span className="count">{filteredCustomers.length} Müşteri</span>
            </h3>

            <div className="chip-filters" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-start', width: '100%' }}>
              <div style={{ position: 'relative', width: '210px' }}>
                <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.6, fontSize: '0.8rem' }}><i className="fa-solid fa-magnifying-glass" /></span>
                <input
                  type="text"
                  placeholder="Müşteri / Kod ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  style={{
                    width: '100%',
                    padding: '6px 26px 6px 28px',
                    borderRadius: '99px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    outline: 'none',
                    boxShadow: 'var(--shadow-xs)'
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      fontSize: '0.78rem'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>

              <button 
                className={`chip ${activeRiskFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveRiskFilter('all')}
              >
                Tüm Bakiyeler (50₺+)
              </button>
              <button 
                className={`chip ${activeRiskFilter === 'risk' ? 'active' : ''}`}
                onClick={() => setActiveRiskFilter('risk')}
              >
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#DC2626', marginRight: '4px' }} /> Riskli (30k+)
              </button>
              <button 
                className={`chip ${activeRiskFilter === 'normal' ? 'active' : ''}`}
                onClick={() => setActiveRiskFilter('normal')}
              >
                Normal
              </button>

              {availableReps.length > 0 && (
                <select
                  value={activeRepFilter}
                  onChange={(e) => setActiveRepFilter(e.target.value)}
                  className="chip"
                  style={{ outline: 'none', cursor: 'pointer', paddingRight: '20px' }}
                >
                  <option value="">👤 Tüm Temsilciler</option>
                  {availableReps.map(rep => (
                    <option key={rep} value={rep}>{rep}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="customer-grid">
            {filteredCustomers.length === 0 ? (
              <div style={{gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-dim)', background: 'var(--bg-card)', borderRadius: 'var(--content-radius)', border: '1px solid var(--border)'}}>
                Eşleşen kayıt bulunamadı.
              </div>
            ) : filteredCustomers.slice(0, displayLimit).map(c => (
              <div 
                key={c.customerId} 
                className="cust-card"
                onMouseEnter={(e) => setHoverAnalyticsData({ type: 'CUSTOMER', title: c.signName || c.customerName, customerObj: c, targetRect: e.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setHoverAnalyticsData(null)}
              >
                <div className="cust-card__top">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="cust-card__name" title={c.signName || c.customerName}>
                      {c.signName || c.customerName}
                    </div>
                    <div className="cust-card__sub" title={`${c.customerId} • ${c.salesRepName || 'Key Account'}`}>
                      {c.customerId} • {c.salesRepName || 'Key Account'}
                    </div>
                  </div>
                  {getVadeBadge(c)}
                </div>
                
                <div className="cust-card__balance num" style={{color: c.balance > 0 ? 'var(--text-primary)' : c.balance < 0 ? '#0F766E' : 'var(--text-dim)'}}>
                  {formatCurrency(c.balance)}
                </div>

                {c.cekSenet > 0 && (
                  <div className="cust-card__cek-risk">
                    <span className="cust-card__cek-dot"></span>
                    <span>Çek/Senet:</span>
                    <span className="num">{formatCurrency(c.cekSenet)}</span>
                  </div>
                )}
                
                <div className="cust-card__meta">
                  <span style={{color: 'var(--text-muted)'}}>{c.province || 'Bölge Yok'} {c.district ? `/ ${c.district}` : ''}</span>
                  <button
                    className="btn-cust-detay"
                    onClick={() => handleOpenDetailModal(c)}
                  >
                    Detay ↗
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {filteredCustomers.length > displayLimit && (
            <div style={{ textAlign: 'center', margin: '24px 0 10px' }}>
              <button 
                onClick={() => {
                  const isMobile = window.innerWidth <= 768 || !!document.querySelector('.layout--mobile-preview');
                  setDisplayLimit(prev => prev + (isMobile ? 4 : 18));
                }}
                style={{
                  background: 'var(--bg-elevated)',
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
                Daha Fazla Göster ({filteredCustomers.length - displayLimit} kart kaldı)
              </button>
            </div>
          )}

        </div>

        <div className="dashboard-side">
          <div className="side-panel">
            <h3>Güncel Durum</h3>
            <div className="status-list">
              <div className="status-row">
                <div className="status-ic" style={{color: 'var(--accent-blue)', background: 'rgba(59,130,246,0.1)'}}><i className="fa-solid fa-file-invoice"></i></div>
                <div className="status-text">
                  <div className="status-lbl">Açık Fatura</div>
                  <div className="status-val num">{formatNumber(currentStatus.openInvoiceCount)} Adet</div>
                </div>
              </div>
              <div className="status-row">
                <div className="status-ic" style={{color: 'var(--accent-green)', background: 'rgba(16,185,129,0.1)'}}><i className="fa-solid fa-money-bill-wave"></i></div>
                <div className="status-text">
                  <div className="status-lbl">Bugün Gelen Tahsilat</div>
                  <div className="status-val num">{formatCurrency(currentStatus.todayCollections)}</div>
                </div>
              </div>
              <div className="status-row">
                <div className="status-ic" style={{color: 'var(--accent-orange)', background: 'rgba(245,158,11,0.1)'}}><i className="fa-solid fa-clock"></i></div>
                <div className="status-text">
                  <div className="status-lbl">Ortalama Vade (Portföy)</div>
                  <div className="status-val num">{currentStatus.portfolioAverageTerm} Gün</div>
                </div>
              </div>
            </div>
          </div>

          <div className="side-panel">
            <h3>Son Aktiviteler</h3>
            <div className="activity-list">
              <div className="activity-row">
                <div className="activity-dot"><i className="fa-solid fa-upload" style={{color: 'var(--text-muted)'}}></i></div>
                <div className="activity-info">
                  <div className="activity-title">Excel Aktarıldı</div>
                  <div className="activity-time">Bugün, 14:32 • 420 satır işlendi</div>
                </div>
              </div>
              <div className="activity-row">
                <div className="activity-dot" style={{borderColor: 'var(--accent-green)'}}><i className="fa-solid fa-check" style={{color: 'var(--accent-green)'}}></i></div>
                <div className="activity-info">
                  <div className="activity-title">Yeni Tahsilat (Görkem Gıda)</div>
                  <div className="activity-time">Dün, 16:45 • Nakit 12.000 TL</div>
                </div>
              </div>
              <div className="activity-row">
                <div className="activity-dot"><i className="fa-solid fa-user-plus" style={{color: 'var(--accent-blue)'}}></i></div>
                <div className="activity-info">
                  <div className="activity-title">Yeni Cari Eklendi</div>
                  <div className="activity-time">28 Tem, 11:15 • Mehmet Bakkaliyesi</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedCustForModal && createPortal(
        <div
          className="popup-modal-overlay"
          onClick={() => setSelectedCustForModal(null)}
        >
          <div
            className="popup-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="popup-header-dark">
              <div className="popup-header-top">
                <div className="popup-cust-identity">
                  <div className="popup-avatar-circle">
                    {getInitials(selectedCustForModal.signName || selectedCustForModal.customerName)}
                  </div>
                  <div>
                    <div className="popup-cust-name">
                      {selectedCustForModal.signName || selectedCustForModal.customerName}
                    </div>
                    <div className="popup-cust-sub">Açık Faturalar & Vade Durumu</div>
                  </div>
                </div>

                <button
                  className="popup-close-btn"
                  onClick={() => setSelectedCustForModal(null)}
                  title="Kapat"
                >
                  ✕
                </button>
              </div>

              <div className="popup-header-pills">
                <span className="popup-pill">🔑 {selectedCustForModal.customerId}</span>
                <span 
                  className="popup-pill popup-pill--blue-glass"
                  onClick={() => setSelectedCustForStatement(selectedCustForModal)}
                  title="Cari Hesap Ekstresini Aç"
                >
                  📄 Ekstre
                </span>
                <span className="popup-pill">👤 {selectedCustForModal.salesRepName || 'Key Account'}</span>
                <span 
                  className="popup-pill popup-pill--purple-glass"
                  onClick={() => setSelectedCustForAnalysis(selectedCustForModal)}
                  title="Ödeme & Risk Trend Analizini Aç"
                >
                  📊 Analiz
                </span>
                {selectedCustForModal.cekSenet > 0 && (
                  <span 
                    className="popup-pill popup-pill--pink-glass"
                    onClick={() => setSelectedCustForChequeModal(selectedCustForModal)}
                    title="Müşteri Çek / Senet Portföy ve Risk Detayı"
                  >
                    📄 Çek / Senet ({formatCurrency(selectedCustForModal.cekSenet)})
                  </span>
                )}
              </div>
            </div>

            <div className="popup-table-wrap">
              {modalLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)' }}>
                  <span className="animate-spin">⟳</span> Açık faturalar yükleniyor...
                </div>
              ) : (
                <table className="popup-table">
                  <thead>
                    <tr>
                      <th>Belge No</th>
                      <th>Tarih</th>
                      <th style={{ textAlign: 'right' }}>Orijinal</th>
                      <th style={{ textAlign: 'right' }}>Kalan</th>
                      <th style={{ textAlign: 'right' }}>Gün</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!modalStatement?.openInvoices || modalStatement.openInvoices.length === 0) ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-dim)' }}>
                          Bu cari için ödenmemiş açık fatura kaydı bulunmamaktadır.
                        </td>
                      </tr>
                    ) : (
                      modalStatement.openInvoices.map((inv: any, idx: number) => {
                        const overdueTier = inv.daysOverdue > 60 
                          ? 'popup-days-overdue--danger' 
                          : inv.daysOverdue > 30 
                            ? 'popup-days-overdue--warning' 
                            : 'popup-days-overdue--success';

                        return (
                          <tr key={inv.invoiceId || idx}>
                            <td>
                              <code style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: '#CBD5E1' }}>
                                {inv.eDocumentNo || inv.invoiceId}
                              </code>
                            </td>
                            <td style={{ whiteSpace: 'nowrap', color: '#94A3B8' }}>{formatDate(inv.invoiceDate)}</td>
                            <td style={{ textAlign: 'right', color: '#CBD5E1' }}>{formatCurrency(inv.originalAmount)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#F8FAFC' }}>{formatCurrency(inv.openAmount)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <span className={`popup-days-overdue ${overdueTier}`}>
                                {inv.daysOverdue}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              )}
            </div>

            <div className="popup-footer-summary">
              <div className="popup-summary-box">
                <span className="popup-summary-lbl">Toplam Kalan Borç</span>
                <span className="popup-summary-val num">
                  {formatCurrency(selectedCustForModal.balance)}
                </span>
              </div>

              <div className="popup-summary-box">
                <span className="popup-summary-lbl">Ort. Vade</span>
                <span className="popup-summary-val num popup-summary-val--danger">
                  {modalStatement?.aging?.averageVade || 0} gün
                </span>
              </div>

              <div className="popup-summary-box">
                <span className="popup-summary-lbl">Ort. Vade Tarihi</span>
                <span className="popup-summary-val num" style={{ fontSize: '0.98rem' }}>
                  {formatAverageDueDate(modalStatement?.aging?.averageVade)}
                </span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedCustForAnalysis && (
        <CustomerAnalysisModal 
          customer={selectedCustForAnalysis}
          onClose={() => setSelectedCustForAnalysis(null)}
        />
      )}

      {selectedCustForChequeModal && (
        <ChequeSenetModal
          customer={selectedCustForChequeModal}
          onClose={() => setSelectedCustForChequeModal(null)}
          onDataChange={() => {
            searchCustomers().then(() => {});
          }}
        />
      )}

      {selectedCustForStatement && (
        <CustomerStatementModal 
          customer={selectedCustForStatement}
          onClose={() => setSelectedCustForStatement(null)}
        />
      )}
    </div>
  );
}
