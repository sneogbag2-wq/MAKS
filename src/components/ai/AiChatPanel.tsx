import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAiChat } from '../../hooks/useAiChat';
import { ChatMessage } from './ChatMessage';
import { SuggestedQuestions } from './SuggestedQuestions';
import { MascotAvatar } from './MascotAvatar';
import { useNavigate } from 'react-router-dom';
import { 
  isAdminAuthenticated, 
  authenticateAdmin, 
  logoutAdmin, 
  getCustomRules, 
  addCustomRule, 
  deleteCustomRule 
} from '../../services/customRulesService';
import { 
  getGlobalFinancialSummarySync, 
  getCurrentMonthMetricsSync,
  getAdvancedExecutiveInsightsSync,
  getMonthlySalesRepPerformanceSync,
  getHistoricalSalesRepPerformanceSync,
  searchCustomersSync, 
  getInvoiceControlReportSync,
  getCustomerStatementSync,
  subscribeDataChange,
  subscribeDashboardFilters,
  getDashboardActiveFilters,
  subscribeHoverAnalyticsData,
  calculateCustomerDebtToCollectionRiskSync,
  calculateDeepInvoiceAnalysisSync,
  HoverAnalyticsItem
} from '../../services/customerService';
import { formatCurrency, formatCurrencyShort, formatDate } from '../../utils/formatters';
import './AiChatPanel.css';

