// src/calculations/cariCalculations.ts
// Cari bakiye, ekstre ve yaşlandırma hesaplamaları.
// Panel VE WhatsApp bot bu modülü kullanır — UI bağımlılığı YOK.

export interface SaleInvoiceInput {
  amount?: number;
  type?: string;
  invoiceDate?: string | Date;
  date?: string | Date;
  eDocumentNo?: string;
  description?: string;
  invoiceId?: string;
  collectionId?: string;
}

export interface CollectionInput {
  amount?: number;
  type?: string;
  date?: string | Date;
  method?: string;
  eDocumentNo?: string;
  description?: string;
  collectionId?: string;
}

export interface CreditNoteInput {
  amount?: number;
  type?: string;
  date?: string | Date;
}

export interface CollectionEvent {
  eventType: 'TAHSILAT' | 'ALACAK_DEKONTU';
  method?: string;
  date?: string | Date;
  amount?: number;
  [key: string]: any;
}

export interface AgingBucketsResult {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  averageVade: number;
  distribution?: {
    current: number[];
    days30: number[];
    days60: number[];
    days90: number[];
    over90: number[];
  };
  [key: string]: any;
}

export interface OpenInvoice {
  invoiceId: string;
  invoiceDate: string | Date;
  eDocumentNo: string;
  daysOverdue: number;
  originalAmount: number;
  openAmount: number;
  isPartial: boolean;
}

export interface FinancialHealthResult {
  healthScore: number;
  riskLevel: string;
  riskColor: string;
  overdueRatio: number;
  criticalOverdueRatio?: number;
  actionRecommendation: string;
}

export interface ParetoResult {
  totalValue: number;
  totalCustomerCount?: number;
  countFor80Percent?: number;
  percentageOfCustomersFor80Percent?: number;
  top20Count?: number;
  top20Percentage?: number;
  concentrationRatio?: number;
  isConcentrationHigh?: boolean;
  topCustomers?: Array<{
    customerId: string;
    name: string;
    value: number;
    share: number;
  }>;
}

/**
 * Müşteri cari bakiyesini hesaplar.
 * Karar #5 (Güncel): Bakiye = Satış - (Tahsilat + Alacak Dekontları)
 */
export function calculateBalance(
  salesInvoices: SaleInvoiceInput[] = [],
  collections: CollectionInput[] = [],
  creditNotes: CreditNoteInput[] = []
): number {
  const isDevirAlacak = (item: { type?: string }) => {
    const typeStr = String(item.type || '').toUpperCase();
    return typeStr.includes('DEVIR_ALACAK') || typeStr.includes('VIRMAN_ALACAK');
  };
  const isDevirBorc = (item: { type?: string; eDocumentNo?: string; description?: string }) => {
    const typeStr = String(item.type || '').toUpperCase();
    const docStr = String(item.eDocumentNo || '').toUpperCase();
    const descStr = String(item.description || '').toUpperCase();
    return typeStr.includes('DEVIR_BORC') || typeStr.includes('VIRMAN_BORC') || typeStr === 'DEVIR' || typeStr === 'VIRMAN' || docStr.includes('ÖZEL_AKTARIM') || descStr.includes('DEVİR');
  };

  let totalSales = 0;
  for (const s of salesInvoices) {
    if (isDevirAlacak(s)) totalSales -= (s.amount || 0);
    else totalSales += (s.amount || 0);
  }

  let totalCollections = 0;
  for (const c of collections) {
    if (isDevirBorc(c)) totalCollections -= (c.amount || 0);
    else totalCollections += (c.amount || 0);
  }

  const totalCreditNotes = creditNotes.reduce((sum, cn) => sum + (cn.amount || 0), 0);
  
  const rawBalance = totalSales - totalCollections - totalCreditNotes;
  // Round to 2 decimal places to fix floating point imprecision
  return Math.round(rawBalance * 100) / 100;
}

/**
 * Tüm tahsilat olaylarını birleştirir (collections + customer_credit_notes).
 */