export default function AiChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const { messages, loading, sendMessage, clearChat } = useAiChat();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        const activeEl = document.activeElement;
        const activeTag = activeEl ? activeEl.tagName.toLowerCase() : '';
        const isEditable = activeEl ? (activeEl as HTMLElement).isContentEditable : false;

        if (['input', 'textarea', 'select'].includes(activeTag) || isEditable) {
          return;
        }

        e.preventDefault();
        setIsOpen(prev => {
          const nextState = !prev;
          if (nextState) {
            setTimeout(() => textInputRef.current?.focus(), 150);
          }
          return nextState;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current && !containerRef.current.contains(target)) {
        if (target.closest('.modal-overlay') || target.closest('.ai-modal-overlay') || target.closest('.statement-modal-overlay')) {
          return;
        }
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (prevIsOpenRef.current && !isOpen) {
      clearChat();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, clearChat]);

  const [isAdmin, setIsAdmin] = useState(isAdminAuthenticated());
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminAuthError, setAdminAuthError] = useState('');
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [customRules, setCustomRules] = useState(getCustomRules());
  const [newRuleText, setNewRuleText] = useState('');

  const [financialComments, setFinancialComments] = useState<any[]>([]);
  const [commentIndex, setCommentIndex] = useState(0);
  const [showAnimeBubble, setShowAnimeBubble] = useState(true);
  const [isBubbleHovered, setIsBubbleHovered] = useState(false);

  const refreshFinancialComments = () => {
    try {
      const summary = getGlobalFinancialSummarySync();
      const monthMetrics = getCurrentMonthMetricsSync();
      const advancedInsights = getAdvancedExecutiveInsightsSync();
      const repPerf = getMonthlySalesRepPerformanceSync();
      const allCusts = searchCustomersSync('');
      const activeFilters = getDashboardActiveFilters();
      const comments: any[] = [];

      const { repFilter, searchQuery, riskFilter, modalCustomer, page, selectedDate } = activeFilters || {};

      const addComment = (text: string, customerObj: any = null) => {
        comments.push({
          text,
          customer: customerObj || null,
        });
      };

      if (modalCustomer) {
        const custId = modalCustomer.customerId;
        const custName = modalCustomer.signName || modalCustomer.customerName || 'Müşteri';
        const repName = modalCustomer.salesRepName || modalCustomer.salesRep || 'Key Account';
        const bal = modalCustomer.balance ?? 0;
        const vade = typeof modalCustomer.averageVade === 'number' ? modalCustomer.averageVade : 0;
        const modalStart = activeFilters.modalStartDate || '';
        const modalEnd = activeFilters.modalEndDate || '';

        const stmt = getCustomerStatementSync(custId);
        let txs = stmt.transactions || [];

        if (modalStart) {
          txs = txs.filter((t: any) => String(t.date || '').slice(0, 10) >= modalStart);
        }
        if (modalEnd) {
          txs = txs.filter((t: any) => String(t.date || '').slice(0, 10) <= modalEnd);
        }

        const periodSales = txs.reduce((sum: number, t: any) => sum + (t.debit || 0), 0);
        const periodCollections = txs.reduce((sum: number, t: any) => sum + (t.credit || 0), 0);

        const dateRangeLabel = modalStart || modalEnd 
          ? `${modalStart ? formatDate(modalStart) : '...' } - ${modalEnd ? formatDate(modalEnd) : '...'}`
          : 'Tüm Zamanlar';

        addComment(
          `📋 **${custName} Ekstre Analizi (${dateRangeLabel}):** Bu dönemde **${formatCurrency(periodSales)}** fatura kesildi ve **${formatCurrency(periodCollections)}** tahsilat kapatıldı.`,
          modalCustomer
        );

        if (periodSales > 0 && periodCollections === 0) {
          addComment(
            `⚠️ **Tahsilat Durumu:** Dönemde kesilen **${formatCurrency(periodSales)}** faturaya henüz tahsilat alınmadı (Ortalama Vade: **${vade} Gün**, Açık Borç: **${formatCurrency(bal)}**).`,
            modalCustomer
          );
        } else if (periodCollections > 0) {
          addComment(
            `💳 **Tahsilat Eşleşmesi:** Bu dönemde **${formatCurrency(periodCollections)}** tahsilat alındı. Kapanış Bakiyesi: **${formatCurrency(bal)}** (Ortalama Vade: **${vade} Gün**).`,
            modalCustomer
          );
        } else {
          addComment(
            `⏱️ **Vade & Borç Durumu:** Ortalama Ödeme Vadesi **${vade} Gün** | Güncel Açık Bakiye **${formatCurrency(bal)}**.`,
            modalCustomer
          );
        }

        const totalSales = stmt.summary?.totalSales || 1;
        const totalCols = stmt.summary?.totalCollections || 0;
        const collectionRatio = Math.min(100, Math.round((totalCols / totalSales) * 100));

        let riskEval = '🟢 Düşük Risk (Ödemeler Dengeli)';
        if (bal > 50000 && vade > 45) {
          riskEval = '🔴 Yüksek Risk (Açık Bakiye & Vade Aşımı)';
        } else if (bal > 20000 && vade > 30) {
          riskEval = '🟡 Orta Risk (Takip Edilmeli)';
        }

        addComment(
          `📊 **Performans & Risk Analizi:** Temsilci: **${repName}** | Tahsilat Başarı Oranı: **%${collectionRatio}** | Risk Analizi: **${riskEval}**.`,
          modalCustomer
        );

        setFinancialComments(comments);
        setCommentIndex(0);
        return;
      }

      if (page === 'fatura-kontrol') {
        if (!selectedDate) {
          addComment('📅 **Fatura Kontrol Paneli:** Gün bazlı fatura ve tahsilat risk takibi için yukarıdaki takvimden bir tarih seçin.');
          setFinancialComments(comments);
          setCommentIndex(0);
          return;
        }

        const report = getInvoiceControlReportSync({ date: selectedDate, salesRep: repFilter !== 'ALL' ? repFilter : '', query: searchQuery });
        const formattedDateStr = formatDate(selectedDate);
        const custs = report.customerList || [];

        if (custs.length === 0) {
          addComment(`✨ **${formattedDateStr} Tarihli Kontrol:** Seçilen tarihte kriterlere uyan fatura veya ödenmemiş bakiye kaydı bulunamadı.`);
        } else {
          addComment(`📂 **${formattedDateStr} Fatura Kontrolü:** **${report.totalMatchingCustomers} cari müşteride** toplam **${report.formattedTotalInvoiceAmount}** fatura ve **${report.formattedTotalCollectionAmount}** tahsilat işlendi.`);

          const unpaidCusts = custs
            .filter((c: any) => c.invoiceTotal > 0 && c.collectionTotal === 0)
            .sort((a: any, b: any) => (b.balance || 0) - (a.balance || 0));

          unpaidCusts.slice(0, 3).forEach((c: any) => {
            const custName = c.signName || c.customerName;
            const vade = typeof c.averageVadeDays === 'number' ? c.averageVadeDays : (typeof c.averageVade === 'number' ? c.averageVade : 0);
            const isHighVadeRisk = vade >= 30;

            addComment(
              `${isHighVadeRisk ? '🚨' : '⚠️'} **${formattedDateStr} Risk Takibi:** **${custName}** carisine **${c.formattedInvoiceTotal}** fatura kesildi ancak aynı gün tahsilat alınmadı${vade > 0 ? ` (Ortalama Vade: **${vade} Gün**)` : ''}. Kalan Bakiye: **${c.formattedBalance}**.`,
              c
            );
          });

          const collectedCusts = custs
            .filter((c: any) => c.invoiceTotal > 0 && c.collectionTotal > 0)
            .sort((a: any, b: any) => (b.collectionTotal || 0) - (a.collectionTotal || 0));

          if (collectedCusts.length > 0) {
            const topCol = collectedCusts[0];
            addComment(
              `💳 **Günün Tahsilat Eşleşmesi (${formattedDateStr}):** **${topCol.signName || topCol.customerName}** carisine **${topCol.formattedInvoiceTotal}** fatura kesildi ve aynı gün **${topCol.formattedCollectionTotal}** tahsilat kapatıldı!`,
              topCol
            );
          }
        }

        setFinancialComments(comments);
        setCommentIndex(0);
        return;
      }

      const activeCust = modalCustomer || (searchQuery && searchQuery.trim().length >= 2 ? (searchCustomersSync(searchQuery, true)[0] || null) : null);

      if (activeCust) {
        const custName = activeCust.signName || activeCust.customerName;
        const repName = activeCust.salesRepName || activeCust.salesRep || 'Key Account';
        const bal = activeCust.balance || 0;
        const days = typeof activeCust.averageVade === 'number' ? activeCust.averageVade : 0;

        addComment(`🏢 **${custName} Odak Analizi:** Açık Borç Bakiyesi **${formatCurrency(bal)}**${days > 0 ? ` (Ortalama Vade: **${days} Gün**)` : ''}.`, activeCust);
        addComment(`👤 **Saha Temsilcisi:** ${repName} | **Konum:** ${activeCust.province || 'Tekirdağ'}${activeCust.district ? ` / ${activeCust.district}` : ''}`, activeCust);

        const custInsights = advancedInsights.filter((i: any) => i.customerId === activeCust.customerId);
        if (custInsights.length > 0) {
          custInsights.forEach((ins: any) => addComment(ins.text, activeCust));
        } else if (bal > 15000) {
          addComment(`⚠️ **Müşteri Risk Takibi:** ${custName} bakiyesi **${formatCurrency(bal)}** ile yüksek borçlu grubundadır.`, activeCust);
        } else {
          addComment(`✨ ${custName} carisinin ödeme ve risk durumu stabil görünmektedir.`, activeCust);
        }

        setFinancialComments(comments);
        setCommentIndex(0);
        return;
      }

      if (repFilter && repFilter !== 'ALL') {
        const repCusts = allCusts.filter(c => (c.salesRepName || c.salesRep) === repFilter);
        const repReceivables = repCusts.reduce((sum, c) => sum + (c.balance || 0), 0);
        const repRisky = repCusts.filter(c => (c.balance || 0) > 30000 || (c.averageVade || 0) > 45);
        const repData = (repPerf.repList || []).find((r: any) => r.repName === repFilter);

        addComment(`👨‍💼 **${repFilter} Portföy Raporu:** Temsilciye bağlı **${repCusts.length} cari müşteride** toplam **${formatCurrency(repReceivables)}** açık alacak bulunuyor.`);

        if (repData && (repData.monthSales > 0 || repData.monthCollections > 0)) {
          addComment(`📊 **${repFilter} (${monthMetrics.monthLabel}):** Bu ay **${formatCurrency(repData.monthSales)}** satış ve **${formatCurrency(repData.monthCollections)}** tahsilat işlendi.`);
        }

        if (repRisky.length > 0) {
          const topR = repRisky[0];
          const days = typeof topR.averageVade === 'number' ? topR.averageVade : 0;
          addComment(`⚠️ **${repFilter} Risk Uyarısı:** ${topR.signName || topR.customerName} bakiyesi **${formatCurrency(topR.balance)}** (${days > 0 ? `${days} gün vade aşımı` : 'riskli'}).`, topR);
        }

        const repInsights = advancedInsights.filter((i: any) => i.salesRepName === repFilter);
        if (repInsights.length > 0) {
          repInsights.forEach((ins: any) => {
            const cObj = allCusts.find(c => c.customerId === ins.customerId);
            addComment(ins.text, cObj);
          });
        }

        if (comments.length === 0) {
          addComment(`✨ ${repFilter} temsilcisinin tüm müşteri verileri güncel ve kontrol altında.`);
        }

        setFinancialComments(comments);
        setCommentIndex(0);
        return;
      }

      if (searchQuery && searchQuery.trim().length >= 2) {
        const matchedCusts = searchCustomersSync(searchQuery, true);
        if (matchedCusts.length > 0) {
          const cust = matchedCusts[0];
          const custName = cust.signName || cust.customerName;
          const repName = cust.salesRepName || cust.salesRep || 'Key Account';
          const bal = cust.balance || 0;
          const days = typeof cust.averageVade === 'number' ? cust.averageVade : 0;

          addComment(`🏢 **${custName} Cari Analizi:** Açık alacak bakiyesi **${formatCurrency(bal)}**${days > 0 ? ` (Ortalama Vade: **${days} Gün**)` : ''}.`, cust);
          addComment(`👤 **Saha Temsilcisi:** ${repName} | **Konum:** ${cust.province || 'Tekirdağ'}${cust.district ? ` / ${cust.district}` : ''}`, cust);

          const custInsights = advancedInsights.filter((i: any) => i.customerId === cust.customerId);
          if (custInsights.length > 0) {
            custInsights.forEach((ins: any) => addComment(ins.text, cust));
          } else if (bal > 15000) {
            addComment(`⚠️ **Müşteri Risk Takibi:** ${custName} bakiyesi **${formatCurrency(bal)}** ile yüksek borçlu grubundadır.`, cust);
          } else {
            addComment(`✨ ${custName} carisinin ödeme ve risk durumu stabil görünmektedir.`, cust);
          }

          setFinancialComments(comments);
          setCommentIndex(0);
          return;
        }
      }

      if (riskFilter === 'RISKY') {
        const riskyCusts = allCusts.filter(c => (c.balance || 0) >= 30000).sort((a, b) => (b.balance || 0) - (a.balance || 0));
        addComment(`🔴 **Yüksek Riskli Cariler:** ₺30.000 üzeri açık riski olan **${riskyCusts.length} cari hesap** filtreleniyor.`);
        if (riskyCusts.length > 0) {
          const topR = riskyCusts[0];
          addComment(`⚠️ **Zirvedeki Borç:** ${topR.signName || topR.customerName} bakiyesi **${formatCurrency(topR.balance)}** ile en yüksek riske sahip.`, topR);
        }
        setFinancialComments(comments);
        setCommentIndex(0);
        return;
      }

      if (advancedInsights && advancedInsights.length > 0) {
        const globalInsights = advancedInsights.filter((ins: any) => 
          ins.type !== 'CONSECUTIVE_UNPAID_INVOICES' && 
          ins.type !== 'WEEKLY_OVERDUE_NEW_SHIPMENT' &&
          ins.type !== 'RISKY_CHEQUE_BOUNCE'
        );
        globalInsights.forEach((ins: any) => {
          const cObj = allCusts.find(c => c.customerId === ins.customerId);
          addComment(ins.text, cObj);
        });
      }

      if (repPerf && repPerf.repList && repPerf.repList.length > 0) {
        const topRep = repPerf.repList[0];
        if (topRep.monthSales > 0 || topRep.monthCollections > 0) {
          addComment(`👨‍💼 **${repPerf.monthLabel} Plasiyer Liderliği:** **${topRep.repName}** (${topRep.customerCount} Müşteri) bu ay ${formatCurrency(topRep.monthSales)} satış ve ${formatCurrency(topRep.monthCollections)} tahsilat ile önde!`);
        }
      }

      const historicalRep = getHistoricalSalesRepPerformanceSync();
      if (historicalRep && historicalRep.repList && historicalRep.repList.length > 0) {
        const topGrower = [...historicalRep.repList].sort((a: any, b: any) => b.salesGrowthPct - a.salesGrowthPct)[0];
        if (topGrower && topGrower.salesGrowthPct > 0) {
          addComment(`📈 **Plasiyer Aylık Büyüme:** **${topGrower.repName}** geçen aya (${historicalRep.compareLabel}) kıyasla satışlarını **+%${topGrower.salesGrowthPct}** artırarak **${formatCurrency(topGrower.targetSales)}** ciroya ulaştı!`);
        }
      }

      if (monthMetrics.monthSales > 0 || monthMetrics.monthCollections > 0) {
        addComment(`📅 **${monthMetrics.monthLabel} Özeti:** Bu ay ${formatCurrency(monthMetrics.monthSales)} satış faturalandı, ${formatCurrency(monthMetrics.monthCollections)} tahsil edildi.`);
      }

      const net = summary.totalNetReceivables || summary.netReceivables || 0;
      const activeCount = summary.activeCustomersCount || allCusts.length || 0;
      if (net > 0) {
        addComment(`📊 **Bayi Net Alacak Toplamı:** ${formatCurrency(net)} (${activeCount} Aktif Cari)`);
      }

      if (comments.length === 0) {
        addComment(`✨ ${monthMetrics.monthLabel} dönemi AKGÜN Meşrubat Gıda bayi verileriniz stabil durumda.`);
      }

      setFinancialComments(comments);
    } catch (err) {
      console.error('refreshFinancialComments error:', err);
    }
  };

  const [activeHoverData, setActiveHoverData] = useState<HoverAnalyticsItem | null>(null);

  useEffect(() => {
    const unsubHover = subscribeHoverAnalyticsData((hoverItem) => {
      if (hoverItem) {
        setShowAnimeBubble(true);

        const comments: any[] = [];
        const addComment = (text: string, cObj: any = null) => {
          comments.push({ text, customer: cObj || null });
        };

        const activeFilters = getDashboardActiveFilters();
        let enrichedHoverItem = { ...hoverItem };

        if (hoverItem.type === 'CUSTOMER') {
          const c = hoverItem.customerObj;
          const activePage = (hoverItem as any).page || activeFilters.page;
          const selDate = (hoverItem as any).selectedDate || activeFilters.selectedDate;

          if (activePage === 'fatura-kontrol' && selDate) {
            const deepAnalysis = calculateDeepInvoiceAnalysisSync(c, selDate);

            enrichedHoverItem.subtitle = deepAnalysis.subtitle;
            enrichedHoverItem.advice = deepAnalysis.advice;

            addComment(`📂 **${hoverItem.title} (${formatDate(selDate)}):** ${deepAnalysis.badgeTag}`, c);
            addComment(deepAnalysis.subtitle, c);
            addComment(`💡 **CFO Tavsiyesi:** ${deepAnalysis.advice}`, c);
          } else {
            const risk = calculateCustomerDebtToCollectionRiskSync(c);
            const rep = c.salesRepName || c.salesRep || 'Key Account';
            const vade = c.averageVade || c.averageVadeDays || 0;

            enrichedHoverItem.subtitle = `📊 Açık Borç: ${formatCurrency(risk.balance)} | Aylık Ort. Tahsilat: ${formatCurrency(risk.monthlyAvgCollection)} | Borç Karşılama Oranı: ${risk.coverageMonths} Ay (${risk.coverageDays} Günlük Tahsilat Kapasitesi) | Vade: ${vade > 0 ? `${vade} Gün` : 'Aşım Yok'} | Temsilci: ${rep}`;
            enrichedHoverItem.advice = risk.actionAdvice;

            addComment(`🎯 **${hoverItem.title} Cari Odak Analizi:** Açık Borç: **${formatCurrency(risk.balance)}** | Aylık Ort. Tahsilat: **${formatCurrency(risk.monthlyAvgCollection)}**`, c);
            addComment(`📈 **Borç/Tahsilat Karşılama Oranı:** **${risk.coverageMonths} Ay** (${risk.coverageDays} Günlük Tahsilat Kapasitesi) | Durum: **${risk.riskLabel}**`, c);
            addComment(`💡 **Yapay Zeka Tavsiyesi:** ${risk.actionAdvice}`, c);
          }
        } else if (hoverItem.type === 'KPI') {
          addComment(`🔍 **${hoverItem.title}:** ${hoverItem.subtitle || ''}`);
          if (hoverItem.metrics && hoverItem.metrics.length > 0) {
            const mStr = hoverItem.metrics.map(m => `**${m.label}:** ${m.value}`).join(' | ');
            addComment(`📊 **Detay Değerler:** ${mStr}`);
          }
          if (hoverItem.advice) {
            addComment(`💡 **Finansal Tavsiye:** ${hoverItem.advice}`);
          }
        } else if (hoverItem.type === 'REP') {
          addComment(`👨‍💼 **${hoverItem.title} Saha Temsilcisi Odak Kartı:** ${hoverItem.subtitle || ''}`);
          if (hoverItem.advice) {
            addComment(`💡 **Temsilci Stratejisi:** ${hoverItem.advice}`);
          }
        } else if (hoverItem.type === 'AGING') {
          addComment(`⏱️ **${hoverItem.title}:** ${hoverItem.subtitle || ''}`);
          if (hoverItem.advice) {
            addComment(`💡 **Vade Takibi Tavsiyesi:** ${hoverItem.advice}`);
          }
        } else {
          addComment(`💡 **${hoverItem.title}:** ${hoverItem.subtitle || ''}`);
        }

        setActiveHoverData(enrichedHoverItem);
        setFinancialComments(comments);
        setCommentIndex(0);
      } else {
        setActiveHoverData(null);
        setShowAnimeBubble(false);
        refreshFinancialComments();
      }
    });

    return () => unsubHover();
  }, []);

  useEffect(() => {
    let timeoutId: any;
    const debouncedRefresh = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => refreshFinancialComments(), 300);
    };

    refreshFinancialComments();
    
    const unsubData = subscribeDataChange(debouncedRefresh);
    const unsubFilters = subscribeDashboardFilters(debouncedRefresh);
    
    return () => {
      clearTimeout(timeoutId);
      unsubData();
      unsubFilters();
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

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
          const { detectFileType } = await import('../../utils/fileTypeDetector');
          const { processFile, readExcelFile, rawExcelCache } = await import('../../services/uploadService');

          const rows = await readExcelFile(file);
          if (rows && rows.length > 0) {
            rawExcelCache.set(file.name, rows);
          }

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
            else if (fname.includes('satış') || fname.includes('satis') || fname.includes('fatura')) typeKey = 'SATIS';
          }

          if (typeKey) {
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
              let systemInstructionForAi = `SİSTEM VERİSİ (GİZLİ BİLGİ - DOĞRUDAN KULLANICIYA YANSITMA):\nKullanıcının yüklediği "${label}" türündeki Excel dosyası arka planda başarıyla ayrıştırıldı ve veritabanına işlendi.\n\nİşlem İstatistikleri:\n`;
              if (notif) {
                if (notif.skippedDuplicate > 0) systemInstructionForAi += `- Mükerrer olduğu için atlanan/korunan kayıt: ${notif.skippedDuplicate}\n`;
                if (notif.cancelledRemoved > 0) systemInstructionForAi += `- İptal edilen/silinen işlem: ${notif.cancelledRemoved}\n`;
                if (notif.matchedCount > 0) systemInstructionForAi += `- Eşleşip 'Ödendi' yapılan evrak: ${notif.matchedCount}\n`;
                if (notif.added > 0) systemInstructionForAi += `- Veritabanına yeni kaydedilen: ${notif.added}\n`;
              } else {
                systemInstructionForAi += `- İşlenen toplam satır: ${res.result?.records?.length || 0}\n`;
              }
              systemInstructionForAi += `\nGörev: Kullanıcıya bu işlem sonucunu son derece doğal, akıllı bir asistan gibi açıkla. Sanki verileri sen okudun, analiz ettin ve veritabanına sen kaydettin gibi konuş. "Sistem verisi", "Gizli bilgi", "Rapor" gibi kalıplar kullanma. Gerekirse verileri yorumla.\nÖNEMLİ KISITLAMA: Hangi spesifik kayıtların iptal edildiği, eklendiği veya atlandığı (isim, fatura no vb.) sana verilmedi. Sadece yukarıdaki sayısal istatistikleri biliyorsun. Eğer kullanıcı "Hangileri eklendi?", "İptal olanlar kimlerdi?" diye sorarsa, detaylı listeyi göremediğini ancak veritabanına güvenle işlendiğini kibarca belirt.`;

              processed.push({
                fileName: file.name,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                textContent: systemInstructionForAi,
                displayContent: `Excel Dosyası İşlendi: ${label}`,
                isExcel: true,
                rowCount: res.result?.records?.length || 0,
                typeKey,
                notif
              });
              continue;
            }
          }

          const sampleRows = (rows || []).slice(0, 30);
          const columnNames = Object.keys((rows || [])[0] || {}).join(', ');

          let summaryText = `📁 **GENEL EXCEL TABLOSU (${file.name})**\n`;
          summaryText += `Bu dosya kalıplardan bağımsız olarak geçici yapay zeka belleğine (Sandbox) yüklendi.\n`;
          summaryText += `**Sütunlar:** ${columnNames}\n`;
          summaryText += `**Satır Sayısı:** ${rows.length}\n\n`;
          summaryText += `💡 *Bana bu tabloyla ilgili serbest sorular sorabilir veya mevcut çek/senet arşivinizle karşılaştırmamı isteyebilirsiniz.*`;

          processed.push({
            fileName: file.name,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            textContent: `GENEL EXCEL DOSYASI YÜKLENDİ (${file.name})\nSütunlar: ${columnNames}\nSatır Sayısı: ${rows.length}\nÖrnek Veriler (İlk 30 satır):\n${JSON.stringify(sampleRows, null, 2)}\n\nSİSTEM MESAJI: Kullanıcı sohbete genel bir Excel tablosu yükledi. Eğer tablo analizi yapacaksan 'readUploadedExcelData' aracını kullan. Eğer çek/senet karşılaştırması istenirse 'reconcileChequesWithExcel' kullan.`,
            displayContent: summaryText,
            isExcel: true,
            rowCount: rows.length
          });
          continue;
        } catch (err) {
          console.error('Excel okuma hatası:', err);
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

  const handleOpenFullPage = () => {
    setIsOpen(false);
    navigate('/ai-asistan');
  };

  const handleAdminLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authenticateAdmin(adminPasswordInput)) {
      setIsAdmin(true);
      setShowAdminModal(false);
      setAdminPasswordInput('');
      setAdminAuthError('');
    } else {
      setAdminAuthError('Hatalı Şifre!');
    }
  };

  const handleAdminLogout = () => {
    logoutAdmin();
    setIsAdmin(false);
    setShowRulesModal(false);
  };

  const handleDeleteRule = (id: string) => {
    deleteCustomRule(id);
    setCustomRules(getCustomRules());
  };

  const currentCommentObj = financialComments[commentIndex];
  const commentText = typeof currentCommentObj === 'string' ? currentCommentObj : (currentCommentObj?.text || '');

  const handleBubbleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(true);
  };

  return (
    <>
      {activeHoverData && (() => {
        const getTooltipStyle = () => {
          if (!activeHoverData?.targetRect) {
            return {
              position: 'fixed' as const,
              top: '76px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 999999,
              width: '420px',
              isAbove: false
            };
          }

          const rect = activeHoverData.targetRect;
          const width = Math.min(420, window.innerWidth - 32);

          let left = rect.left + (rect.width / 2) - (width / 2);
          left = Math.max(16, Math.min(window.innerWidth - width - 16, left));

          const spaceAbove = rect.top - 80;
          const spaceBelow = window.innerHeight - rect.bottom - 20;
          const isAbove = spaceAbove >= 220 || spaceAbove > spaceBelow;

          if (isAbove) {
            return {
              position: 'fixed' as const,
              bottom: `${Math.max(10, window.innerHeight - rect.top + 10)}px`,
              left: `${left}px`,
              width: `${width}px`,
              maxHeight: `${Math.min(380, Math.max(140, rect.top - 20))}px`,
              zIndex: 999999,
              isAbove: true
            };
          } else {
            return {
              position: 'fixed' as const,
              top: `${Math.max(10, rect.bottom + 10)}px`,
              left: `${left}px`,
              width: `${width}px`,
              maxHeight: `${Math.min(380, Math.max(140, window.innerHeight - rect.bottom - 20))}px`,
              zIndex: 999999,
              isAbove: false
            };
          }
        };

        const renderFormattedText = (text: string | null | undefined) => {
          if (!text) return null;
          const parts = text.split(/(\*\*.*?\*\*)/g);
          return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="tooltip-highlight">{part.slice(2, -2)}</strong>;
            }
            return part;
          });
        };

        const styleObj = getTooltipStyle();
        const { isAbove, ...positionStyle } = styleObj;

        const cust = activeHoverData.customerObj;
        const risk = cust ? calculateCustomerDebtToCollectionRiskSync(cust) : null;
        const dashFilters = getDashboardActiveFilters();
        const activePage = (activeHoverData as any).page || dashFilters.page;
        const selDate = (activeHoverData as any).selectedDate || dashFilters.selectedDate;

        const deepAnalysis = (activePage === 'fatura-kontrol' && cust && selDate)
          ? calculateDeepInvoiceAnalysisSync(cust, selDate)
          : null;

        const adviceText = deepAnalysis?.advice || activeHoverData.advice || risk?.actionAdvice || activeHoverData.subtitle;
        const subtitleText = deepAnalysis?.subtitle || activeHoverData.subtitle;

        const tooltipContent = (
          <div 
            className={`attached-eye-level-tooltip animate-scaleIn ${isAbove ? 'arrow-bottom' : 'arrow-top'}`}
            style={positionStyle}
          >
            <div className="tooltip-top-accent" />

            <div className="tooltip-header">
              <div className="tooltip-badge">
                <span className="tooltip-pulse-dot" />
                <span className="tooltip-tag-text">✨ GÜNLÜ ODAK ANALİZİ</span>
              </div>
              <span className="tooltip-title" title={activeHoverData.title}>
                {activeHoverData.title}
              </span>
            </div>

            <div className="tooltip-body">
              {cust && (
                <div className="tooltip-stat-grid">
                  <div className="tooltip-stat-tile">
                    <span className="stat-lbl">AÇIK BORÇ BAKİYESİ</span>
                    <span className="stat-val num" style={{ color: (cust.balance || 0) > 0 ? '#F87171' : (cust.balance || 0) < 0 ? '#34D399' : 'var(--text-primary)' }}>
                      {formatCurrency(cust.balance || 0)}
                    </span>
                  </div>
                  <div className="tooltip-stat-tile">
                    <span className="stat-lbl">TAHSİLAT KARŞILAMA</span>
                    <span className="stat-val num" style={{ color: '#F8FAFC' }}>
                      {risk ? `${risk.coverageMonths} Ay (${risk.coverageDays} Gün)` : `${cust.averageVade || cust.averageVadeDays || 0} Gün`}
                    </span>
                  </div>
                </div>
              )}

              {subtitleText && !cust && (
                <p className="tooltip-sub-text">{renderFormattedText(subtitleText)}</p>
              )}

              {adviceText && (
                <div className="tooltip-advice-box">
                  <span className="advice-icon">💡</span>
                  <div className="advice-text">{renderFormattedText(adviceText)}</div>
                </div>
              )}
            </div>

            {cust && (
              <div className="tooltip-footer">
                <span className="tooltip-cust-sub">
                  {cust.customerId} • {cust.salesRepName || cust.salesRep || 'Key Account'}
                </span>
                <button
                  className="btn-tooltip-action"
                  onClick={() => {
                    const event = new CustomEvent('open-customer-modal', { detail: cust });
                    window.dispatchEvent(event);
                    setActiveHoverData(null);
                  }}
                >
                  Ekstre & Detay ↗
                </button>
              </div>
            )}
          </div>
        );

        return createPortal(tooltipContent, document.body);
      })()}

      <div className="floating-ai-container" ref={containerRef}>
        <button
          className={`floating-ai-trigger transparent-living-mascot ${isOpen ? 'active' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          title="Günlü — AKGÜN AI Asistanı"
        >
        {isOpen ? (
          <div className="close-mascot-btn">✕</div>
        ) : (
          <div className="living-mascot-wrapper">
            <MascotAvatar size="large" />
            <span className="living-mascot-online-dot"></span>
          </div>
        )}
      </button>

      {isOpen && (
        <div 
          className={`floating-ai-window ${isExpanded ? 'expanded' : ''} ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="floating-ai-header">
            <div className="floating-ai-title">
              <MascotAvatar size="small" />
              <div className="ai-title-column">
                <div className="ai-title-row">
                  <span className="ai-title-text">Günlü</span>
                  <span className="online-badge">
                    <span className="online-dot-inline"></span>
                    <span>Aktif</span>
                  </span>
                  {isAdmin && <span className="admin-badge-glowing">🛡️ Admin</span>}
                </div>
                <small className="ai-subtitle-text">AKGÜN Akıllı Finansal Asistan</small>
              </div>
            </div>

            <div className="floating-ai-controls">
              {isAdmin ? (
                <>
                  <button 
                    onClick={clearChat} 
                    title="Sohbeti Temizle" 
                    className="control-btn"
                  >
                    <i className="ti ti-eraser" aria-hidden="true"></i> Temizle
                  </button>
                  <button 
                    onClick={() => setShowRulesModal(true)} 
                    title="Yapay Zeka Kuralları ve İzin Yönetimi" 
                    className="control-btn"
                  >
                    <i className="ti ti-settings" aria-hidden="true"></i> Kurallar
                  </button>
                  <button 
                    onClick={handleAdminLogout} 
                    title="Admin Yetkisini Kapat" 
                    className="control-btn danger"
                  >
                    <i className="ti ti-lock" aria-hidden="true"></i> Çıkış
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setShowAdminModal(true)} 
                  title="Admin Girişi (Şifre: 2580)" 
                  className="control-btn"
                >
                  <i className="ti ti-key" aria-hidden="true"></i> Admin Girişi
                </button>
              )}

              <button 
                onClick={() => setIsExpanded(prev => !prev)} 
                title={isExpanded ? 'Pencereyi Küçült' : 'Pencereyi Genişlet'} 
                className="control-btn icon-only"
              >
                <i className={isExpanded ? 'ti ti-minimize' : 'ti ti-maximize'} aria-hidden="true"></i>
              </button>
              <button 
                onClick={handleOpenFullPage} 
                title="Tam Ekran Sayfasına Git" 
                className="control-btn icon-only"
              >
                <i className="ti ti-external-link" aria-hidden="true"></i>
              </button>
              <button 
                onClick={() => setIsOpen(false)} 
                title="Kapat" 
                className="control-btn icon-only"
              >
                <i className="ti ti-x" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          {isDragging && (
            <div className="drag-drop-overlay">
              <div className="drag-drop-box">
                <span>📥</span>
                <strong>Görsel veya Dosyayı Bırakın</strong>
                <small>Dekont, Fatura Fotoğrafı, Excel veya PDF</small>
              </div>
            </div>
          )}

          <div className="floating-ai-body">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}

            {messages.length <= 1 && (
              <SuggestedQuestions onSelectQuestion={(q) => sendMessage(q)} />
            )}

            {loading && (
              <div className="floating-loading animate-pulse">
                <span>⚡</span> Yapay zeka veritabanını ve görselleri analiz ediyor...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {attachments.length > 0 && (
            <div className="attachment-preview-bar">
              {attachments.map((att, idx) => (
                <div key={idx} className="attachment-chip">
                  <span>{att.isPdf ? '📄' : (att.isImage ? '🖼️' : '📎')}</span>
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

          <form className="floating-ai-footer" onSubmit={handleSubmit} autoComplete="off">
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*,.pdf,.xlsx,.csv,.txt"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            
            <button
              type="button"
              className="action-icon-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Dekont, Fatura veya Görsel Yükle"
            >
              <i className="ti ti-paperclip" aria-hidden="true"></i>
            </button>

            <button
              type="button"
              className="action-icon-btn"
              onClick={handleVoiceInput}
              title="Sesli Konuş"
            >
              <i className="ti ti-microphone" aria-hidden="true"></i>
            </button>

            <input
              ref={textInputRef}
              type="text"
              placeholder="Soru yazın veya görsel/fatura sürükleyin..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loading}
              autoComplete="off"
            />

            <button
              type="submit"
              disabled={(!inputText.trim() && attachments.length === 0) || loading}
              className="send-btn"
              title="Gönder"
            >
              <i className="ti ti-arrow-up" aria-hidden="true"></i>
            </button>
          </form>

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
      )}
    </div>
    </>
  );
}