export function getAllCollectionEvents(
  collections: CollectionInput[] = [],
  creditNotes: CreditNoteInput[] = []
): CollectionEvent[] {
  const collectionEvents: CollectionEvent[] = collections.map((c) => ({
    ...c,
    eventType: 'TAHSILAT',
    method: c.method,
  }));

  const creditNoteEvents: CollectionEvent[] = creditNotes.map((cn) => ({
    ...cn,
    eventType: 'ALACAK_DEKONTU',
    method: cn.type,
  }));

  return [...collectionEvents, ...creditNoteEvents].sort(
    (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  );
}

/**
 * Bir faturanın kaç gün geciktiğini hesaplar.
 */
export function getDaysOverdue(invoiceDate: string | Date | undefined | null, referenceDate = new Date()): number {
  if (!invoiceDate) return 0;
  
  let invDate: Date;
  if (typeof invoiceDate === 'string') {
    const cleanStr = invoiceDate.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
      const [y, m, d] = cleanStr.split('-').map(Number);
      invDate = new Date(y, m - 1, d);
    } else {
      invDate = new Date(invoiceDate);
    }
  } else {
    invDate = new Date(invoiceDate);
  }

  if (isNaN(invDate.getTime())) return 0;

  const d1 = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
  const d2 = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());

  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Faturaları ve Tahsilatları FIFO yöntemiyle yaşlandırma dilimlerine böler.
 */
export function getAgingBuckets(
  salesInvoices: SaleInvoiceInput[] = [],
  collections: CollectionInput[] = [],
  creditNotes: CreditNoteInput[] = [],
  referenceDate = new Date()
): AgingBucketsResult {
  const distribution: { current: number[]; days30: number[]; days60: number[]; days90: number[]; over90: number[] } = {
    current: [], days30: [], days60: [], days90: [], over90: []
  };

  const buckets: AgingBucketsResult = {
    current: 0, days30: 0, days60: 0, days90: 0, over90: 0, averageVade: 0, distribution
  };

  const balance = calculateBalance(salesInvoices, collections, creditNotes);
  if (balance <= 0) {
    return buckets;
  }

  const isDevirAlacak = (item: { type?: string }) => {
    const typeStr = String(item.type || '').toUpperCase();
    return typeStr.includes('DEVIR_ALACAK') || typeStr.includes('VIRMAN_ALACAK');
  };
  const isDevirBorc = (item: { type?: string; eDocumentNo?: string; description?: string }) => {
    const typeStr = String(item.type || '').toUpperCase();
    const docStr = String(item.eDocumentNo || '').toUpperCase();
    const descStr = String(item.description || '').toUpperCase();
    return typeStr.includes('DEVIR_BORC') || typeStr.includes('VIRMAN_BORC') || typeStr === 'DEVIR' || typeStr === 'VIRMAN' || docStr.includes('ÖZEL_AKTARIM') || descStr.includes('DEVİR');
  };

  const realDebts: Array<any> = [];
  let remainingPayment = 0;

  for (const s of salesInvoices) {
    if (isDevirAlacak(s)) remainingPayment += (s.amount || 0);
    else realDebts.push({ ...s, dateObj: new Date(s.invoiceDate || s.date || 0) });
  }

  for (const c of collections) {
    if (isDevirBorc(c)) realDebts.push({ ...c, dateObj: new Date(c.date || 0), invoiceDate: c.date });
    else remainingPayment += (c.amount || 0);
  }

  const totalCreditNotes = creditNotes.reduce((sum, cn) => sum + (cn.amount || 0), 0);
  remainingPayment += totalCreditNotes;

  const sortedInvoices = realDebts.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  let totalUnpaid = 0;
  let weightedDaysSum = 0;

  for (const inv of sortedInvoices) {
    const invAmount = inv.amount || 0;
    if (remainingPayment >= invAmount) {
      remainingPayment = Math.round((remainingPayment - invAmount) * 100) / 100;
    } else {
      const unpaidAmount = Math.round((invAmount - remainingPayment) * 100) / 100;
      remainingPayment = 0;

      if (unpaidAmount > 0) {
        const days = getDaysOverdue(inv.invoiceDate || inv.date, referenceDate);
        let key: 'current' | 'days30' | 'days60' | 'days90' | 'over90';
        if (days <= 30)       key = 'current';
        else if (days <= 60)  key = 'days30';
        else if (days <= 90)  key = 'days60';
        else if (days <= 120) key = 'days90';
        else                  key = 'over90';

        buckets[key] += unpaidAmount;
        distribution[key].push(unpaidAmount);

        totalUnpaid += unpaidAmount;
        weightedDaysSum += (unpaidAmount * Math.max(0, days));
      }
    }
  }

  buckets.averageVade = totalUnpaid > 0 ? Math.round(weightedDaysSum / totalUnpaid) : 0;

  for (const k of Object.keys(distribution) as Array<keyof typeof distribution>) {
    distribution[k].sort((a, b) => b - a);
  }

  return buckets;
}

/**
 * Müşterinin ödenmemiş AÇIK FATURALARINI hesaplar.
 */
export function getOpenInvoices(
  salesInvoices: SaleInvoiceInput[] = [],
  collections: CollectionInput[] = [],
  creditNotes: CreditNoteInput[] = [],
  referenceDate = new Date()
): OpenInvoice[] {
  const balance = calculateBalance(salesInvoices, collections, creditNotes);
  if (balance <= 0) return [];

  const isDevirAlacak = (item: { type?: string }) => {
    const typeStr = String(item.type || '').toUpperCase();
    return typeStr.includes('DEVIR_ALACAK') || typeStr.includes('VIRMAN_ALACAK');
  };
  const isDevirBorc = (item: { type?: string; eDocumentNo?: string; description?: string }) => {
    const typeStr = String(item.type || '').toUpperCase();
    const docStr = String(item.eDocumentNo || '').toUpperCase();
    const descStr = String(item.description || '').toUpperCase();
    return typeStr.includes('DEVIR_BORC') || typeStr.includes('VIRMAN_BORC') || typeStr === 'DEVIR' || typeStr === 'VIRMAN' || docStr.includes('ÖZEL_AKTARIM') || descStr.includes('DEVİR');
  };

  const realDebts: Array<any> = [];
  let remainingPayment = 0;

  for (const s of salesInvoices) {
    if (isDevirAlacak(s)) remainingPayment += (s.amount || 0);
    else realDebts.push({ ...s, dateObj: new Date(s.invoiceDate || s.date || 0) });
  }

  for (const c of collections) {
    if (isDevirBorc(c)) realDebts.push({ ...c, dateObj: new Date(c.date || 0), invoiceDate: c.date });
    else remainingPayment += (c.amount || 0);
  }

  const totalCreditNotes = creditNotes.reduce((sum, cn) => sum + (cn.amount || 0), 0);
  remainingPayment += totalCreditNotes;

  const sortedInvoices = realDebts.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  const openInvoices: OpenInvoice[] = [];

  for (const inv of sortedInvoices) {
    const invAmount = inv.amount || 0;
    if (remainingPayment >= invAmount) {
      remainingPayment = Math.round((remainingPayment - invAmount) * 100) / 100;
    } else {
      const openAmount = Math.round((invAmount - remainingPayment) * 100) / 100;
      remainingPayment = 0;

      if (openAmount > 0) {
        const daysOverdue = getDaysOverdue(inv.invoiceDate || inv.date, referenceDate);
        openInvoices.push({
          invoiceId: inv.invoiceId || inv.collectionId || '',
          invoiceDate: inv.invoiceDate || inv.date || '',
          eDocumentNo: inv.eDocumentNo || inv.invoiceId || inv.collectionId || '',
          daysOverdue: daysOverdue,
          originalAmount: invAmount,
          openAmount: openAmount,
          isPartial: openAmount < invAmount
        });
      }
    }
  }

  return openInvoices;
}

/**
 * Vade Aşım Oranını (Overdue Ratio %) hesaplar.
 */
export function calculateOverdueRatio(agingBuckets: Partial<AgingBucketsResult> = {}, netBalance = 0): number {
  if (!netBalance || netBalance <= 0) return 0;
  const overdueAmount = (agingBuckets.days30 || 0) + (agingBuckets.days60 || 0) + (agingBuckets.days90 || 0) + (agingBuckets.over90 || 0);
  const ratio = (overdueAmount / netBalance) * 100;
  return Math.min(100, Math.max(0, Math.round(ratio * 10) / 10));
}

/**
 * CFO Seviyesinde Finansal Sağlık Skoru (0-100) ve Risk Kategorisi hesaplar.
 */
export function calculateFinancialHealthScore(
  agingBuckets: Partial<AgingBucketsResult> = {},
  netBalance = 0,
  paymentTrendDays = 30
): FinancialHealthResult {
  if (netBalance <= 0) {
    return {
      healthScore: 100,
      riskLevel: 'MÜKEMMEL (ALACAKLI/SIFIR BORÇ)',
      riskColor: '#28A745',
      overdueRatio: 0,
      actionRecommendation: 'Müşteri hesabı alacaklı/sıfır bakiyeli. Standart ticari şartlarla sevkiyata devam edilebilir.'
    };
  }

  const days30 = agingBuckets.days30 || 0;
  const days60 = agingBuckets.days60 || 0;
  const days90 = agingBuckets.days90 || 0;
  const over90 = agingBuckets.over90 || 0;

  const overdueRatio = calculateOverdueRatio(agingBuckets, netBalance);

  let score = 100;
  score -= (overdueRatio * 0.6);

  const criticalOverdueRatio = ((days60 + days90 + over90) / netBalance) * 100;
  score -= (criticalOverdueRatio * 0.4);

  if (over90 > 0) {
    score -= Math.min(25, (over90 / netBalance) * 50);
  }

  if (paymentTrendDays > 45) {
    score -= Math.min(15, (paymentTrendDays - 45) * 0.5);
  }

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));

  let riskLevel = 'DÜŞÜK RİSK';
  let riskColor = '#28A745';
  let actionRecommendation = 'Borç ödeme disiplini yüksek. Standart vade ve limitlerle çalışılabilir.';

  if (finalScore < 40 || over90 > 0 || overdueRatio > 60) {
    riskLevel = 'KRİTİK RİSK (SEVKİYAT DURDURMA UYARISI)';
    riskColor = '#DC3545';
    actionRecommendation = '🚨 DİKKAT: Vadesi geçmiş ciddi borç birikimi var. Yeni sevkiyatlar derhal dondurulmalı, teminat senetleri veya yasal takip süreci değerlendirilmelidir.';
  } else if (finalScore < 65 || overdueRatio > 35) {
    riskLevel = 'YÜKSEK RİSK (KONTROLLÜ SEVKİYAT)';
    riskColor = '#FD7E14';
    actionRecommendation = '⚠️ UYARI: Vade aşımı artış gösteriyor. Açık hesap sevkiyat durdurulmalı, sadece nakit veya kredi kartı karşılığı teslimat yapılmalıdır.';
  } else if (finalScore < 85 || overdueRatio > 15) {
    riskLevel = 'ORTA RİSK (TAKİPLİ VADE)';
    riskColor = '#FFC107';
    actionRecommendation = '⚡ BİLGİ: Vadesi 30 günü geçen ödemeler mevcut. Satış temsilcisi üzerinden haftalık tahsilat takibi sıkılaştırılmalıdır.';
  }

  return {
    healthScore: finalScore,
    riskLevel,
    riskColor,
    overdueRatio,
    criticalOverdueRatio: Math.round(criticalOverdueRatio * 10) / 10,
    actionRecommendation
  };
}

/**
 * Tahsilat Etkinlik İndeksini (CEI %) hesaplar.
 */
export function calculateCEI(totalCollections = 0, totalSales = 0, currentReceivables = 0): number {
  const denominator = (currentReceivables + totalCollections);
  if (denominator <= 0) return 100;
  const cei = (totalCollections / denominator) * 100;
  return Math.min(100, Math.max(0, Math.round(cei * 10) / 10));
}

/**
 * Pareto (80/20) Yoğunlaşma Analizi.
 */
export function calculateParetoConcentration(items: any[] = [], valueKey = 'balance'): ParetoResult {
  if (!items || items.length === 0) {
    return { totalValue: 0, top20Count: 0, top20Percentage: 0, concentrationRatio: 0 };
  }

  const validItems = items
    .map(item => ({ ...item, numVal: Math.max(0, Number(item[valueKey]) || 0) }))
    .filter(item => item.numVal > 0)
    .sort((a, b) => b.numVal - a.numVal);

  const totalValue = validItems.reduce((sum, i) => sum + i.numVal, 0);
  if (totalValue <= 0) {
    return { totalValue: 0, top20Count: 0, top20Percentage: 0, concentrationRatio: 0, topCustomers: [] };
  }

  let runningSum = 0;
  let countFor80Percent = 0;

  for (let i = 0; i < validItems.length; i++) {
    runningSum += validItems[i].numVal;
    countFor80Percent = i + 1;
    if ((runningSum / totalValue) >= 0.8) {
      break;
    }
  }

  const totalCustomerCount = items.length;
  const countRatio = Math.round((countFor80Percent / totalCustomerCount) * 100 * 10) / 10;

  return {
    totalValue,
    totalCustomerCount,
    countFor80Percent,
    percentageOfCustomersFor80Percent: countRatio,
    isConcentrationHigh: countRatio <= 20,
    topCustomers: validItems.slice(0, countFor80Percent).map(c => ({
      customerId: c.customerId,
      name: c.customerName || c.signName || '',
      value: c.numVal,
      share: Math.round((c.numVal / totalValue) * 100 * 10) / 10
    }))
  };
}
