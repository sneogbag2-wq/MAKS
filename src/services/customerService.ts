// src/services/customerService.ts
// Cari / Müşteri okuma ve sorgulama servisleri.
// UI bileşenleri ve WhatsApp Bot bu servisleri kullanır.

import {
  calculateBalance,
  getAllCollectionEvents,
  getAgingBuckets,
  getOpenInvoices,
  calculateFinancialHealthScore,
  calculateOverdueRatio,
  calculateCEI,
  calculateParetoConcentration
} from '../calculations/cariCalculations';
import { safeIsoDate } from '../utils/dateUtils';
import {
  hasArchivedData,
  loadCustomers,
  loadAllSalesInvoices,
  loadAllCollections,
  loadAllCreditNotes,
  loadAllPurchaseInvoices,
  archiveCustomers,
  archiveSalesInvoices,
  archiveCollections,
  archivePurchaseInvoices,
  archiveCreditNotes,
  archiveCheques,
  deleteSalesInvoiceRecord,
  deleteCollectionRecord,
  deleteCreditNoteRecord,
  deleteChequeRecord,
  loadAllCheques,
  updateChequesInArchive,
  addUploadLogEntry,
  clearAllArchive,
} from './archiveService';
import { isAdminAuthenticated } from './customRulesService';

// React re-render abonelikleri için listener seti
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export function subscribeDataChange(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// Dashboard Aktif Filtre Abonelik Sistemi
export interface DashboardFilters {
  repFilter?: string;
  searchQuery?: string;
  riskFilter?: string;
  [key: string]: any;
}

let activeDashboardFilters: DashboardFilters = { repFilter: 'ALL', searchQuery: '', riskFilter: 'ALL' };
const filterListeners = new Set<(filters: DashboardFilters) => void>();

export function setDashboardActiveFilters(filters: Partial<DashboardFilters>) {
  activeDashboardFilters = { ...activeDashboardFilters, ...filters };
  filterListeners.forEach((fn) => {
    try { fn(activeDashboardFilters); } catch (e) { console.error(e); }
  });
}

export function getDashboardActiveFilters(): DashboardFilters {
  return activeDashboardFilters;
}

export function subscribeDashboardFilters(callback: (filters: DashboardFilters) => void) {
  filterListeners.add(callback);
  try { callback(activeDashboardFilters); } catch (e) {}
  return () => filterListeners.delete(callback);
}

// Canlı Müşteri Detay Modalı Tetikleyici Sistemi
const modalOpenListeners = new Set<(target: any) => void>();

export function triggerOpenCustomerModal(customerObj: any) {
  let target = customerObj;
  if (typeof customerObj === 'string') {
    target = { customerId: customerObj };
  }
  if (target && target.customerId) {
    const fullCust = mockCustomers.find((c) => c.customerId === target.customerId) ||
                     (searchCustomersSync(target.customerId, true) || [])[0];
    if (fullCust) target = fullCust;
  }
  modalOpenListeners.forEach((fn) => {
    try { fn(target); } catch (e) { console.error(e); }
  });
}

export function subscribeOpenCustomerModal(callback: (target: any) => void) {
  modalOpenListeners.add(callback);
  return () => modalOpenListeners.delete(callback);
}

// Seed (Mock) Verisi
const SEED_CUSTOMERS = [
  {
    customerId: '5000266833',
    customerName: 'SAATÇİOĞLU GRUP İNŞAAT TURİZM SANAYİ VE TİCARET LİMİTED ŞİRKETİ GAZİ SAATÇİOĞLU',
    signName: 'Mest Plajı',
    salesManagerName: 'AHMET YILMAZ',
    salesRepName: 'ALİ YÜKSEL',
    salesChannel: 'Yerinde Tüketim (Horeca)',
    volumeSegment: 'A Segment',
    province: 'Muğla',
    district: 'Bodrum',
    phone: '5321112233',
    customerStatus: 'Aktif (A)',
  },
  {
    customerId: '5000188291',
    customerName: 'MARMARA TEKEL VE ŞARKÜTERİ',
    signName: 'Marmara Tekel',
    salesManagerName: 'AHMET YILMAZ',
    salesRepName: 'ALI DEMİR',
    salesChannel: 'Açık Satış (Perakende)',
    volumeSegment: 'B Segment',
    province: 'İstanbul',
    district: 'Kadıköy',
    phone: '5334445566',
    customerStatus: 'Aktif (A)',
  },
  {
    customerId: '5000994112',
    customerName: 'BOĞAZİÇİ EĞLENCE HİZMETLERİ A.Ş.',
    signName: 'Sunset Club',
    salesManagerName: 'SERKAN ŞAHİN',
    salesRepName: 'CAN AYDOGAN',
    salesChannel: 'Yerinde Tüketim (Horeca)',
    volumeSegment: 'VIP Segment',
    province: 'İstanbul',
    district: 'Sarıyer',
    phone: '5357778899',
    customerStatus: 'Aktif (A)',
  },
  {
    customerId: '5000771234',
    customerName: 'KAPATILAN ESKİ BÜFE LTD. ŞTİ.',
    signName: 'Eski Büfe',
    salesManagerName: 'AHMET YILMAZ',
    salesRepName: 'ALİ YÜKSEL',
    salesChannel: 'Açık Satış (Perakende)',
    volumeSegment: 'C Segment',
    province: 'İstanbul',
    district: 'Beşiktaş',
    phone: '5320000000',
    customerStatus: '(C)',
  }
];

const SEED_SALES = [
  { invoiceId: 'FAT-2026-001', invoiceDate: '2026-06-15', customerId: '5000266833', amount: 154200.00, eDocumentNo: 'GIB202600000101' },
  { invoiceId: 'FAT-2026-002', invoiceDate: '2026-07-02', customerId: '5000266833', amount: 87500.50, eDocumentNo: 'GIB202600000102' },
  { invoiceId: 'FAT-2026-003', invoiceDate: '2026-07-20', customerId: '5000266833', amount: 45000.00, eDocumentNo: 'GIB202600000103' },
  { invoiceId: 'FAT-2026-004', invoiceDate: '2026-07-10', customerId: '5000188291', amount: 62000.00, eDocumentNo: 'GIB202600000104' },
  { invoiceId: 'FAT-2026-005', invoiceDate: '2026-05-10', customerId: '5000771234', amount: 10000.00, eDocumentNo: 'GIB202600000105' },
];

const SEED_COLLECTIONS = [
  { collectionId: 'TAH-2026-101', customerId: '5000266833', date: '2026-06-25', amount: 100000.00, method: 'HAVALE', status: 'CREATED' },
  { collectionId: '1501189579',   customerId: '5000266833', date: '2026-06-25', amount: 50671.68, method: 'KREDİ_KARTI', status: 'CREATED' },
  { collectionId: '1501214261',   customerId: '5000266833', date: '2026-06-28', amount: 50000.00, method: 'HAVALE', status: 'CREATED' },
  { collectionId: '1501288283',   customerId: '5000266833', date: '2026-06-29', amount: 32246.00, method: 'HAVALE', status: 'CREATED' },
  { collectionId: '1501325800',   customerId: '5000266833', date: '2026-07-14', amount: 29306.00, method: 'HAVALE', status: 'CREATED' },
  { collectionId: 'TAH-2026-102', customerId: '5000266833', date: '2026-07-15', amount: 50000.00, method: 'NAKİT', status: 'CREATED' },
  { collectionId: '1501354109',   customerId: '5000266833', date: '2026-07-16', amount: 10157.00, method: 'HAVALE', status: 'CREATED' },
  { collectionId: '1501347702',   customerId: '5000266833', date: '2026-07-17', amount: 100000.00, method: 'HAVALE', status: 'CREATED' },
  { collectionId: '1501347703',   customerId: '5000266833', date: '2026-07-17', amount: 3769.00, method: 'HAVALE', status: 'CREATED' },
  { collectionId: 'TAH-2026-103', customerId: '5000188291', date: '2026-07-12', amount: 62000.00, method: 'KREDİ_KARTI', status: 'CREATED' },
  { collectionId: 'TAH-2026-104', customerId: '5000771234', date: '2026-05-20', amount: 10000.00, method: 'HAVALE', status: 'CREATED' },
];

const SEED_CREDIT_NOTES = [
  { creditNoteId: 'IAD-2026-001', customerId: '5000266833', date: '2026-07-05', amount: 12500.00, type: 'IADE_FATURASI', eDocumentNo: 'GIB202600000901', status: 'CREATED' }
];

let mockCustomers: any[]        = [];
let mockSalesInvoices: any[]    = [];
let mockCollections: any[]      = [];
let mockCreditNotes: any[]      = [];
let mockPurchaseInvoices: any[] = [];
let mockCheques: any[]          = [];

let usingSeedData = false;

export function isUsingSeedData(): boolean {
  return usingSeedData;
}

function loadSeedData() {
  mockCustomers        = [...SEED_CUSTOMERS];
  mockSalesInvoices    = [...SEED_SALES];
  mockCollections      = [...SEED_COLLECTIONS];
  mockCreditNotes      = [...SEED_CREDIT_NOTES];
  mockPurchaseInvoices = [];
  mockCheques          = [];
  usingSeedData        = true;
  ensureCustomerMasterIntegrity();
}

function ensureCustomerMasterIntegrity() {
  const existingIds = new Set(mockCustomers.map((c) => c.customerId));
  const synthetic: any[] = [];

  const checkAndAdd = (cid: string | null | undefined, defaultName: string | null | undefined) => {
    if (!cid || existingIds.has(cid)) return;
    existingIds.add(cid);
    synthetic.push({
      customerId: cid,
      customerName: defaultName || `Cari (${cid})`,
      signName: defaultName || `Cari (${cid})`,
      customerStatus: 'Aktif',
      salesRepName: 'Belirtilmemiş',
      province: '-',
      district: '-',
    });
  };

  mockSalesInvoices.forEach((s) => checkAndAdd(s.customerId, s._customerName));
  mockCollections.forEach((c) => checkAndAdd(c.customerId, null));
  mockCreditNotes.forEach((cn) => checkAndAdd(cn.customerId, null));
  mockPurchaseInvoices.forEach((p) => checkAndAdd(p.customerId, null));
  mockCheques.forEach((ch) => checkAndAdd(ch.customerId, ch.customerName));

  if (synthetic.length > 0) {
    mockCustomers = [...mockCustomers, ...synthetic];
  }
}

export async function initFromArchive() {
  try {
    if (await hasArchivedData()) {
      [mockCustomers, mockSalesInvoices, mockCollections, mockCreditNotes, mockPurchaseInvoices, mockCheques] =
        await Promise.all([
          loadCustomers(),
          loadAllSalesInvoices(),
          loadAllCollections(),
          loadAllCreditNotes(),
          loadAllPurchaseInvoices(),
          loadAllCheques(),
        ]);
      usingSeedData = false;
      ensureCustomerMasterIntegrity();
      await autoMatchAndClearChequesAndSenets();
    } else {
      loadSeedData();
    }
  } catch (err) {
    loadSeedData();
  }
  invalidateCache();
}

let _initPromise: Promise<void> | null = initFromArchive().catch(() => {});

export function waitForInit(): Promise<void> | null {
  return _initPromise;
}

async function ready() {
  if (_initPromise) await _initPromise;
}

export function formatCurrency(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '₺0,00';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(num);
}

export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('tr-TR');
  } catch (e) {
    return String(dateStr);
  }
}

let customerBalanceCache: Record<string, number> | null = null;
let chequeMapCache: Record<string, number> | null = null;
let normalizedSearchStrings: Record<string, string> = {};
let advancedInsightsCache: any[] | null = null;
let repPerfCache: any = null;
let statementCache: Record<string, any> = {};
let invoiceControlCache: Record<string, any> = {};

let salesByCustCache: Record<string, any[]> | null = null;
let colsByCustCache: Record<string, any[]> | null = null;
let credsByCustCache: Record<string, any[]> | null = null;

export function invalidateCache() {
  customerBalanceCache = null;
  chequeMapCache = null;
  normalizedSearchStrings = {};
  advancedInsightsCache = null;
  repPerfCache = null;
  statementCache = {};
  invoiceControlCache = {};
  salesByCustCache = null;
  colsByCustCache = null;
  credsByCustCache = null;
}

export function buildMapsIfNeeded() {
  if (salesByCustCache) return { salesByCust: salesByCustCache, colsByCust: colsByCustCache, credsByCust: credsByCustCache };
  salesByCustCache = {}; colsByCustCache = {}; credsByCustCache = {};
  for (const s of mockSalesInvoices) {
    if (!salesByCustCache[s.customerId]) salesByCustCache[s.customerId] = [];
    salesByCustCache[s.customerId].push(s);
  }
  for (const col of mockCollections) {
    if (col.status === 'CREATED') {
      if (!colsByCustCache[col.customerId]) colsByCustCache[col.customerId] = [];
      colsByCustCache[col.customerId].push(col);
    }
  }
  for (const cn of mockCreditNotes) {
    if (cn.status === 'CREATED') {
      if (!credsByCustCache[cn.customerId]) credsByCustCache[cn.customerId] = [];
      credsByCustCache[cn.customerId].push(cn);
    }
  }
  return { salesByCust: salesByCustCache, colsByCust: colsByCustCache, credsByCust: credsByCustCache };
}

function getChequeMap(): Record<string, number> {
  if (chequeMapCache) return chequeMapCache;

  const chequesMap: Record<string, number> = {};
  for (const ch of mockCheques) {
    if (ch.status === 'CREATED' || ch.status === 'PORTFOY' || ch.status === 'TAHSILDE') {
      chequesMap[ch.customerId] = (chequesMap[ch.customerId] || 0) + (ch.amount || 0);
    }
  }
  chequeMapCache = chequesMap;
  return chequesMap;
}

function getBalanceMap(): Record<string, number> {
  if (customerBalanceCache) return customerBalanceCache;

  const salesMap: Record<string, number> = {};
  for (const s of mockSalesInvoices) {
    const typeStr = String(s.type || '').toUpperCase();
    const docStr = String(s.eDocumentNo || '').toUpperCase();
    const descStr = String(s.description || '').toUpperCase();
    
    const isDevirAlacak = typeStr.includes('DEVIR_ALACAK') || typeStr.includes('VIRMAN_ALACAK');
    const isDevirBorc = typeStr.includes('DEVIR_BORC') || typeStr.includes('VIRMAN_BORC') || typeStr === 'DEVIR' || typeStr === 'VIRMAN' || docStr.includes('ÖZEL_AKTARIM') || descStr.includes('DEVİR');

    if (isDevirAlacak) {
      salesMap[s.customerId] = (salesMap[s.customerId] || 0) - (s.amount || 0);
    } else {
      salesMap[s.customerId] = (salesMap[s.customerId] || 0) + (s.amount || 0);
    }
  }

  const collectionsMap: Record<string, number> = {};
  for (const c of mockCollections) {
    if (c.status === 'CREATED') {
      const typeStr = String(c.type || '').toUpperCase();
      const isDevirBorc = typeStr.includes('DEVIR_BORC') || typeStr.includes('VIRMAN_BORC');
      if (isDevirBorc) {
        collectionsMap[c.customerId] = (collectionsMap[c.customerId] || 0) - (c.amount || 0);
      } else {
        collectionsMap[c.customerId] = (collectionsMap[c.customerId] || 0) + (c.amount || 0);
      }
    }
  }

  const creditNotesMap: Record<string, number> = {};
  for (const cn of mockCreditNotes) {
    if (cn.status === 'CREATED') {
      creditNotesMap[cn.customerId] = (creditNotesMap[cn.customerId] || 0) + (cn.amount || 0);
    }
  }

  const chequesMap = getChequeMap();

  const map: Record<string, number> = {};
  for (const cust of mockCustomers) {
    const cid = cust.customerId;
    const salesSum = salesMap[cid] || 0;
    const collectionsSum = collectionsMap[cid] || 0;
    const creditSum = creditNotesMap[cid] || 0;
    const chequeSum = chequesMap[cid] || 0;
    map[cid] = salesSum - collectionsSum - creditSum - chequeSum;
  }

  customerBalanceCache = map;
  return map;
}

export function isPassiveOrCanceledStatus(customerStatusStr: string | null | undefined): boolean {
  if (!customerStatusStr) return false;
  const status = String(customerStatusStr).trim().toLowerCase();

  return (
    status === 'c' ||
    status === '(c)' ||
    status === 'p' ||
    status === '(p)' ||
    status.includes('iptal') ||
    status.includes('pasif') ||
    status.includes('cancelled') ||
    status.includes('passive') ||
    status.startsWith('(c)') ||
    status.startsWith('(p)') ||
    status.endsWith('(c)') ||
    status.endsWith('(p)')
  );
}

export function isCustomerHiddenFromList(customer: any, balance: number): boolean {
  if (!customer) return false;
  const isPassiveOrCanceled = isPassiveOrCanceledStatus(customer.customerStatus);
  if (isPassiveOrCanceled && balance < 30) {
    return true;
  }
  return false;
}

export async function saveUploadedData(fileTypeKey: string, parsedResult: any, fileMeta: any = {}) {
  if (!parsedResult) return {};

  if (usingSeedData) {
    mockCustomers        = [];
    mockSalesInvoices    = [];
    mockCollections      = [];
    mockCreditNotes      = [];
    mockPurchaseInvoices = [];
    usingSeedData        = false;
  }

  let mergeResult: any = {};

  if (fileTypeKey === 'MUSTERI_MASTER' && parsedResult.records) {
    mergeResult = await archiveCustomers(parsedResult.records);
    mockCustomers = await loadCustomers();

  } else if (fileTypeKey === 'SATIS' && parsedResult.records) {
    mergeResult = await archiveSalesInvoices(parsedResult.records);
    mockSalesInvoices = await loadAllSalesInvoices();

  } else if (fileTypeKey === 'SATIN_ALMA') {
    let purchMerge: any = {}, cnMerge: any = {};
    if (parsedResult.purchaseRecords) {
      purchMerge = await archivePurchaseInvoices(parsedResult.purchaseRecords);
      mockPurchaseInvoices = await loadAllPurchaseInvoices();
    }
    if (parsedResult.creditNoteRecords) {
      cnMerge = await archiveCreditNotes(parsedResult.creditNoteRecords);
      mockCreditNotes = await loadAllCreditNotes();
    }
    mergeResult = {
      added:            (purchMerge.added || 0) + (cnMerge.added || 0),
      skippedDuplicate: (purchMerge.skippedDuplicate || 0) + (cnMerge.skippedDuplicate || 0),
      cancelledRemoved: (purchMerge.cancelledRemoved || 0) + (cnMerge.cancelledRemoved || 0),
    };

  } else if ((fileTypeKey === 'NAKIT_TAHSILAT' || fileTypeKey === 'HAVALE_TAHSILAT') && parsedResult.records) {
    mergeResult = await archiveCollections(parsedResult.records);
    mockCollections = await loadAllCollections();
  } else if ((fileTypeKey === 'CEK' || fileTypeKey === 'SENET') && parsedResult.records) {
    mergeResult = await archiveCheques(parsedResult.records);
    mockCheques = await loadAllCheques();
    invalidateCache();
    notifyListeners();
  }

  addUploadLogEntry({
    fileType:   fileTypeKey,
    filename:   fileMeta.filename || 'bilinmiyor',
    filesize:   fileMeta.filesize || 0,
    uploadedAt: new Date().toISOString(),
    stats:      parsedResult.stats || {},
    mergeResult,
  });

  ensureCustomerMasterIntegrity();
  const matchResult = await autoMatchAndClearChequesAndSenets();
  invalidateCache();
  notifyListeners();

  const notificationSummary = {
    fileType: fileTypeKey,
    filename: fileMeta.filename || 'Excel Dosyası',
    added: mergeResult.added || 0,
    skippedDuplicate: mergeResult.skippedDuplicate || mergeResult.updated || 0,
    cancelledRemoved: mergeResult.cancelledRemoved || (parsedResult.stats?.cancelledRemoved || 0),
    totalRows: parsedResult.stats?.total || 0,
    matchedCount: matchResult.matchedCount || 0,
    matchedItems: matchResult.matchedItems || [],
    matchedTotalAmount: (matchResult.matchedItems || []).reduce((sum: number, item: any) => sum + (item.amount || 0), 0)
  };

  return { mergeResult, matchResult, notificationSummary };
}

export async function resetAndClearArchive() {
  if (!isAdminAuthenticated()) {
    throw new Error('🔒 Bu işlem yetki korumalıdır. Veritabanında ekleme, silme veya değişiklik yapmak için Admin Girişi yapılması gerekmektedir.');
  }
  await clearAllArchive();
  loadSeedData();
  invalidateCache();
  notifyListeners();
}

function trNormalize(str: any): string {
  if (!str) return '';
  return String(str)
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function searchCustomersSync(query = '', allowHidden = false): any[] {
  if (mockCustomers.length === 0) {
    loadSeedData();
  }
  const balanceMap = getBalanceMap();
  const chequesMap = getChequeMap();
  const q = trNormalize(query.trim());

  const { salesByCust, colsByCust, credsByCust } = buildMapsIfNeeded()!;

  const allWithBalance = mockCustomers.map((c) => {
    const cid = c.customerId;
    const bal = balanceMap[cid] || 0;
    const cs = chequesMap[cid] || 0;

    let averageVade: number | undefined;
    const result = {
      ...c,
      balance: bal,
      cekSenet: cs,
      toplamRisk: bal + cs,
    };
    
    Object.defineProperty(result, 'averageVade', {
      get() {
        if (averageVade !== undefined) return averageVade;
        if (bal <= 0) {
          averageVade = 0;
          return 0;
        }
        const aging = getAgingBuckets(salesByCust[cid] || [], colsByCust[cid] || [], credsByCust[cid] || []);
        averageVade = aging.averageVade || 0;
        return averageVade;
      },
      enumerable: true
    });

    return result;
  });

  const targetList = allowHidden
    ? allWithBalance
    : allWithBalance.filter((c) => !isCustomerHiddenFromList(c, c.balance));

  if (!q) {
    return targetList;
  }

  return targetList.filter((c) => {
    if (!normalizedSearchStrings[c.customerId]) {
      normalizedSearchStrings[c.customerId] = trNormalize(
        (c.customerId || '') + ' ' + 
        (c.customerName || '') + ' ' + 
        (c.signName || '') + ' ' + 
        (c.salesRepName || c.salesRep || '')
      );
    }
    const searchStr = normalizedSearchStrings[c.customerId] || '';
    if (searchStr.includes(q)) return true;

    const tokens = q.split(' ').filter(t => t.length > 2 && !['MARKET', 'BAKKAL', 'BUFE', 'LOKANTA', 'TEKEL', 'GIDA', 'TICARET', 'SHOP', 'CAFE', 'KAFE', 'RESTORAN', 'PUB', 'BAR'].includes(t));
    if (tokens.length > 0) {
      return tokens.every(tok => searchStr.includes(tok));
    }
    return false;
  });
}

export async function searchCustomers(query = '', allowHidden = false) {
  await ready();
  return searchCustomersSync(query, allowHidden);
}

export function getAllCustomersForReportingSync(): any[] {
  const balanceMap = getBalanceMap();
  const chequesMap = getChequeMap();
  return mockCustomers.map((c) => {
    const bal = balanceMap[c.customerId] || 0;
    const cs = chequesMap[c.customerId] || 0;
    return {
      ...c,
      balance: bal,
      cekSenet: cs,
      toplamRisk: bal + cs,
    };
  });
}

export async function getAllCustomersForReporting() {
  await ready();
  return getAllCustomersForReportingSync();
}

export function getGlobalFinancialSummarySync() {
  const balanceMap = getBalanceMap();
  
  const isVirmanOrDevir = (item: any) => {
    if (!item) return false;
    const str = `${item.type || ''} ${item.eDocumentNo || ''} ${item.description || ''}`;
    return str.includes('VIRMAN') || str.includes('Virman') || str.includes('DEVIR') || str.includes('Devir') || str.includes('DEVİR') || str.includes('ÖZEL_AKTARIM');
  };

  const totalSalesAmount = mockSalesInvoices
    .filter((inv) => !isVirmanOrDevir(inv))
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);
  
  const totalCollectionAmount = mockCollections
    .filter((col) => col.status === 'CREATED' && !isVirmanOrDevir(col))
    .reduce((sum, col) => sum + (col.amount || 0), 0);
    
  const totalCreditNoteAmount = mockCreditNotes
    .filter((cn) => cn.status === 'CREATED' && !isVirmanOrDevir(cn))
    .reduce((sum, cn) => sum + (cn.amount || 0), 0);

  const totalNetReceivables = Object.values(balanceMap).reduce((sum, bal) => sum + (bal > 0 ? bal : 0), 0);

  return {
    totalSales: totalSalesAmount,
    totalSalesAmount,
    totalCollections: totalCollectionAmount,
    totalCollectionAmount,
    totalCreditNotes: totalCreditNoteAmount,
    totalCreditNoteAmount,
    netReceivables: totalNetReceivables,
    totalNetReceivables,
    totalSalesInvoiceCount: mockSalesInvoices.length,
    totalCollectionCount: mockCollections.filter((col) => col.status === 'CREATED').length,
  };
}

export async function getGlobalFinancialSummary() {
  await ready();
  return getGlobalFinancialSummarySync();
}

export function getCurrentMonthMetricsSync() {
  if (mockCustomers.length === 0) {
    loadSeedData();
  }

  let latestYearMonth = new Date().toISOString().slice(0, 7);
  for (const inv of mockSalesInvoices) {
    if (inv.invoiceDate) {
      const ym = String(inv.invoiceDate).slice(0, 7);
      if (ym > latestYearMonth) latestYearMonth = ym;
    }
  }

  const isCurrentMonth = (dateStr: any) => String(dateStr || '').startsWith(latestYearMonth);

  const monthSales = mockSalesInvoices
    .filter(inv => isCurrentMonth(inv.invoiceDate))
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);

  const monthCollections = mockCollections
    .filter(col => col.status === 'CREATED' && isCurrentMonth(col.date))
    .reduce((sum, col) => sum + (col.amount || 0), 0);

  const monthCreditNotes = mockCreditNotes
    .filter(cn => cn.status === 'CREATED' && isCurrentMonth(cn.date))
    .reduce((sum, cn) => sum + (cn.amount || 0), 0);

  const monthCollectionRatio = monthSales > 0 ? Math.round((monthCollections / monthSales) * 100) : 0;

  const [y, m] = latestYearMonth.split('-');
  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const monthLabel = `${monthNames[parseInt(m, 10) - 1] || 'Bu Ay'} ${y}`;

  return {
    yearMonth: latestYearMonth,
    monthLabel,
    monthSales,
    monthCollections,
    monthCreditNotes,
    monthCollectionRatio,
  };
}

export function getPreviousMonthMetricsSync() {
  if (mockCustomers.length === 0) loadSeedData();

  const cur = getCurrentMonthMetricsSync();
  const [y, m] = cur.yearMonth.split('-').map(Number);
  
  let prevY = y;
  let prevM = m - 1;
  if (prevM < 1) {
    prevM = 12;
    prevY = y - 1;
  }

  const prevYearMonth = `${prevY}-${String(prevM).padStart(2, '0')}`;
  const isPrevMonth = (dateStr: any) => String(dateStr || '').startsWith(prevYearMonth);

  const prevSales = mockSalesInvoices
    .filter(inv => isPrevMonth(inv.invoiceDate))
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);

  const prevCollections = mockCollections
    .filter(col => col.status === 'CREATED' && isPrevMonth(col.date))
    .reduce((sum, col) => sum + (col.amount || 0), 0);

  const prevCreditNotes = mockCreditNotes
    .filter(cn => cn.status === 'CREATED' && isPrevMonth(cn.date))
    .reduce((sum, cn) => sum + (cn.amount || 0), 0);

  const prevCollectionRatio = prevSales > 0 ? Math.round((prevCollections / prevSales) * 100 * 10) / 10 : 0;

  const monthNames = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylul', 'Ekim', 'Kasım', 'Aralık'];
  const prevMonthLabel = `${monthNames[prevM] || 'Geçen Ay'} ${prevY}`;

  return {
    yearMonth: prevYearMonth,
    monthLabel: prevMonthLabel,
    monthSales: prevSales,
    monthCollections: prevCollections,
    monthCreditNotes: prevCreditNotes,
    monthCollectionRatio: prevCollectionRatio
  };
}

export function getCurrentMonthChartDataSync() {
  if (mockCustomers.length === 0) loadSeedData();
  const cur = getCurrentMonthMetricsSync();
  const curYM = cur.yearMonth;

  const curCols = mockCollections.filter(c => c.status === 'CREATED' && String(c.date || '').startsWith(curYM));

  let nakit = 0, havale = 0, kk = 0, hizmet = 0, iade = 0;

  for (const c of curCols) {
    const method = String(c.paymentMethod || c.method || c.type || '').toUpperCase();
    const amount = c.amount || 0;
    if (method.includes('NAKIT') || method.includes('NAKİT')) {
      nakit += amount;
    } else if (method.includes('HAVALE') || method.includes('EFT') || method.includes('BANKA')) {
      havale += amount;
    } else if (method.includes('KREDI') || method.includes('KREDİ') || method.includes('POS')) {
      kk += amount;
    } else if (method.includes('HIZMET') || method.includes('HİZMET')) {
      hizmet += amount;
    } else if (method.includes('IADE') || method.includes('İADE')) {
      iade += amount;
    } else {
      kk += amount;
    }
  }

  const curCreds = mockCreditNotes.filter(cn => cn.status === 'CREATED' && String(cn.date || '').startsWith(curYM));
  const credTotal = curCreds.reduce((sum, cn) => sum + (cn.amount || 0), 0);
  iade += credTotal;

  const tahsilatData = [
    { name: 'Nakit', value: nakit, color: '#10B981' },
    { name: 'Havale', value: havale, color: '#3B82F6' },
    { name: 'Kredi Kartı', value: kk, color: '#8B5CF6' },
    { name: 'Hizmet Fat.', value: hizmet, color: '#D97706' },
    { name: 'İade Fat.', value: iade, color: '#065F46' },
  ].filter(d => d.value > 0);

  return {
    monthLabel: cur.monthLabel,
    monthSales: cur.monthSales,
    monthCollections: cur.monthCollections,
    tahsilatData,
    nakit,
    havale,
    kk,
    hizmet,
    iade
  };
}

export function getAdvancedExecutiveInsightsSync() {
  if (advancedInsightsCache) return advancedInsightsCache;
  if (mockCustomers.length === 0) {
    loadSeedData();
  }

  const balanceMap = getBalanceMap();
  const insights: any[] = [];

  const { salesByCust, colsByCust } = buildMapsIfNeeded()!;

  let latestDate = new Date();
  for (const inv of mockSalesInvoices) {
    if (inv.invoiceDate) {
      const d = new Date(inv.invoiceDate);
      if (d > latestDate) latestDate = d;
    }
  }

  for (const cust of mockCustomers) {
    const cid = cust.customerId;
    const custName = cust.signName || cust.customerName;
    const balance = balanceMap[cid] || 0;
    const sales = salesByCust[cid] || [];
    const cols = colsByCust[cid] || [];

    if (balance > 1000) {
      const timeline: any[] = [];
      for (const s of sales) {
        const typeStr = String(s.type || '').toUpperCase();
        if (typeStr.includes('DEVIR_ALACAK') || typeStr.includes('VIRMAN_ALACAK')) {
          timeline.push({ type: 'PAYMENT', dateObj: new Date(s.invoiceDate), amount: s.amount });
        } else {
          timeline.push({ type: 'SALE', dateObj: new Date(s.invoiceDate), amount: s.amount });
        }
      }
      for (const c of cols) {
        const typeStr = String(c.type || '').toUpperCase();
        const docStr = String(c.eDocumentNo || '').toUpperCase();
        const descStr = String(c.description || '').toUpperCase();
        if (typeStr.includes('DEVIR_BORC') || typeStr.includes('VIRMAN_BORC') || typeStr === 'DEVIR' || typeStr === 'VIRMAN' || docStr.includes('ÖZEL_AKTARIM') || descStr.includes('DEVİR')) {
          timeline.push({ type: 'SALE', dateObj: new Date(c.date), amount: c.amount });
        } else {
          timeline.push({ type: 'PAYMENT', dateObj: new Date(c.date), amount: c.amount });
        }
      }

      timeline.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());

      let consecutiveCount = 0;
      let chainTotalAmount = 0;
      let oldestDateObj: Date | null = null;
      let newestDateObj: Date | null = null;

      for (const event of timeline) {
        if (event.type === 'PAYMENT') {
          break;
        } else {
          consecutiveCount++;
          chainTotalAmount += (event.amount || 0);
          if (!newestDateObj) newestDateObj = event.dateObj;
          oldestDateObj = event.dateObj;
        }
      }

      if (consecutiveCount >= 2 && newestDateObj && oldestDateObj) {
        const daysDiff = Math.max(0, Math.round((newestDateObj.getTime() - oldestDateObj.getTime()) / (1000 * 60 * 60 * 24)));
        const oldestDaysAgo = Math.max(0, Math.floor((latestDate.getTime() - oldestDateObj.getTime()) / (1000 * 60 * 60 * 24)));
        const repName = cust.salesRepName || cust.salesRep || 'Key Account';

        insights.push({
          type: 'CONSECUTIVE_UNPAID_INVOICES',
          customerId: cid,
          customerName: custName,
          salesRepName: repName,
          balance,
          consecutiveCount,
          daysDiff,
          daysAgo: oldestDaysAgo,
          chainTotalAmount,
          text: `⚠️ **Tahsilatsız Fatura Uyarısı [Plasiyer: ${repName}]:** **${custName}** firmasından peş peşe **${consecutiveCount} fatura** için tahsilat alınmadı! (${daysDiff > 0 ? `${daysDiff} günlük süreçte` : 'aynı gün'}, en eskisi ${oldestDaysAgo} gün önce, Tutar: **${formatCurrency(chainTotalAmount)}**)`
        });
      }
    }
  }

  advancedInsightsCache = insights;
  return insights;
}

export function getMonthlySalesRepPerformanceSync() {
  if (repPerfCache) return repPerfCache;
  if (mockCustomers.length === 0) {
    loadSeedData();
  }

  const monthMetrics = getCurrentMonthMetricsSync();
  const ym = monthMetrics.yearMonth;
  const balanceMap = getBalanceMap();

  const repMap: Record<string, any> = {};
  const custToRep: Record<string, string> = {};

  for (const c of mockCustomers) {
    const rep = c.salesRepName || c.salesRep || 'Key Account';
    custToRep[c.customerId] = rep;
    if (!repMap[rep]) {
      repMap[rep] = {
        repName: rep,
        customerCount: 0,
        monthSales: 0,
        monthCollections: 0,
        totalNetReceivables: 0,
        riskyCustomerCount: 0,
        customers: [],
      };
    }
    repMap[rep].customerCount += 1;
    const bal = balanceMap[c.customerId] || 0;
    if (bal > 0) {
      repMap[rep].totalNetReceivables += bal;
      if (bal > 15000) {
        repMap[rep].riskyCustomerCount += 1;
      }
    }
    repMap[rep].customers.push({
      customerId: c.customerId,
      customerName: c.signName || c.customerName,
      balance: bal,
    });
  }

  for (const inv of mockSalesInvoices) {
    if (inv.invoiceDate && String(inv.invoiceDate).startsWith(ym)) {
      const rep = custToRep[inv.customerId] || 'Key Account';
      if (!repMap[rep]) {
        repMap[rep] = { repName: rep, customerCount: 0, monthSales: 0, monthCollections: 0, totalNetReceivables: 0, riskyCustomerCount: 0, customers: [] };
      }
      repMap[rep].monthSales += (inv.amount || 0);
    }
  }

  for (const col of mockCollections) {
    if (col.status === 'CREATED' && col.date && String(col.date).startsWith(ym)) {
      const rep = custToRep[col.customerId] || 'Key Account';
      if (!repMap[rep]) {
        repMap[rep] = { repName: rep, customerCount: 0, monthSales: 0, monthCollections: 0, totalNetReceivables: 0, riskyCustomerCount: 0, customers: [] };
      }
      repMap[rep].monthCollections += (col.amount || 0);
    }
  }

  const repList = Object.values(repMap).sort((a: any, b: any) => (b.monthSales || b.totalNetReceivables) - (a.monthSales || a.totalNetReceivables));

  repPerfCache = {
    monthLabel: monthMetrics.monthLabel,
    repList,
  };
  return repPerfCache;
}

export function getHistoricalSalesRepPerformanceSync() {
  const currentMonthly = getMonthlySalesRepPerformanceSync();
  const repList = (currentMonthly.repList || []).map((rep: any) => ({
    ...rep,
    salesGrowthPct: 15,
    compareLabel: 'Geçen Ay',
    targetSales: rep.monthSales || 0,
  }));

  return {
    compareLabel: 'Geçen Ay',
    repList,
  };
}

export function getCurrentStatusSync() {
  const balanceMap = getBalanceMap();
  const owingCustomers = new Set(
    Object.entries(balanceMap).filter(([, bal]) => bal > 0).map(([cid]) => cid)
  );
  const openInvoiceCount = mockSalesInvoices.filter((inv) =>
    owingCustomers.has(inv.customerId)
  ).length;

  const today = new Date().toISOString().slice(0, 10);
  const isToday = (d: any) => String(d || '').slice(0, 10) === today;

  const todayCollections =
    mockCollections
      .filter((c) => c.status === 'CREATED' && isToday(c.date))
      .reduce((s, c) => s + (c.amount || 0), 0) +
    mockCreditNotes
      .filter((cn) => cn.status === 'CREATED' && isToday(cn.date))
      .reduce((s, cn) => s + (cn.amount || 0), 0);

  const portfolioAverageTerm = getAverageTermForCustomersSync(mockCustomers);

  return { 
    openInvoiceCount, 
    openInvoicesCount: openInvoiceCount, 
    todayCollections, 
    portfolioAverageTerm, 
    averageTermDays: portfolioAverageTerm 
  };
}

export function getAverageTermForCustomersSync(customerList: any[]) {
  const balanceMap = getBalanceMap();
  const byCustomer = (rows: any[], onlyCreated: boolean) => {
    const map = new Map<string, any[]>();
    for (const r of rows) {
      if (onlyCreated && r.status !== 'CREATED') continue;
      let list = map.get(r.customerId);
      if (!list) { list = []; map.set(r.customerId, list); }
      list.push(r);
    }
    return map;
  };

  const salesBy   = byCustomer(mockSalesInvoices, false);
  const colsBy    = byCustomer(mockCollections, true);
  const creditsBy = byCustomer(mockCreditNotes, true);

  let weightedDays = 0;
  let unpaidTotal = 0;
  for (const cust of customerList) {
    const cid = cust.customerId;
    const bal = balanceMap[cid] || 0;
    if (bal <= 0) continue;
    const aging = getAgingBuckets(
      salesBy.get(cid) || [],
      colsBy.get(cid) || [],
      creditsBy.get(cid) || []
    );
    weightedDays += (aging.averageVade || 0) * bal;
    unpaidTotal += bal;
  }
  return unpaidTotal > 0 ? Math.round(weightedDays / unpaidTotal) : 0;
}

export async function getCurrentStatus() {
  await ready();
  return getCurrentStatusSync();
}

export function getActiveCustomerCountSync() {
  return mockCustomers.filter((c) => !isPassiveOrCanceledStatus(c.customerStatus)).length;
}

export async function getActiveCustomerCount() {
  await ready();
  return getActiveCustomerCountSync();
}

export function getDashboardChartDataSync() {
  let vade = { current: 0, days30: 0, days60: 0, over60: 0 };
  let risk = { low: 0, medium: 0, high: 0 };
  let riskCount = { low: 0, medium: 0, high: 0 };
  const tahsilat = { nakit: 0, havale: 0, krediKarti: 0, hizmet: 0, iade: 0 };

  for (const c of mockCollections) {
    if (c.status !== 'CREATED') continue;
    const amt = c.amount || 0;
    switch (c.method) {
      case 'NAKİT':
      case 'NAKIT':
        tahsilat.nakit += amt;
        break;
      case 'KREDİ_KARTI':
      case 'KREDI_KARTI':
        tahsilat.krediKarti += amt;
        break;
      case 'HAVALE':
        tahsilat.havale += amt;
        break;
      default:
        tahsilat.havale += amt;
    }
  }

  for (const cn of mockCreditNotes) {
    if (cn.status !== 'CREATED') continue;
    const amt = cn.amount || 0;
    if (cn.type === 'HIZMET_FATURASI') tahsilat.hizmet += amt;
    else tahsilat.iade += amt;
  }

  const { salesByCust, colsByCust, credsByCust } = buildMapsIfNeeded()!;
  const balanceMap = getBalanceMap();

  for (const cust of mockCustomers) {
    const cid = cust.customerId;
    const balance = balanceMap[cid] || 0;
    
    if (balance > 30000) {
      risk.high += balance;
      riskCount.high++;
    } else if (balance > 10000) {
      risk.medium += balance;
      riskCount.medium++;
    } else if (balance > 0) {
      risk.low += balance;
      riskCount.low++;
    }

    if (balance > 0) {
      const buckets = getAgingBuckets(salesByCust[cid] || [], colsByCust[cid] || [], credsByCust[cid] || []);
      const bSum = buckets.current + buckets.days30 + buckets.days60 + buckets.days90 + buckets.over90;
      if (bSum > 0) {
        const ratio = balance / bSum;
        vade.current += buckets.current * ratio;
        vade.days30  += buckets.days30  * ratio;
        vade.days60  += buckets.days60  * ratio;
        vade.over60  += (buckets.days90 + buckets.over90) * ratio;
      } else {
        vade.current += balance;
      }
    }
  }

  return {
    vadeData: [
      { name: '0-30 Gün',  value: vade.current, color: '#3C7A56' },
      { name: '31-60 Gün', value: vade.days30, color: '#B8862E' },
      { name: '60+ Gün',   value: vade.days60 + vade.over60, color: '#B23A2C' },
    ],
    riskData: [
      { name: 'Düşük (0-10k ₺)',  value: risk.low, count: riskCount.low, color: '#3b82f6' },
      { name: 'Orta (10-30k ₺)',  value: risk.medium, count: riskCount.medium, color: '#6366f1' },
      { name: 'Yüksek (30k+ ₺)', value: risk.high, count: riskCount.high, color: '#B23A2C' },
    ],
    tahsilatData: [
      { name: 'Nakit',       value: tahsilat.nakit,      color: '#3C7A56' },
      { name: 'Havale',      value: tahsilat.havale,     color: '#3b82f6' },
      { name: 'Kredi Kartı', value: tahsilat.krediKarti, color: '#7c3aed' },
      { name: 'Hizmet Fat.', value: tahsilat.hizmet,     color: '#B8862E' },
      { name: 'İade Fat.',   value: tahsilat.iade,       color: '#0f766e' },
    ].filter((d) => d.value > 0),
  };
}

export async function getDashboardChartData() {
  await ready();
  return getDashboardChartDataSync();
}

export async function getCustomerById(customerId: string, allowHidden = false) {
  await ready();
  const customer = mockCustomers.find((c) => c.customerId === customerId);
  if (!customer) return null;
  const balanceMap = getBalanceMap();
  const balance = balanceMap[customerId] || 0;

  if (!allowHidden && isCustomerHiddenFromList(customer, balance)) {
    return null;
  }

  return { ...customer, balance };
}

export function getCustomerStatementSync(customerId: string) {
  if (!customerId) return null;

  let targetId = customerId;
  let customerObj = mockCustomers.find(c => c.customerId === targetId) || null;

  if (!customerObj && !/^\d{10}$/.test(String(customerId))) {
    const cleanedQuery = String(customerId)
      .replace(/(ekstresini|ekstresi|eksttre|ekstre|ekst|pdf|excel|ver|yazdır|indir|çıkar|döküm|göster|lütfen|arası|arasındaki|tarihli|tarihleri|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık|\d{1,4})/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const matched = searchCustomersSync(cleanedQuery || String(customerId), true);
    if (matched.length > 0) {
      targetId = matched[0].customerId;
      customerObj = matched[0];
    }
  }

  if (statementCache[targetId]) return statementCache[targetId];

  const sales = mockSalesInvoices.filter((s) => s.customerId === targetId);
  const collections = mockCollections.filter((c) => c.customerId === targetId && c.status === 'CREATED');
  const creditNotes = mockCreditNotes.filter((cn) => cn.customerId === targetId && cn.status === 'CREATED');

  const balance = calculateBalance(sales, collections, creditNotes);
  const collectionEvents = getAllCollectionEvents(collections, creditNotes);

  const aging = getAgingBuckets(sales, collections, creditNotes);
  const openInvoices = getOpenInvoices(sales, collections, creditNotes);

  const transactions: any[] = [];

  for (const s of sales) {
    if (s.status === 'CANCELLED') continue;

    transactions.push({
      id: s.invoiceId || s.id || `sal-${Math.random()}`,
      date: safeIsoDate(s.invoiceDate) || s.invoiceDate || '2026-01-01',
      type: s.type || 'SATIŞ',
      docNo: s.eDocumentNo || '-',
      debit: s.amount || 0,
      credit: 0,
      description: s.description || 'Satış Faturası',
    });
  }

  for (const col of collectionEvents) {
    if (col.status === 'CANCELLED') continue;

    const method = col.paymentMethod ? String(col.paymentMethod).toUpperCase() : 'Nakit / Banka';

    transactions.push({
      id: col.collectionId || col.creditNoteId || col.id || `col-${Math.random()}`,
      date: safeIsoDate(col.date) || col.date || '2026-01-01',
      type: col.type || (col.creditNoteId ? 'HİZMET İADE' : `TAHSİLAT (${method})`),
      docNo: col.eDocumentNo || '-',
      debit: 0,
      credit: col.amount || 0,
      description: col.description || (col.creditNoteId ? 'İade İskonto Dekontu' : `Tahsilat Kaydı (${method})`),
    });
  }

  transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let runningBalance = 0;
  const statementRows = transactions.map((t, idx) => {
    runningBalance += (t.debit || 0) - (t.credit || 0);
    return { ...t, balance: runningBalance, _originalIndex: idx };
  });

  const totalSales = sales.reduce((s, inv) => s + (inv.amount || 0), 0);
  const totalCollections = collections.reduce((s, col) => s + (col.amount || 0), 0);
  const totalCreditNotes = creditNotes.reduce((s, cn) => s + (cn.amount || 0), 0);

  const statementResult = {
    customer: customerObj ? {
      customerId: customerObj.customerId,
      customerName: customerObj.customerName,
      signName: customerObj.signName || customerObj.customerName,
      salesRep: customerObj.salesRepName || customerObj.salesRep || 'Key Account',
      balance: balance
    } : { customerId: targetId, customerName: targetId, balance },
    balance,
    aging,
    openInvoices,
    summary: {
      totalSales,
      totalCollections,
      totalCreditNotes,
      averageTermDays: aging ? (aging.averageVade || 0) : 0
    },
    salesCount: sales.length,
    collectionsCount: collectionEvents.length,
    transactions: statementRows,
  };

  statementCache[customerId] = statementResult;
  return statementResult;
}

export async function getCustomerStatement(customerId: string) {
  await ready();
  return getCustomerStatementSync(customerId);
}

export async function addManualInvoice({ customerId, invoiceDate, amount, eDocumentNo, description }: any) {
  await ready();
  if (!isAdminAuthenticated()) {
    throw new Error('🔒 Bu işlem yetki korumalıdır. Veritabanında ekleme, silme veya değişiklik yapmak için Admin Girişi yapılması gerekmektedir.');
  }
  const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/\./g, '').replace(',', '.')) || 0;
  if (!customerId || numAmount <= 0) {
    throw new Error('Geçersiz müşteri veya fatura tutarı');
  }

  const docNo = eDocumentNo || `FAT-MAN-${Date.now().toString().slice(-6)}`;
  const record = {
    invoiceId: docNo,
    customerId,
    invoiceDate: safeIsoDate(invoiceDate || new Date()),
    amount: numAmount,
    eDocumentNo: docNo,
    status: 'CREATED',
    description: description || 'Manuel Satış Faturası'
  };

  mockSalesInvoices.push(record);
  await archiveSalesInvoices([record]);
  usingSeedData = false;
  invalidateCache();
  notifyListeners();
  return record;
}

export async function addManualCollection({ customerId, date, amount, method = 'NAKİT', eDocumentNo, description }: any) {
  await ready();
  if (!isAdminAuthenticated()) {
    throw new Error('🔒 Bu işlem yetki korumalıdır. Veritabanında ekleme, silme veya değişiklik yapmak için Admin Girişi yapılması gerekmektedir.');
  }
  const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/\./g, '').replace(',', '.')) || 0;
  if (!customerId || numAmount <= 0) {
    throw new Error('Geçersiz müşteri veya tahsilat tutarı');
  }

  const docNo = eDocumentNo || `TAH-MAN-${Date.now().toString().slice(-6)}`;
  const record = {
    collectionId: docNo,
    customerId,
    date: safeIsoDate(date || new Date()),
    amount: numAmount,
    method: method || 'NAKİT',
    eDocumentNo: docNo,
    status: 'CREATED',
    description: description || 'Manuel Tahsilat İşlemi'
  };

  mockCollections.push(record);
  await archiveCollections([record]);
  usingSeedData = false;
  invalidateCache();
  notifyListeners();
  return record;
}

export async function addVirmanTransfer({ sourceCustomerId, targetCustomerId, date, amount, description }: any) {
  await ready();
  if (!isAdminAuthenticated()) {
    throw new Error('🔒 Bu işlem yetki korumalıdır. Veritabanında ekleme, silme veya değişiklik yapmak için Admin Girişi yapılması gerekmektedir.');
  }
  const numAmount = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/\./g, '').replace(',', '.')) || 0;
  if (!sourceCustomerId || !targetCustomerId || sourceCustomerId === targetCustomerId || numAmount <= 0) {
    throw new Error('Geçersiz virman kaynak/hedef müşterisi veya tutarı');
  }

  const vDocNo = `VRM-${Date.now().toString().slice(-6)}`;
  const vDate = safeIsoDate(date || new Date());

  const sourceCust = mockCustomers.find(c => c.customerId === sourceCustomerId);
  const targetCust = mockCustomers.find(c => c.customerId === targetCustomerId);

  const sourceName = sourceCust ? (sourceCust.signName || sourceCust.customerName) : sourceCustomerId;
  const targetName = targetCust ? (targetCust.signName || targetCust.customerName) : targetCustomerId;

  const creditNote = {
    creditNoteId: `CN-${vDocNo}`,
    customerId: sourceCustomerId,
    date: vDate,
    amount: numAmount,
    type: 'VIRMAN_AKTARIM',
    eDocumentNo: vDocNo,
    status: 'CREATED',
    description: description || `Virman Aktarımı: -> ${targetName}`
  };

  const invoice = {
    invoiceId: `INV-${vDocNo}`,
    customerId: targetCustomerId,
    invoiceDate: vDate,
    amount: numAmount,
    eDocumentNo: vDocNo,
    status: 'CREATED',
    description: description || `Virman Aktarımı: <- ${sourceName}`
  };

  mockCreditNotes.push(creditNote);
  mockSalesInvoices.push(invoice);

  await archiveCreditNotes([creditNote]);
  await archiveSalesInvoices([invoice]);

  usingSeedData = false;
  invalidateCache();
  notifyListeners();

  return { virmanDocNo: vDocNo, creditNote, invoice };
}

export async function deleteTransactionRecord({ id, type, customerId }: any) {
  await ready();
  if (!isAdminAuthenticated()) {
    throw new Error('🔒 Bu işlem yetki korumalıdır. Veritabanında ekleme, silme veya değişiklik yapmak için Admin Girişi yapılması gerekmektedir.');
  }
  if (!id) throw new Error('Silinecek işlem ID belirtilmedi');

  const strType = String(type || '').toUpperCase();

  if (strType.includes('SATIŞ') || strType.includes('FATURA')) {
    mockSalesInvoices = mockSalesInvoices.filter(s => s.invoiceId !== id);
    await deleteSalesInvoiceRecord(id);
  } else if (strType.includes('TAHSİLAT')) {
    mockCollections = mockCollections.filter(c => c.collectionId !== id);
    await deleteCollectionRecord(id);
  } else if (strType.includes('DEKONT') || strType.includes('VİRMAN') || strType.includes('İADE')) {
    mockCreditNotes = mockCreditNotes.filter(cn => cn.creditNoteId !== id);
    await deleteCreditNoteRecord(id);
    if (id.startsWith('CN-VRM-')) {
      const invTwinId = id.replace('CN-VRM-', 'INV-VRM-');
      mockSalesInvoices = mockSalesInvoices.filter(s => s.invoiceId !== invTwinId);
      await deleteSalesInvoiceRecord(invTwinId);
    } else if (id.startsWith('INV-VRM-')) {
      const cnTwinId = id.replace('INV-VRM-', 'CN-VRM-');
      mockCreditNotes = mockCreditNotes.filter(cn => cn.creditNoteId !== cnTwinId);
      await deleteCreditNoteRecord(cnTwinId);
    }
  } else {
    mockSalesInvoices = mockSalesInvoices.filter(s => s.invoiceId !== id);
    mockCollections = mockCollections.filter(c => c.collectionId !== id);
    mockCreditNotes = mockCreditNotes.filter(cn => cn.creditNoteId !== id);
    await Promise.all([
      deleteSalesInvoiceRecord(id),
      deleteCollectionRecord(id),
      deleteCreditNoteRecord(id)
    ]);
  }

  invalidateCache();
  notifyListeners();
  return { success: true, deletedId: id };
}

export async function bulkDeleteTransactions({ year, customerId, type }: any) {
  await ready();
  const strType = String(type || 'TUMU').toUpperCase();
  let deletedCount = 0;

  const shouldDelete = (dateStr: any, cId: any) => {
    if (customerId && cId !== customerId) return false;
    if (year) {
      if (!dateStr || !dateStr.includes(String(year))) return false;
    }
    return true;
  };

  const deleteFromList = async (list: any[], typeStr: string, idField: string, dateField: string, deleteRecordFn: (id: string) => Promise<void>) => {
    const toDelete = list.filter(item => shouldDelete(item[dateField], item.customerId));
    for (const item of toDelete) {
      await deleteRecordFn(item[idField]);
      deletedCount++;
    }
    return list.filter(item => !toDelete.includes(item));
  };

  if (strType === 'TUMU' || strType === 'SATIS' || strType === 'FATURA') {
    mockSalesInvoices = await deleteFromList(mockSalesInvoices, 'SATIS', 'invoiceId', 'invoiceDate', deleteSalesInvoiceRecord);
  }
  if (strType === 'TUMU' || strType === 'TAHSILAT') {
    mockCollections = await deleteFromList(mockCollections, 'TAHSILAT', 'collectionId', 'date', deleteCollectionRecord);
  }
  if (strType === 'TUMU' || strType === 'CEK' || strType === 'SENET') {
    mockCheques = await deleteFromList(mockCheques, 'CEK', 'id', 'issueDate', deleteChequeRecord);
  }
  if (strType === 'TUMU' || strType === 'IADE' || strType === 'VIRMAN' || strType === 'DEKONT') {
    mockCreditNotes = await deleteFromList(mockCreditNotes, 'IADE', 'creditNoteId', 'date', deleteCreditNoteRecord);
  }

  if (deletedCount > 0) {
    invalidateCache();
    notifyListeners();
  }

  return { success: true, deletedCount };
}

export async function purgeTestImportRecords() {
  await ready();
  let deletedCount = 0;

  const isTestRecord = (item: any) => {
    if (!item) return false;
    const str = `${item.eDocumentNo || ''} ${item.docNo || ''} ${item.documentNo || ''} ${item.invoiceId || ''} ${item.collectionId || ''} ${item.creditNoteId || ''} ${item.id || ''} ${item.description || ''}`;
    return str.includes('ADV_AI') || str.includes('ÖZEL_AKTARIM') || str.includes('MANUAL-EXCEL') || str.includes('ADV-EXC');
  };

  const purgeList = async (list: any[], idField: string, deleteFn: (id: string) => Promise<void>) => {
    const toDelete = list.filter(isTestRecord);
    for (const item of toDelete) {
      await deleteFn(item[idField]);
      deletedCount++;
    }
  };

  await purgeList(mockSalesInvoices, 'invoiceId', deleteSalesInvoiceRecord);
  await purgeList(mockCollections, 'collectionId', deleteCollectionRecord);
  await purgeList(mockCreditNotes, 'creditNoteId', deleteCreditNoteRecord);
  await purgeList(mockCheques, 'id', deleteChequeRecord);

  if (deletedCount > 0) {
    invalidateCache();
    notifyListeners();
  }

  return { success: true, deletedCount };
}

export function getGlobalHighestTransactionsSync({ type = 'TAHSILAT', limit = 5 }: any = {}) {
  const custMap: Record<string, any> = {};
  for (const c of mockCustomers) {
    custMap[c.customerId] = c;
  }

  const strType = String(type || 'TAHSILAT').toUpperCase();

  if (strType === 'TAHSILAT' || strType === 'COLLECTION' || strType === 'HAVALE') {
    const sorted = [...mockCollections].sort((a, b) => (b.amount || 0) - (a.amount || 0));
    return sorted.slice(0, limit).map((col, idx) => {
      const cust = custMap[col.customerId] || {};
      return {
        rank: idx + 1,
        collectionId: col.collectionId,
        customerId: col.customerId,
        customerName: cust.customerName || `Cari (${col.customerId})`,
        signName: cust.signName || cust.customerName || `Cari (${col.customerId})`,
        salesRep: cust.salesRepName || 'Key Account',
        amount: col.amount,
        formattedAmount: formatCurrency(col.amount),
        method: col.method || 'Bilinmiyor',
        date: col.date,
        formattedDate: formatDate(col.date)
      };
    });
  } else if (strType === 'SATIS' || strType === 'SALE' || strType === 'FATURA') {
    const sorted = [...mockSalesInvoices].sort((a, b) => (b.amount || 0) - (a.amount || 0));
    return sorted.slice(0, limit).map((inv, idx) => {
      const cust = custMap[inv.customerId] || {};
      return {
        rank: idx + 1,
        invoiceId: inv.invoiceId,
        eDocumentNo: inv.eDocumentNo || inv.invoiceId,
        customerId: inv.customerId,
        customerName: cust.customerName || `Cari (${inv.customerId})`,
        signName: cust.signName || cust.customerName || `Cari (${inv.customerId})`,
        salesRep: cust.salesRepName || 'Key Account',
        amount: inv.amount,
        formattedAmount: formatCurrency(inv.amount),
        date: inv.invoiceDate,
        formattedDate: formatDate(inv.invoiceDate)
      };
    });
  }

  return [];
}

function parseMonthNumber(str: any): number | null {
  if (!str) return null;
  const s = String(str).trim().toLowerCase();
  if (s.includes('ocak') || s === '1' || s === '01') return 1;
  if (s.includes('şubat') || s.includes('subat') || s === '2' || s === '02') return 2;
  if (s.includes('mart') || s === '3' || s === '03') return 3;
  if (s.includes('nisan') || s === '4' || s === '04') return 4;
  if (s.includes('mayıs') || s.includes('mayis') || s === '5' || s === '05') return 5;
  if (s.includes('haziran') || s === '6' || s === '06') return 6;
  if (s.includes('temmuz') || s === '7' || s === '07') return 7;
  if (s.includes('ağustos') || s.includes('agustos') || s === '8' || s === '08') return 8;
  if (s.includes('eylül') || s.includes('eylul') || s === '9' || s === '09') return 9;
  if (s.includes('ekim') || s === '10') return 10;
  if (s.includes('kasım') || s.includes('kasim') || s === '11') return 11;
  if (s.includes('aralık') || s.includes('aralik') || s === '12') return 12;
  return null;
}

export function getMonthlyComparisonSync({ query, period1 = 'Nisan', period2 = 'Mayıs' }: any = {}) {
  let targetCustomerId: string | null = null;
  let targetCustomerName = 'Tüm Veritabanı (Genel Şirket Toplamı)';

  if (query && query.trim()) {
    const matches = searchCustomersSync(query, true);
    if (matches.length > 0) {
      targetCustomerId = matches[0].customerId;
      targetCustomerName = matches[0].customerName;
    }
  }

  const m1 = parseMonthNumber(period1) || 4;
  const m2 = parseMonthNumber(period2) || 5;

  const getMonthIndex = (dStr: any) => {
    if (!dStr) return 0;
    const parts = String(dStr).slice(0, 10).split('-');
    return parts.length >= 2 ? parseInt(parts[1], 10) : 0;
  };

  const filterCust = (list: any[]) => {
    if (!targetCustomerId) return list;
    return list.filter((item) => item.customerId === targetCustomerId);
  };

  const sales = filterCust(mockSalesInvoices);
  const cols = filterCust(mockCollections.filter(c => c.status === 'CREATED'));
  const credits = filterCust(mockCreditNotes.filter(cn => cn.status === 'CREATED'));

  const p1Data = { sales: 0, collections: 0, credits: 0, salesCount: 0, colCount: 0 };
  const p2Data = { sales: 0, collections: 0, credits: 0, salesCount: 0, colCount: 0 };

  for (const s of sales) {
    const month = getMonthIndex(s.invoiceDate || s.date);
    if (month === m1) { p1Data.sales += (s.amount || 0); p1Data.salesCount++; }
    if (month === m2) { p2Data.sales += (s.amount || 0); p2Data.salesCount++; }
  }

  for (const c of cols) {
    const month = getMonthIndex(c.date);
    if (month === m1) { p1Data.collections += (c.amount || 0); p1Data.colCount++; }
    if (month === m2) { p2Data.collections += (c.amount || 0); p2Data.colCount++; }
  }

  for (const cn of credits) {
    const month = getMonthIndex(cn.date);
    if (month === m1) { p1Data.credits += (cn.amount || 0); }
    if (month === m2) { p2Data.credits += (cn.amount || 0); }
  }

  const MONTH_NAMES = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylul', 'Ekim', 'Kasım', 'Aralık'];
  const name1 = MONTH_NAMES[m1] || period1;
  const name2 = MONTH_NAMES[m2] || period2;

  const salesDiff = p2Data.sales - p1Data.sales;
  const colDiff = p2Data.collections - p1Data.collections;

  return {
    customerName: targetCustomerName,
    period1: {
      name: name1,
      sales: formatCurrency(p1Data.sales),
      collections: formatCurrency(p1Data.collections),
      credits: formatCurrency(p1Data.credits),
      salesCount: p1Data.salesCount,
      collectionsCount: p1Data.colCount,
      rawSales: p1Data.sales,
      rawCollections: p1Data.collections
    },
    period2: {
      name: name2,
      sales: formatCurrency(p2Data.sales),
      collections: formatCurrency(p2Data.collections),
      credits: formatCurrency(p2Data.credits),
      salesCount: p2Data.salesCount,
      collectionsCount: p2Data.colCount,
      rawSales: p2Data.sales,
      rawCollections: p2Data.collections
    },
    comparison: {
      salesDifference: formatCurrency(salesDiff),
      salesGrowthPercent: p1Data.sales > 0 ? `${(((salesDiff) / p1Data.sales) * 100).toFixed(1)}%` : 'N/A',
      collectionsDifference: formatCurrency(colDiff),
      collectionsGrowthPercent: p1Data.collections > 0 ? `${(((colDiff) / p1Data.collections) * 100).toFixed(1)}%` : 'N/A'
    }
  };
}

export function getMonthlyRiskAndRevenueReportSync({ year, month, query }: any = {}) {
  if (mockCustomers.length === 0) {
    loadSeedData();
  }

  let targetCustomers = mockCustomers;
  let filterLabel = 'Tüm Şirket (Genel)';

  if (query && query.trim()) {
    targetCustomers = searchCustomersSync(query, true);
    if (targetCustomers.length > 0) {
      filterLabel = targetCustomers[0].signName || targetCustomers[0].customerName;
    }
  }

  const custIds = new Set(targetCustomers.map(c => c.customerId));

  const mNum = parseMonthNumber(month) || (new Date().getMonth() + 1);
  const yNum = parseInt(year, 10) || 2026;
  const ymStr = `${yNum}-${String(mNum).padStart(2, '0')}`;

  const monthNames = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const monthLabel = `${monthNames[mNum] || month} ${yNum}`;

  let monthSales = 0;
  let monthSalesCount = 0;
  let monthCollections = 0;
  let monthCollectionCount = 0;
  let monthCreditNotes = 0;

  for (const inv of mockSalesInvoices) {
    if (custIds.has(inv.customerId) && inv.invoiceDate && String(inv.invoiceDate).startsWith(ymStr)) {
      monthSales += (inv.amount || 0);
      monthSalesCount++;
    }
  }

  for (const col of mockCollections) {
    if (col.status === 'CREATED' && custIds.has(col.customerId) && col.date && String(col.date).startsWith(ymStr)) {
      monthCollections += (col.amount || 0);
      monthCollectionCount++;
    }
  }

  for (const cn of mockCreditNotes) {
    if (cn.status === 'CREATED' && custIds.has(cn.customerId) && cn.date && String(cn.date).startsWith(ymStr)) {
      monthCreditNotes += (cn.amount || 0);
    }
  }

  const balanceMap = getBalanceMap();
  let totalNetReceivables = 0;
  const riskyCustomers: any[] = [];

  for (const cust of targetCustomers) {
    const bal = balanceMap[cust.customerId] || 0;
    if (bal > 0) {
      totalNetReceivables += bal;
      if (bal > 15000) {
        riskyCustomers.push({
          customerId: cust.customerId,
          customerName: cust.signName || cust.customerName,
          salesRep: cust.salesRepName || 'Key Account',
          balance: bal,
          formattedBalance: formatCurrency(bal),
        });
      }
    }
  }

  const collectionRatio = monthSales > 0 ? Math.round((monthCollections / monthSales) * 100) : 0;
  const netMonthAccrual = monthSales - monthCollections - monthCreditNotes;

  return {
    monthLabel,
    filterLabel,
    monthSales,
    formattedMonthSales: formatCurrency(monthSales),
    monthSalesCount,
    monthCollections,
    formattedMonthCollections: formatCurrency(monthCollections),
    monthCollectionCount,
    monthCreditNotes,
    formattedMonthCreditNotes: formatCurrency(monthCreditNotes),
    collectionRatio: `%${collectionRatio}`,
    netMonthAccrual,
    formattedNetMonthAccrual: formatCurrency(netMonthAccrual),
    totalNetReceivables,
    formattedTotalNetReceivables: formatCurrency(totalNetReceivables),
    riskyCustomerCount: riskyCustomers.length,
    topRiskyCustomers: riskyCustomers.sort((a, b) => b.balance - a.balance).slice(0, 5),
  };
}

export function getCustomerPaymentTrendSync(query: any = '') {
  let targetCust: any = null;
  if (query) {
    if (typeof query === 'object' && query.customerId) {
      targetCust = query;
    } else {
      const qStr = String(query).trim();
      targetCust = mockCustomers.find(c => c.customerId === qStr || c.customerName === qStr) || null;
      if (!targetCust) {
        const matches = searchCustomersSync(qStr, true);
        if (matches.length > 0) targetCust = matches[0];
      }
    }
  }

  const cid = targetCust ? targetCust.customerId : null;

  const sales = cid ? mockSalesInvoices.filter(s => s.customerId === cid) : mockSalesInvoices;
  const cols  = cid ? mockCollections.filter(c => c.customerId === cid && c.status === 'CREATED') : mockCollections.filter(c => c.status === 'CREATED');

  let contractualVade = 0;
  if (targetCust) {
    const statement = getCustomerStatementSync(cid);
    contractualVade = statement ? (statement.summary?.averageTermDays || 0) : 0;
  } else {
    contractualVade = getAverageTermForCustomersSync(mockCustomers);
  }

  const DAY_MS = 1000 * 60 * 60 * 24;
  const refTime = Date.now();

  const getAvgDaysInWindow = (windowDays: number) => {
    const ayPenceresi = Math.round(windowDays / 30);
    const minTime = refTime - (ayPenceresi * 30 * DAY_MS);

    const priorSalesSum = sales
      .filter(s => new Date(s.invoiceDate || s.date).getTime() < minTime)
      .reduce((a, b) => a + (b.amount || 0), 0);
    const priorColsSum = cols
      .filter(c => new Date(c.date).getTime() < minTime)
      .reduce((a, b) => a + (b.amount || 0), 0);
    const acilisBakiyesi = Math.max(0, priorSalesSum - priorColsSum);

    const windowSalesList = sales.filter(s => {
      const st = new Date(s.invoiceDate || s.date).getTime();
      return !isNaN(st) && st >= minTime;
    });

    const fifoFaturalarTumu = windowSalesList
      .filter(r => (r.amount || 0) > 0)
      .map(r => ({ tarih: new Date(r.invoiceDate || r.date).getTime(), kalan: r.amount || 0 }))
      .sort((a, b) => a.tarih - b.tarih);

    if (acilisBakiyesi > 0.01) {
      fifoFaturalarTumu.unshift({ tarih: minTime, kalan: acilisBakiyesi });
    }

    const fifoTahsilatlar = cols
      .filter(r => {
        const ct = new Date(r.date).getTime();
        return !isNaN(ct) && ct >= minTime && (r.amount || 0) > 0;
      })
      .map(r => ({ tarih: new Date(r.date).getTime(), tutar: r.amount || 0 }))
      .sort((a, b) => a.tarih - b.tarih);

    if (fifoTahsilatlar.length === 0) return contractualVade || 18;

    const toplamFaturaTutari = fifoFaturalarTumu.reduce((a, b) => a + b.kalan, 0);
    const toplamTahsilatTutari = fifoTahsilatlar.reduce((a, b) => a + b.tutar, 0);
    const netBakiye = toplamFaturaTutari - toplamTahsilatTutari;

    let fifoFaturalar: any[];
    if (netBakiye > 0.01) {
      const enYeniden = fifoFaturalarTumu.slice().sort((a, b) => b.tarih - a.tarih);
      let dusulecek = netBakiye;
      for (const f of enYeniden) {
        if (dusulecek <= 0.01) break;
        const dus = Math.min(dusulecek, f.kalan);
        f.kalan -= dus;
        dusulecek -= dus;
      }
      fifoFaturalar = fifoFaturalarTumu.filter(f => f.kalan > 0.01).sort((a, b) => a.tarih - b.tarih);
    } else if (netBakiye < -0.01) {
      fifoFaturalar = fifoFaturalarTumu.slice();
      fifoFaturalar.push({ tarih: refTime, kalan: -netBakiye });
      fifoFaturalar.sort((a, b) => a.tarih - b.tarih);
    } else {
      fifoFaturalar = fifoFaturalarTumu.slice();
    }

    const toplamKapanmisBorc = fifoFaturalar.reduce((a, b) => a + b.kalan, 0);
    if (toplamKapanmisBorc > 0.01 && toplamTahsilatTutari > 0.01) {
      const agirlikliFaturaTarihToplami = fifoFaturalar.reduce((a, b) => a + b.kalan * b.tarih, 0);
      const agirlikliTahsilatTarihToplami = fifoTahsilatlar.reduce((a, b) => a + b.tutar * b.tarih, 0);
      const ortFaturaTarihi = agirlikliFaturaTarihToplami / toplamKapanmisBorc;
      const ortTahsilatTarihi = agirlikliTahsilatTarihToplami / toplamTahsilatTutari;
      return Math.max(0, Math.round((ortTahsilatTarihi - ortFaturaTarihi) / DAY_MS));
    }

    return contractualVade || 18;
  };

  let days3M = getAvgDaysInWindow(90);
  let days6M = getAvgDaysInWindow(180);
  let days12M = getAvgDaysInWindow(365);

  const methodTotals = { nakit: 0, havale: 0, krediKarti: 0 };
  let colTotal = 0;
  for (const c of cols) {
    const amt = c.amount || 0;
    colTotal += amt;
    const m = (c.method || '').toUpperCase();
    if (m === 'NAKIT' || m === 'NAKİT') methodTotals.nakit += amt;
    else if (m.includes('KREDI') || m.includes('KREDİ') || m.includes('POS')) methodTotals.krediKarti += amt;
    else methodTotals.havale += amt;
  }

  const preferredMethod = colTotal > 0
    ? (methodTotals.krediKarti >= methodTotals.havale && methodTotals.krediKarti >= methodTotals.nakit ? 'Kredi Kartı' : (methodTotals.havale >= methodTotals.nakit ? 'Havale/EFT' : 'Nakit'))
    : 'Kredi Kartı';

  let trendDirection = 'STABLE';
  if (days3M > days6M + 3) trendDirection = 'SLOWING';
  else if (days3M < days6M - 3) trendDirection = 'IMPROVING';

  return {
    customerName: targetCust ? targetCust.customerName : 'Tüm Şirket Genel',
    signName: targetCust ? targetCust.signName : 'Genel Toplam',
    customerId: targetCust ? targetCust.customerId : 'GLOBAL',
    contractualVade: `${contractualVade || 28} gün`,
    actualPaymentDays: {
      days3M: `${days3M} gün`,
      days6M: `${days6M} gün`,
      days12M: `${days12M} gün`,
      raw3M: days3M,
      raw6M: days6M,
      raw12M: days12M
    },
    averageDays12M: days12M,
    preferredMethod,
    methodPercentages: {
      nakit: colTotal > 0 ? `${((methodTotals.nakit / colTotal) * 100).toFixed(1)}%` : '12.4%',
      havale: colTotal > 0 ? `${((methodTotals.havale / colTotal) * 100).toFixed(1)}%` : '28.6%',
      krediKarti: colTotal > 0 ? `${((methodTotals.krediKarti / colTotal) * 100).toFixed(1)}%` : '59.0%'
    },
    trendDirection,
    riskInsight: trendDirection === 'SLOWING' 
      ? `Son 3 ayda ödeme süresi ${days3M} güne uzamıştır (6 aylık ortalama ${days6M} gün). Ödemeler yavaşlama eğilimindedir.`
      : (trendDirection === 'IMPROVING' 
        ? `Son 3 ayda ödeme süresi ${days3M} güne düşmüştür (6 aylık ortalama ${days6M} gün). Ödeme disiplini hızlanmaktadır.`
        : `Müşterinin 3, 6 ve 12 aylık ödeme vadeleri ${days3M} gün civarında dengeli ve istikrarlıdır.`)
  };
}

export function getTopCustomersBySalesVolumeSync(opts: any = 10) {
  let limit = 10;
  let day: string | null = null;
  let month: string | null = null;
  let year: string | null = null;
  if (typeof opts === 'object' && opts !== null) {
    limit = opts.limit || 10;
    day = opts.day || null;
    month = opts.month || null;
    year = opts.year || null;
  } else if (typeof opts === 'number') {
    limit = opts;
  }

  let filterDateStr: string | null = null;
  let filterYM: string | null = null;
  let periodLabel = 'Tüm Zamanlar Kümülatif';

  if (day) {
    const dStr = String(day).toLowerCase().trim();
    let maxDateStr = '2026-07-29';
    for (const inv of mockSalesInvoices) {
      if (inv.invoiceDate && inv.invoiceDate.slice(0, 10) > maxDateStr) {
        maxDateStr = inv.invoiceDate.slice(0, 10);
      }
    }
    if (dStr === 'today' || dStr === 'bugün' || dStr === 'bugun') {
      filterDateStr = maxDateStr;
      periodLabel = `Bugün (${formatDate(maxDateStr)})`;
    } else if (dStr === 'yesterday' || dStr === 'dün' || dStr === 'dun') {
      const dt = new Date(maxDateStr);
      dt.setDate(dt.getDate() - 1);
      filterDateStr = dt.toISOString().slice(0, 10);
      periodLabel = `Dün (${formatDate(filterDateStr)})`;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
      filterDateStr = dStr;
      periodLabel = `Tarih: ${formatDate(dStr)}`;
    }
  }

  if (!filterDateStr && (month || year)) {
    let mNum = parseMonthNumber(month);
    let yNum = parseInt(year || '2026', 10) || 2026;
    if (!mNum) {
      const curMetrics = getCurrentMonthMetricsSync();
      const parts = (curMetrics.yearMonth || '').split('-');
      yNum = parseInt(parts[0], 10) || 2026;
      mNum = parseInt(parts[1], 10) || 7;
    }
    filterYM = `${yNum}-${String(mNum).padStart(2, '0')}`;
    const monthNames = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylul', 'Ekim', 'Kasım', 'Aralık'];
    periodLabel = `${monthNames[mNum] || month} ${yNum}`;
  }

  const salesVolumeMap: Record<string, number> = {};
  const collectionVolumeMap: Record<string, number> = {};

  for (const s of mockSalesInvoices) {
    const str = `${s.type || ''} ${s.eDocumentNo || ''} ${s.description || ''}`;
    if (str.includes('VIRMAN') || str.includes('Virman')) continue;
    if (filterDateStr && s.invoiceDate && !String(s.invoiceDate).startsWith(filterDateStr)) continue;
    if (!filterDateStr && filterYM && s.invoiceDate && !String(s.invoiceDate).startsWith(filterYM)) continue;
    salesVolumeMap[s.customerId] = (salesVolumeMap[s.customerId] || 0) + (s.amount || 0);
  }

  for (const c of mockCollections) {
    if (c.status && c.status !== 'CREATED') continue;
    const str = `${c.type || ''} ${c.eDocumentNo || ''} ${c.description || ''}`;
    if (str.includes('VIRMAN') || str.includes('Virman')) continue;
    if (filterDateStr && c.date && !String(c.date).startsWith(filterDateStr)) continue;
    if (!filterDateStr && filterYM && c.date && !String(c.date).startsWith(filterYM)) continue;
    collectionVolumeMap[c.customerId] = (collectionVolumeMap[c.customerId] || 0) + (c.amount || 0);
  }

  const balanceMap = getBalanceMap();

  const sorted = mockCustomers
    .map(c => {
      const volume = salesVolumeMap[c.customerId] || 0;
      const collections = collectionVolumeMap[c.customerId] || 0;
      const balance = balanceMap[c.customerId] || 0;
      const ratio = volume > 0 ? Math.min(100, Math.round((collections / volume) * 100 * 10) / 10) : (collections > 0 ? 100 : 0);

      return {
        customerId: c.customerId,
        customerName: c.customerName,
        signName: c.signName,
        salesRep: c.salesRepName || c.salesRep || 'Key Account',
        periodLabel,
        totalSalesVolume: volume,
        rawSalesVolume: volume,
        formattedVolume: formatCurrency(volume),
        totalCollectionsVolume: collections,
        formattedCollectionsVolume: formatCurrency(collections),
        collectionRatioPercentage: `${ratio}%`,
        balance: balance,
        formattedBalance: formatCurrency(balance),
        balanceStatus: balance > 0 ? 'Borçlu' : (balance < 0 ? 'Alacaklı (Ödeme Fazlası)' : 'Sıfır Bakiye')
      };
    })
    .filter(item => (!filterYM && !filterDateStr) || item.totalSalesVolume > 0 || item.totalCollectionsVolume > 0)
    .sort((a, b) => b.totalSalesVolume - a.totalSalesVolume)
    .slice(0, limit);

  return sorted.map((item, idx) => ({ rank: idx + 1, ...item }));
}

export function getCustomerChequesSync(customerId?: string) {
  if (!customerId) return mockCheques;
  return mockCheques.filter((c) => c.customerId === customerId);
}

export async function getCustomerCheques(customerId?: string) {
  await ready();
  return getCustomerChequesSync(customerId);
}

export async function addManualCheque(record: any) {
  await ready();
  if (!isAdminAuthenticated()) {
    throw new Error('🔒 Bu işlem yetki korumalıdır. Veritabanında ekleme, silme veya değişiklik yapmak için Admin Girişi yapılması gerekmektedir.');
  }
  const newRecord = {
    id: record.id || `manual_cs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: record.type || 'ÇEK',
    status: 'CREATED',
    ...record,
  };
  mockCheques.push(newRecord);
  await archiveCheques([newRecord]);
  invalidateCache();
  notifyListeners();
  return newRecord;
}

export async function updateManualCheque(id: string, updatedFields: any) {
  await ready();
  if (!isAdminAuthenticated()) {
    throw new Error('🔒 Bu işlem yetki korumalıdır. Veritabanında ekleme, silme veya değişiklik yapmak için Admin Girişi yapılması gerekmektedir.');
  }
  const cleanId = String(id || '').trim();
  const docNoKey = String(updatedFields?.docNo || '').trim();
  const subNoKey = String(updatedFields?.subNo || '').trim();

  let idx = mockCheques.findIndex((c) => {
    if (!c) return false;
    if (c.id && String(c.id).trim() === cleanId) return true;
    if (c.chequeId && String(c.chequeId).trim() === cleanId) return true;
    if (c.docNo && String(c.docNo).trim() === cleanId) return true;
    if (c.docNo && c.subNo && `${c.docNo}_${c.subNo}` === cleanId) return true;
    if (c.docNo && c.subNo && `${c.docNo}/${c.subNo}` === cleanId) return true;
    return false;
  });

  if (idx === -1 && docNoKey) {
    idx = mockCheques.findIndex((c) => {
      if (!c) return false;
      const cDoc = String(c.docNo || '').trim();
      const cSub = String(c.subNo || '').trim();
      if (subNoKey) {
        return cDoc === docNoKey && cSub === subNoKey;
      }
      return cDoc === docNoKey;
    });
  }

  if (idx !== -1) {
    mockCheques[idx] = {
      ...mockCheques[idx],
      ...updatedFields,
      id: mockCheques[idx].id || cleanId || `manual_cs_${Date.now()}`
    };
    
    if (updatedFields.status === 'IADE' || updatedFields.status === 'KARSILIKSIZ') {
      const ch = mockCheques[idx];
      mockCollections = mockCollections.map(col => {
        if (col.customerId === ch.customerId && (col.eDocumentNo === ch.docNo || col.description?.includes(ch.docNo))) {
          return { ...col, status: 'CANCELLED' };
        }
        return col;
      });
    }

    await updateChequesInArchive([mockCheques[idx]]);
    invalidateCache();
    notifyListeners();
    return mockCheques[idx];
  }

  const newRecord = {
    id: cleanId || `manual_cs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: updatedFields.type || 'ÇEK',
    status: 'CREATED',
    ...updatedFields,
  };
  mockCheques.push(newRecord);
  await archiveCheques([newRecord]);
  invalidateCache();
  notifyListeners();
  return newRecord;
}

export async function deleteManualCheque(id: string) {
  await ready();
  if (!isAdminAuthenticated()) {
    throw new Error('🔒 Bu işlem yetki korumalıdır. Veritabanında ekleme, silme veya değişiklik yapmak için Admin Girişi yapılması gerekmektedir.');
  }
  const cleanId = String(id || '').trim();
  const toDelete = mockCheques.filter((c) => {
    if (!c) return false;
    if (c.id && String(c.id).trim() === cleanId) return true;
    if (c.chequeId && String(c.chequeId).trim() === cleanId) return true;
    if (c.docNo && String(c.docNo).trim() === cleanId) return true;
    if (c.docNo && c.subNo && `${c.docNo}_${c.subNo}` === cleanId) return true;
    if (c.docNo && c.subNo && `${c.docNo}/${c.subNo}` === cleanId) return true;
    return false;
  });

  mockCheques = mockCheques.filter((c) => !toDelete.includes(c));
  for (const item of toDelete) {
    if (item.id) await deleteChequeRecord(item.id);
  }
  invalidateCache();
  notifyListeners();
}

export async function autoMatchAndClearChequesAndSenets() {
  if (!mockCheques || mockCheques.length === 0 || !mockCollections || mockCollections.length === 0) {
    return { matchedCount: 0, matchedItems: [] };
  }

  const matchedItems: any[] = [];
  const updatedRecords: any[] = [];

  for (let i = 0; i < mockCheques.length; i++) {
    const ch = mockCheques[i];
    if (ch.status === 'ODENDI' || ch.status === 'IADE' || ch.status === 'KARSILIKSIZ') continue;

    const chType = (ch.type || 'ÇEK').toUpperCase();

    if (chType === 'ÇEK' || chType === 'CEK') {
      const match = mockCollections.find((col) => {
        const colHesap = String(col.hesapNo || col.bankKodu || '').trim();
        const chHesap = String(ch.accountNo || ch.bankName || '').trim();
        if (colHesap && chHesap && colHesap === chHesap) return true;
        if (col.customerId === ch.customerId && Math.abs((col.amount || 0) - (ch.amount || 0)) < 0.01) return true;
        return false;
      });

      if (match) {
        mockCheques[i] = { ...ch, status: 'ODENDI', matchedDocNo: match.collectionId || match.docNo };
        updatedRecords.push(mockCheques[i]);
        matchedItems.push({ type: 'ÇEK', docNo: ch.docNo, amount: ch.amount, matchedWith: match.collectionId });
      }
    } else if (chType === 'SENET') {
      const match = mockCollections.find((col) => {
        const colTckn = String(col.identityNo || col.tckn || col.vergiNo || '').trim();
        const chTckn = String(ch.identityNo || ch.tckn || ch.vergiNo || '').trim();
        if (colTckn && chTckn && colTckn === chTckn && Math.abs((col.amount || 0) - (ch.amount || 0)) < 0.01) return true;

        const colDesc = String(col.description || col.customerName || '').trim().toLowerCase();
        const chDesc = String(ch.description || ch.customerName || '').trim().toLowerCase();
        if (colDesc && chDesc && (colDesc.includes(chDesc) || chDesc.includes(colDesc)) && Math.abs((col.amount || 0) - (ch.amount || 0)) < 0.01) return true;

        if (col.customerId === ch.customerId && Math.abs((col.amount || 0) - (ch.amount || 0)) < 0.01) return true;
        return false;
      });

      if (match) {
        mockCheques[i] = { ...ch, status: 'ODENDI', matchedDocNo: match.collectionId || match.docNo };
        updatedRecords.push(mockCheques[i]);
        matchedItems.push({ type: 'SENET', docNo: ch.docNo, amount: ch.amount, matchedWith: match.collectionId });
      }
    }
  }

  if (updatedRecords.length > 0) {
    try {
      await updateChequesInArchive(updatedRecords);
    } catch (e) {
      console.warn('Eşleşen çek/senetler arşive yazılamadı:', e);
    }
    invalidateCache();
    notifyListeners();
  }

  return { matchedCount: matchedItems.length, matchedItems };
}

export function getFinancialHealthReportSync(query = '') {
  let targetCustomers = mockCustomers;
  if (query && query.trim()) {
    targetCustomers = searchCustomersSync(query, true);
  }

  const allInvoices = mockSalesInvoices;
  const allCollections = mockCollections;
  const allCreditNotes = mockCreditNotes;

  const totalSales = allInvoices.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalCollections = allCollections.reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalCreditNotes = allCreditNotes.reduce((sum, cn) => sum + (cn.amount || 0), 0);
  const netReceivables = totalSales - totalCollections - totalCreditNotes;

  const globalAging = getAgingBuckets(allInvoices, allCollections, allCreditNotes);
  const overdueRatio = calculateOverdueRatio(globalAging, netReceivables);

  const trend = getCustomerPaymentTrendSync(query);
  const paymentTrendDays = trend?.averageDays12M || globalAging.averageVade || 30;

  const health = calculateFinancialHealthScore(globalAging, netReceivables, paymentTrendDays);
  const cei = calculateCEI(totalCollections + totalCreditNotes, totalSales, netReceivables);

  const pareto = calculateParetoConcentration(targetCustomers, 'balance');

  return {
    query: query || 'ŞİRKET GENELİ PORTFÖYÜ',
    totalCustomerCount: targetCustomers.length,
    netReceivables,
    overdueRatio,
    ceiRatio: cei,
    healthScore: health.healthScore,
    riskLevel: health.riskLevel,
    riskColor: health.riskColor,
    actionRecommendation: health.actionRecommendation,
    agingDistribution: {
      current: globalAging.current || 0,
      days30: globalAging.days30 || 0,
      days60: globalAging.days60 || 0,
      days90Plus: (globalAging.days90 || 0) + (globalAging.over90 || 0),
      averageVade: globalAging.averageVade
    },
    paretoConcentration: {
      isConcentrationHigh: pareto.isConcentrationHigh,
      customerCountFor80Percent: pareto.countFor80Percent,
      percentageOfCustomersFor80Percent: pareto.percentageOfCustomersFor80Percent,
      topDebtorsShare: (pareto.topCustomers || []).slice(0, 5)
    }
  };
}

export function getParetoConcentrationAnalysisSync() {
  const salesVolumeTop = getTopCustomersBySalesVolumeSync(100);
  const salesPareto = calculateParetoConcentration(salesVolumeTop, 'rawSalesVolume');

  const debtTop = getAllCustomersForReportingSync();
  const debtPareto = calculateParetoConcentration(debtTop, 'balance');

  return {
    salesPareto: {
      title: 'Ciro Yoğunlaşma Riski (Pareto 80/20)',
      totalSalesVolume: salesPareto.totalValue,
      totalCustomers: salesPareto.totalCustomerCount,
      customersGenerating80Percent: salesPareto.countFor80Percent,
      customerRatioPercentage: `${salesPareto.percentageOfCustomersFor80Percent}%`,
      isHighRisk: salesPareto.isConcentrationHigh,
      summary: salesPareto.isConcentrationHigh
        ? `⚠️ YÜKSEK CİRO YOĞUNLAŞMASI: Müşterilerin sadece %${salesPareto.percentageOfCustomersFor80Percent}'i toplam cironun %80'ini yapmaktadır.`
        : `✅ DENGELİ CİRO DAĞILIMI: Ciro geniş bir müşteri kitlesine yayılmıştır.`,
      topCustomers: (salesPareto.topCustomers || []).slice(0, 5)
    },
    debtPareto: {
      title: 'Alacak Riski Yoğunlaşması (Pareto 80/20)',
      totalReceivables: debtPareto.totalValue,
      totalCustomers: debtPareto.totalCustomerCount,
      customersHolding80PercentDebt: debtPareto.countFor80Percent,
      customerRatioPercentage: `${debtPareto.percentageOfCustomersFor80Percent}%`,
      isHighRisk: debtPareto.isConcentrationHigh,
      summary: debtPareto.isConcentrationHigh
        ? `🚨 YÜKSEK ALACAK RİSKİ YOĞUNLAŞMASI: Toplam borcun %80'i sadece ${debtPareto.countFor80Percent} müşteride toplanmıştır.`
        : `Dengeli alacak dağılımı.`,
      topDebtors: (debtPareto.topCustomers || []).slice(0, 5)
    }
  };
}

export function getCollectionEffectivenessIndexSync(query = '') {
  const summary = getGlobalFinancialSummarySync();
  const chartData = getDashboardChartDataSync();

  const totalSales = summary.totalSales || 0;
  const totalCollections = summary.totalCollections || 0;
  const totalCreditNotes = summary.totalCreditNotes || 0;
  const netReceivables = summary.netReceivables || 0;

  const totalCollectionPool = totalCollections + totalCreditNotes;
  const cei = calculateCEI(totalCollectionPool, totalSales, netReceivables);

  let evaluation = 'MÜKEMMEL TAHSİLAT ETKİNLİĞİ';
  if (cei < 50) evaluation = 'KRİTİK TAHSİLAT YERSİZLİĞİ (Acil Tahsilat Seferberliği Gerekli)';
  else if (cei < 75) evaluation = 'ORTA SEVİYE TAHSİLAT PERFORMANSI (Takip Gerektirir)';
  else if (cei < 90) evaluation = 'İYİ SEVİYE TAHSİLAT PERFORMANSI';

  return {
    ceiPercentage: `${cei}%`,
    rawCEI: cei,
    evaluation,
    totalSalesAmount: totalSales,
    totalCollectionPoolAmount: totalCollectionPool,
    netReceivablesAmount: netReceivables,
    paymentMethodBreakdown: chartData.tahsilatData || []
  };
}

export function getInvoiceControlDataSync(dateStr: string) {
  if (mockCustomers.length === 0) {
    loadSeedData();
  }
  const balanceMap = getBalanceMap();
  const { salesByCust, colsByCust, credsByCust } = buildMapsIfNeeded()!;

  const totalSalesCount = mockSalesInvoices.length;
  const totalColCount = mockCollections.length;

  if (!dateStr) {
    return {
      customers: [],
      stats: {
        totalInvoices: 0,
        totalCollections: 0,
        totalPrevCollections: 0,
        invoiceCount: 0,
        collectionCount: 0,
        totalArchiveSalesCount: totalSalesCount,
        totalArchiveColCount: totalColCount
      }
    };
  }

  const targetDateStr = String(dateStr).slice(0, 10);
  
  const targetDateObj = new Date(targetDateStr + 'T00:00:00');
  const prevDateObj = new Date(targetDateObj);
  prevDateObj.setDate(prevDateObj.getDate() - 1);
  const prevDateStr = prevDateObj.toISOString().slice(0, 10);

  const salesMap: Record<string, number> = {};
  const collectionMap: Record<string, number> = {};
  const prevColMap: Record<string, number> = {};

  let totalInvoices = 0;
  let totalCollections = 0;
  let totalPrevCollections = 0;
  let invoiceCount = 0;
  let collectionCount = 0;

  for (const inv of mockSalesInvoices) {
    if (!inv.invoiceDate) continue;
    const dStr = String(inv.invoiceDate).slice(0, 10);
    if (dStr === targetDateStr) {
      const amt = inv.amount || 0;
      salesMap[inv.customerId] = (salesMap[inv.customerId] || 0) + amt;
      totalInvoices += amt;
      invoiceCount++;
    }
  }

  for (const col of mockCollections) {
    if (col.status && col.status !== 'CREATED') continue;
    if (!col.date) continue;
    const dStr = String(col.date).slice(0, 10);
    if (dStr === targetDateStr) {
      const amt = col.amount || 0;
      collectionMap[col.customerId] = (collectionMap[col.customerId] || 0) + amt;
      totalCollections += amt;
      collectionCount++;
    } else if (dStr === prevDateStr) {
      const amt = col.amount || 0;
      prevColMap[col.customerId] = (prevColMap[col.customerId] || 0) + amt;
      totalPrevCollections += amt;
    }
  }

  const activeCustomerIds = new Set(Object.keys(salesMap));

  const custMap: Record<string, any> = {};
  for (const c of mockCustomers) {
    custMap[c.customerId] = c;
  }

  const resultCustomers: any[] = [];
  for (const cid of activeCustomerIds) {
    const cust = custMap[cid];
    if (!cust) continue;

    const balance = balanceMap[cid] || 0;
    const aging = getAgingBuckets(salesByCust[cid] || [], colsByCust[cid] || [], credsByCust[cid] || []);

    resultCustomers.push({
      ...cust,
      balance,
      averageVade: aging.averageVade || 0,
      invoiceTotal: salesMap[cid] || 0,
      collectionTotal: collectionMap[cid] || 0,
      prevCollectionTotal: prevColMap[cid] || 0,
    });
  }

  return {
    customers: resultCustomers,
    stats: {
      totalInvoices,
      totalCollections,
      totalPrevCollections,
      invoiceCount,
      collectionCount,
      targetDate: targetDateStr,
      prevDate: prevDateStr,
      totalArchiveSalesCount: totalSalesCount,
      totalArchiveColCount: totalColCount
    }
  };
}

export function getInvoiceControlReportSync(opts: any = {}) {
  const cacheKey = JSON.stringify(opts || {});
  if (invoiceControlCache[cacheKey]) return invoiceControlCache[cacheKey];

  if (mockCustomers.length === 0) {
    loadSeedData();
  }
  buildMapsIfNeeded();

  let dateInput = opts.date || opts.dateStr || opts.query || '';
  let salesRepFilter = (opts.salesRep || opts.rep || '').trim().toLowerCase();
  let unpaidOnly = !!opts.unpaidOnly;

  let targetDateStr: string | null = null;
  if (dateInput) {
    let str = String(dateInput).trim();
    const isoMatch = str.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    const trMatch = str.match(/\b(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})\b/);
    const textMatch = str.match(/\b(\d{1,2})\s+([a-zA-ZğüşıöçĞÜŞİÖÇ]+)(?:\s+(\d{4}))?\b/i);

    if (isoMatch) {
      targetDateStr = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    } else if (trMatch) {
      targetDateStr = `${trMatch[3]}-${trMatch[2].padStart(2, '0')}-${trMatch[1].padStart(2, '0')}`;
    } else if (textMatch) {
      const day = textMatch[1].padStart(2, '0');
      const monthNum = parseMonthNumber(textMatch[2]);
      const year = textMatch[3] || '2026';
      if (monthNum) {
        targetDateStr = `${year}-${String(monthNum).padStart(2, '0')}-${day}`;
      }
    } else {
      const iso = safeIsoDate(str);
      if (iso) targetDateStr = iso.slice(0, 10);
    }
  }

  if (!targetDateStr) {
    const dates = mockSalesInvoices.map(s => String(s.invoiceDate).slice(0, 10)).filter(Boolean).sort();
    targetDateStr = dates.length > 0 ? dates[dates.length - 1] : '2026-07-30';
  }

  const baseData = getInvoiceControlDataSync(targetDateStr);
  let customers = baseData.customers || [];

  let custQuery = (opts.query || opts.customer || opts.customerName || '').trim();
  if (custQuery) {
    const cleanedCustQuery = custQuery
      .replace(/\b(\d{1,2})\s+([a-zA-ZğüşıöçĞÜŞİÖÇ]+)(?:\s+(\d{4}))?\b/gi, '')
      .replace(/\b\d{4}[-/. ]\d{1,2}[-/. ]\d{1,2}\b/g, '')
      .replace(/\b\d{1,2}[\.\/]\d{1,2}[\.\/]\d{4}\b/g, '')
      .replace(/(faturası|fatura|tarihli|tahsilatı|tahsilat|ödemesi|ödeme|dekontu|ekstresi)/gi, '')
      .trim();

    if (cleanedCustQuery.length >= 2) {
      const targetNorm = trNormalize(cleanedCustQuery);
      const filtered = customers.filter(c =>
        trNormalize(c.customerName || '').includes(targetNorm) ||
        trNormalize(c.signName || '').includes(targetNorm) ||
        (c.customerId || '').includes(cleanedCustQuery)
      );
      if (filtered.length > 0) {
        customers = filtered;
      } else {
        const tokens = targetNorm.split(/\s+/).filter(t => t.length >= 3 && !['market', 'bufe', 'tekel', 'sarkuteri', 'gida', 'ltd', 'sti'].includes(t));
        for (const token of tokens) {
          const tokenFiltered = customers.filter(c =>
            trNormalize(c.customerName || '').includes(token) ||
            trNormalize(c.signName || '').includes(token)
          );
          if (tokenFiltered.length > 0) {
            customers = tokenFiltered;
            break;
          }
        }
      }
    }
  }

  if (salesRepFilter) {
    customers = customers.filter(c => {
      const rep = (c.salesRepName || c.salesRep || 'Key Account').toLowerCase();
      return rep.includes(salesRepFilter);
    });
  }

  if (unpaidOnly) {
    customers = customers.filter(c => c.invoiceTotal > 0 && (c.collectionTotal === 0 || c.collectionTotal < c.invoiceTotal));
  }

  const totalInvoiceAmount = customers.reduce((sum, c) => sum + (c.invoiceTotal || 0), 0);
  const totalCollectionAmount = customers.reduce((sum, c) => sum + (c.collectionTotal || 0), 0);
  const totalPrevCollectionAmount = customers.reduce((sum, c) => sum + (c.prevCollectionTotal || 0), 0);
  const openInvoiceTotal = Math.max(0, totalInvoiceAmount - totalCollectionAmount);
  const coverageRatio = totalInvoiceAmount > 0
    ? Math.min(100, Math.round((totalCollectionAmount / totalInvoiceAmount) * 100))
    : (totalCollectionAmount > 0 ? 100 : 0);
  const unpaidCustomerCount = customers.filter(c => c.invoiceTotal > 0 && c.collectionTotal === 0).length;

  const reportResult: any = {
    targetDate: targetDateStr,
    salesRepFilter: opts.salesRep || 'Tüm Temsilciler',
    isUnpaidFilterActive: unpaidOnly,
    totalMatchingCustomers: customers.length,
    unpaidCustomerCount,
    totalInvoiceAmount,
    formattedTotalInvoiceAmount: formatCurrency(totalInvoiceAmount),
    totalCollectionAmount,
    formattedTotalCollectionAmount: formatCurrency(totalCollectionAmount),
    totalPrevCollectionAmount,
    formattedTotalPrevCollectionAmount: formatCurrency(totalPrevCollectionAmount),
    openInvoiceTotal,
    formattedOpenInvoiceTotal: formatCurrency(openInvoiceTotal),
    coverageRatio,
    customerList: customers.map(c => ({
      customerId: c.customerId,
      customerName: c.signName || c.customerName,
      signName: c.signName,
      salesRep: c.salesRepName || c.salesRep || 'Key Account',
      salesRepName: c.salesRepName || c.salesRep || 'Key Account',
      balance: c.balance,
      formattedBalance: formatCurrency(c.balance),
      averageVadeDays: c.averageVade,
      invoiceTotal: c.invoiceTotal,
      formattedInvoiceTotal: formatCurrency(c.invoiceTotal),
      collectionTotal: c.collectionTotal,
      formattedCollectionTotal: formatCurrency(c.collectionTotal),
      prevCollectionTotal: c.prevCollectionTotal,
      formattedPrevCollectionTotal: formatCurrency(c.prevCollectionTotal),
      isUnpaidOnDate: c.invoiceTotal > 0 && c.collectionTotal === 0
    }))
  };

  reportResult.customers = reportResult.customerList;
  invoiceControlCache[cacheKey] = reportResult;
  return reportResult;
}

export function executeDynamicAnalyticsQuerySync({ queryPurpose = 'Dinamik Analiz', jsFunctionBody }: { queryPurpose?: string; jsFunctionBody: string }) {
  if (mockCustomers.length === 0) {
    loadSeedData();
  }
  buildMapsIfNeeded();

  try {
    if (!jsFunctionBody || typeof jsFunctionBody !== 'string') {
      throw new Error('Geçersiz JS kod gövdesi');
    }

    const fn = new Function(
      'mockSalesInvoices',
      'mockCollections',
      'mockCreditNotes',
      'mockCustomers',
      'mockCheques',
      'formatCurrency',
      'formatDate',
      'trNormalize',
      'getAgingBuckets',
      'calculateBalance',
      'getDaysOverdue',
      'getOpenInvoices',
      'getCustomerStatementSync',
      'getInvoiceControlReportSync',
      'getMonthlySalesRepPerformanceSync',
      `"use strict";\n${jsFunctionBody}`
    );

    const result = fn(
      mockSalesInvoices.map(x => ({ ...x })),
      mockCollections.map(x => ({ ...x })),
      mockCreditNotes.map(x => ({ ...x })),
      mockCustomers.map(x => ({ ...x })),
      mockCheques.map(x => ({ ...x })),
      formatCurrency,
      formatDate,
      trNormalize,
      getAgingBuckets,
      calculateBalance,
      getDaysOverdue,
      getOpenInvoices,
      getCustomerStatementSync,
      getInvoiceControlReportSync,
      getMonthlySalesRepPerformanceSync
    );

    return {
      status: 'SUCCESS',
      isDynamicSynthesis: true,
      queryPurpose,
      executedAt: new Date().toISOString(),
      result: result !== undefined ? result : { message: 'Kod başarıyla çalıştırıldı fakat değer döndürmedi.' }
    };
  } catch (err: any) {
    console.error('executeDynamicAnalyticsQuerySync error:', err);
    return {
      status: 'ERROR',
      isDynamicSynthesis: true,
      queryPurpose,
      error: err.message || String(err),
      hint: 'Dinamik kod çalıştırılırken sözdizimi veya mantık hatası oluştu.'
    };
  }
}

export interface CustomerRiskAnalysisResult {
  customerId: string;
  customerName: string;
  salesRep: string;
  balance: number;
  monthlyAvgCollection: number;
  coverageMonths: number;
  coverageDays: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  riskColor: string;
  riskScore: number;
  riskLabel: string;
  actionAdvice: string;
}

export function calculateCustomerDebtToCollectionRiskSync(customerOrId: any): CustomerRiskAnalysisResult {
  if (mockCustomers.length === 0) loadSeedData();
  const balanceMap = getBalanceMap();

  let custId = '';
  let custObj: any = null;

  if (typeof customerOrId === 'string') {
    custId = customerOrId;
    custObj = mockCustomers.find(c => c.customerId === custId) || { customerId: custId };
  } else if (customerOrId && typeof customerOrId === 'object') {
    custId = customerOrId.customerId;
    custObj = customerOrId;
  }

  const custName = custObj?.signName || custObj?.customerName || `Cari (${custId})`;
  const salesRep = custObj?.salesRepName || custObj?.salesRep || 'Key Account';
  const balance = balanceMap[custId] ?? (custObj?.balance || 0);

  const isVirman = (item: any) => {
    const str = `${item.type || ''} ${item.eDocumentNo || ''} ${item.description || ''}`;
    return str.includes('VIRMAN') || str.includes('Virman') || str.includes('DEVIR') || str.includes('Devir');
  };

  const custCols = mockCollections.filter(c => c.customerId === custId && c.status === 'CREATED' && !isVirman(c));
  const totalCols = custCols.reduce((sum, c) => sum + (c.amount || 0), 0);

  let monthsSpan = 3;
  if (custCols.length > 0) {
    const dates = custCols.map(c => String(c.date || '').slice(0, 10)).sort();
    const minD = new Date(dates[0] + 'T00:00:00');
    const maxD = new Date(dates[dates.length - 1] + 'T00:00:00');
    const diffDays = Math.max(30, Math.round((maxD.getTime() - minD.getTime()) / (1000 * 60 * 60 * 24)));
    monthsSpan = Math.max(1, Math.round((diffDays / 30) * 10) / 10);
  }

  const monthlyAvgCollection = totalCols > 0 ? Math.round(totalCols / monthsSpan) : 0;

  if (balance <= 0) {
    return {
      customerId: custId,
      customerName: custName,
      salesRep,
      balance,
      monthlyAvgCollection,
      coverageMonths: 0,
      coverageDays: 0,
      riskLevel: 'LOW',
      riskColor: '#10B981',
      riskScore: 100,
      riskLabel: '🟢 Risk Yok (Alacak / Sıfır Borç)',
      actionAdvice: 'Müşteri hesabı kapalı veya alacaklı durumdadır. Normal ticari ilişki sürdürülebilir.'
    };
  }

  if (monthlyAvgCollection <= 0) {
    return {
      customerId: custId,
      customerName: custName,
      salesRep,
      balance,
      monthlyAvgCollection: 0,
      coverageMonths: 99,
      coverageDays: 999,
      riskLevel: 'HIGH',
      riskColor: '#EF4444',
      riskScore: 15,
      riskLabel: '🔴 Kritik Risk (Sıfır Tahsilat Kaydı)',
      actionAdvice: `⚠️ Müşteriden henüz hiç tahsilat alınmamıştır! ${formatCurrency(balance)} bakiye risk altındadır. Sevkiyatı durdurun ve peşin ödeme talep edin.`
    };
  }

  const coverageMonths = Math.round((balance / monthlyAvgCollection) * 10) / 10;
  const coverageDays = Math.round(coverageMonths * 30);

  if (coverageMonths <= 1.5) {
    return {
      customerId: custId,
      customerName: custName,
      salesRep,
      balance,
      monthlyAvgCollection,
      coverageMonths,
      coverageDays,
      riskLevel: 'LOW',
      riskColor: '#10B981',
      riskScore: 90,
      riskLabel: '🟢 Düşük Risk (Güçlü Tahsilat Karşılama)',
      actionAdvice: `Mevcut borç (${formatCurrency(balance)}), ortalama ${coverageMonths} ayda (${coverageDays} günde) tahsilatla tamamen kapanabilir. Cari ödeme performansı sağlıklı.`
    };
  } else if (coverageMonths <= 3.0) {
    return {
      customerId: custId,
      customerName: custName,
      salesRep,
      balance,
      monthlyAvgCollection,
      coverageMonths,
      coverageDays,
      riskLevel: 'MEDIUM',
      riskColor: '#F59E0B',
      riskScore: 60,
      riskLabel: '🟡 Orta Risk (Yakın Takip Önerilir)',
      actionAdvice: `Borç (${formatCurrency(balance)}), ${coverageMonths} aylık (${coverageDays} günlük) tahsilat gücüne eşittir. Limite yakın takip ve haftalık ödeme planı önerilir.`
    };
  } else {
    return {
      customerId: custId,
      customerName: custName,
      salesRep,
      balance,
      monthlyAvgCollection,
      coverageMonths,
      coverageDays,
      riskLevel: 'HIGH',
      riskColor: '#EF4444',
      riskScore: 30,
      riskLabel: '🔴 Yüksek Borç Karşılama Riski',
      actionAdvice: `🚨 Kritik! Borcun tahsilatla kapanması ${coverageMonths} ay (${coverageDays} gün) sürecektir! Yeni sevkıyatı kısıtlayıp haftalık ${formatCurrency(Math.round(balance / 4))} peşin ödeme planlayın.`
    };
  }
}

export function getDeepExecutiveAnalyticsOverviewSync() {
  if (mockCustomers.length === 0) loadSeedData();

  const curMonth = getCurrentMonthMetricsSync();
  const prevMonth = getPreviousMonthMetricsSync();
  const curCharts = getCurrentMonthChartDataSync();
  const repPerf = getMonthlySalesRepPerformanceSync();
  const allReporting = getAllCustomersForReportingSync();

  const over60Custs = allReporting
    .filter(c => (c.averageVade || 0) > 60 || (c.balance > 0 && c.cekSenet > 0))
    .sort((a, b) => b.balance - a.balance);

  const risky30k = allReporting
    .filter(c => c.balance > 30000)
    .sort((a, b) => b.balance - a.balance);

  const topDebtors = [...allReporting]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  const growthPct = prevMonth.monthCollections > 0
    ? Math.round(((curMonth.monthCollections - prevMonth.monthCollections) / prevMonth.monthCollections) * 100 * 10) / 10
    : 0;

  return {
    activeMonth: curMonth.monthLabel,
    previousMonth: prevMonth.monthLabel,
    monthSales: curMonth.monthSales,
    monthCollections: curMonth.monthCollections,
    prevMonthCollections: prevMonth.monthCollections,
    collectionGrowthPct: growthPct,
    monthCollectionRatio: curMonth.monthCollectionRatio,
    prevMonthCollectionRatio: prevMonth.monthCollectionRatio,
    paymentChannels: {
      krediKarti: curCharts.kk,
      havale: curCharts.havale,
      nakit: curCharts.nakit,
      hizmet: curCharts.hizmet,
      iade: curCharts.iade
    },
    topSalesRepOfMonth: (repPerf.repList || [])[0] || null,
    over60DaysOverdue: {
      count: over60Custs.length,
      top3: over60Custs.slice(0, 3).map(c => ({
        customerId: c.customerId,
        customerName: c.signName || c.customerName,
        balance: c.balance,
        vade: c.averageVade
      }))
    },
    risky30kGroup: {
      count: risky30k.length,
      totalRiskBalance: risky30k.reduce((sum, c) => sum + c.balance, 0),
      top3: risky30k.slice(0, 3).map(c => ({
        customerId: c.customerId,
        customerName: c.signName || c.customerName,
        balance: c.balance
      }))
    },
    top5DebtorsOverall: topDebtors.map(c => ({
      customerId: c.customerId,
      customerName: c.signName || c.customerName,
      salesRep: c.salesRepName || c.salesRep,
      balance: c.balance
    }))
  };
}

export interface HoverAnalyticsItem {
  type: 'CUSTOMER' | 'KPI' | 'REP' | 'AGING' | 'MODULE';
  title: string;
  subtitle?: string;
  metrics?: { label: string; value: string; color?: string }[];
  advice?: string;
  customerObj?: any;
  page?: string;
  selectedDate?: string;
  targetRect?: { top: number; left: number; width: number; height: number; bottom?: number; right?: number } | null;
}

let activeHoverData: HoverAnalyticsItem | null = null;
let hoverTimer: any = null;
const hoverListeners = new Set<(data: HoverAnalyticsItem | null) => void>();

export function setHoverAnalyticsData(data: HoverAnalyticsItem | null, delayMs = 250) {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }

  if (!data) {
    activeHoverData = null;
    hoverListeners.forEach(fn => { try { fn(null); } catch (e) {} });
    return;
  }

  hoverTimer = setTimeout(() => {
    activeHoverData = data;
    hoverListeners.forEach(fn => { try { fn(activeHoverData); } catch (e) {} });
  }, delayMs);
}

export function getHoverAnalyticsData(): HoverAnalyticsItem | null {
  return activeHoverData;
}

export function subscribeHoverAnalyticsData(callback: (data: HoverAnalyticsItem | null) => void) {
  hoverListeners.add(callback);
  return () => hoverListeners.delete(callback);
}

export interface DeepInvoiceAnalysisResult {
  customerId: string;
  customerName: string;
  salesRep: string;
  selectedDate: string;
  invoiceTotal: number;
  collectionTotal: number;
  prevCollectionTotal: number;
  balance: number;
  vadeDays: number;
  avgInvoiceAmount: number;
  invoiceSpikeRatio: number;
  isAllTimeRecord: boolean;
  maxHistoricalInvoice: number;
  monthlyAvgCollection: number;
  collectionCapacityRatio: number;
  sameDayCashHabitPct: number;
  isSameDayPaymentDrift: boolean;
  chequeRiskAmount: number;
  tier: 'RECORD_SPIKE' | 'UNPAID_CHAIN' | 'CAPACITY_BREACH' | 'HABIT_DRIFT' | 'HEALTHY_GROWTH' | 'STANDARD';
  badgeTag: string;
  badgeColor: string;
  subtitle: string;
  advice: string;
}

export function calculateDeepInvoiceAnalysisSync(customerOrId: any, selectedDate?: string): DeepInvoiceAnalysisResult {
  if (mockCustomers.length === 0) loadSeedData();

  let custObj: any = null;
  let custId = '';

  if (typeof customerOrId === 'string') {
    custId = customerOrId;
    custObj = mockCustomers.find(c => c.customerId === custId) || { customerId: custId };
  } else if (customerOrId && typeof customerOrId === 'object') {
    custId = customerOrId.customerId;
    custObj = customerOrId;
  }

  const custName = custObj?.signName || custObj?.customerName || `Cari (${custId})`;
  const salesRep = custObj?.salesRepName || custObj?.salesRep || 'Key Account';
  const targetDate = selectedDate || custObj?.selectedDate || '';

  const invTotal = custObj?.invoiceTotal ?? 0;
  const colTotal = custObj?.collectionTotal ?? 0;
  const prevColTotal = custObj?.prevCollectionTotal ?? 0;
  const balance = custObj?.balance ?? 0;
  const vadeDays = typeof custObj?.averageVadeDays === 'number'
    ? custObj.averageVadeDays
    : (typeof custObj?.averageVade === 'number' ? custObj.averageVade : 0);

  // 1. Historical Invoice Analysis
  const custInvoices = mockSalesInvoices.filter(i => i.customerId === custId);
  const invoiceCount = custInvoices.length;
  const totalSalesVal = custInvoices.reduce((sum, i) => sum + (i.amount || 0), 0);
  const avgInvoiceAmount = invoiceCount > 0 ? Math.round(totalSalesVal / invoiceCount) : 0;
  const maxHistoricalInvoice = invoiceCount > 0 ? Math.max(...custInvoices.map(i => i.amount || 0)) : 0;

  const invoiceSpikeRatio = avgInvoiceAmount > 0 ? Math.round((invTotal / avgInvoiceAmount) * 10) / 10 : 1;
  const isAllTimeRecord = invTotal > 0 && invTotal >= maxHistoricalInvoice && invoiceCount > 1;

  // 2. Collection Capacity & Risk
  const debtRisk = calculateCustomerDebtToCollectionRiskSync(custId);
  const monthlyAvgCollection = debtRisk.monthlyAvgCollection;
  const collectionCapacityRatio = monthlyAvgCollection > 0
    ? Math.round((invTotal / monthlyAvgCollection) * 10) / 10
    : (invTotal > 0 ? 99 : 0);

  // 3. Same-Day Payment Habit & Drift
  const custCols = mockCollections.filter(c => c.customerId === custId && c.status === 'CREATED');
  const sameDayColsCount = custCols.filter(c => ['NAKİT', 'KREDİ_KARTI'].includes(c.method || '')).length;
  const sameDayCashHabitPct = invoiceCount > 0 ? Math.min(100, Math.round((sameDayColsCount / invoiceCount) * 100)) : 0;
  const isSameDayPaymentDrift = invTotal > 0 && colTotal === 0 && sameDayCashHabitPct >= 65;

  // 4. Cheque / Senet Risk Exposure
  const custCheques = mockCheques.filter(ch => ch.customerId === custId && ch.status !== 'TAHSİL EDİLDİ');
  const chequeRiskAmount = custCheques.reduce((sum, ch) => sum + (ch.amount || 0), 0);

  // 5. Tier & Signal Generation
  let tier: DeepInvoiceAnalysisResult['tier'] = 'STANDARD';
  let badgeTag = '✨ Günlük Fatura Dengesi';
  let badgeColor = '#3B82F6';
  let subtitle = '';
  let advice = '';

  const dateLabel = targetDate ? formatDate(targetDate) : 'Seçilen Tarih';

  if (isAllTimeRecord || invoiceSpikeRatio >= 2.0) {
    tier = 'RECORD_SPIKE';
    badgeTag = isAllTimeRecord ? '🔥 All-Time Fatura Rekoru' : '⚡ Anormal Fatura Sıçraması';
    badgeColor = '#EF4444';
    subtitle = `📂 ${dateLabel} Fatura: ${formatCurrency(invTotal)} | Ort. Fatura: ${formatCurrency(avgInvoiceAmount)} (${invoiceSpikeRatio}x Sıçrama) ${isAllTimeRecord ? '🔥 Rekor!' : ''} | Aylık Tahsilat Kapasitesi: ${formatCurrency(monthlyAvgCollection)}`;
    advice = `🚨 ${dateLabel} tarihinde kesilen ${formatCurrency(invTotal)} fatura, müşterinin ortalama fatura büyüklüğünün ${invoiceSpikeRatio} katıdır! ${isAllTimeRecord ? 'Müşterinin tüm zamanlar en yüksek fatura rekorudur.' : ''} Sevkıyat teslimatında ödeme planı veya plasiyer ${salesRep} teyidi alınmalıdır.`;
  } else if (invTotal > 0 && colTotal === 0 && vadeDays >= 30) {
    tier = 'UNPAID_CHAIN';
    badgeTag = '🔴 Tahsilatsız Fatura & Vade Riski';
    badgeColor = '#EF4444';
    subtitle = `📂 ${dateLabel} Fatura: ${formatCurrency(invTotal)} | Kalan Borç: ${formatCurrency(balance)} (${vadeDays} Gün Vade Aşımı) | Aynı Gün Tahsilat: 0 TL`;
    advice = `🚨 Gecikmiş borcu (${vadeDays} gün vade) varken müşteriye yeni fatura kesilmiş ancak aynı gün tahsilat kapatılmamıştır! Sevkıyatı kısıtlayıp kalan borç için haftalık ${formatCurrency(Math.round(balance / 3))} ödeme takvimi oluşturun.`;
  } else if (collectionCapacityRatio >= 1.5 && monthlyAvgCollection > 0) {
    tier = 'CAPACITY_BREACH';
    badgeTag = '⚠️ Tahsilat Kapasitesini Aşan Fatura';
    badgeColor = '#F59E0B';
    subtitle = `📂 ${dateLabel} Fatura: ${formatCurrency(invTotal)} | Ort. Aylık Tahsilat Gücü: ${formatCurrency(monthlyAvgCollection)} (${collectionCapacityRatio}x Hacim Aşımı)`;
    advice = `⚠️ Tek seferde kesilen fatura (${formatCurrency(invTotal)}), müşterinin ortalama aylık tahsilat kapasitesinin (${formatCurrency(monthlyAvgCollection)}) ${collectionCapacityRatio} katıdır! Borcun tahsilatla tamamen kapanması uzun sürebilir, ara ödeme takvimi bağlayın.`;
  } else if (isSameDayPaymentDrift) {
    tier = 'HABIT_DRIFT';
    badgeTag = '🟡 Ödeme Alışkanlığı Sapması';
    badgeColor = '#F59E0B';
    subtitle = `📂 ${dateLabel} Fatura: ${formatCurrency(invTotal)} | Geçmiş Peşin Kapatma Oranı: %${sameDayCashHabitPct} | Bugünkü Ödeme: 0 TL`;
    advice = `🟡 Müşteri normalde faturalarını aynı gün peşin/kart kapatma profiline sahiptir (%${sameDayCashHabitPct}). Bugün ödeme işlenmemiştir, plasiyer ${salesRep} ile gün sonu pos/tahsilat kontrolü yapılmalıdır.`;
  } else if (vadeDays <= 10 && invTotal > avgInvoiceAmount && invTotal > 0) {
    tier = 'HEALTHY_GROWTH';
    badgeTag = '🟢 Mükemmel Ödeme ile VIP Büyüme';
    badgeColor = '#10B981';
    subtitle = `📂 ${dateLabel} Fatura: ${formatCurrency(invTotal)} | Ödeme Vadesi: ${vadeDays} Gün | Tahsilat Başarısı: %98+ (VIP Performans)`;
    advice = `🟢 Müşterinin ortalama ödeme vadesi (${vadeDays} Gün) mükemmeldir! ${formatCurrency(invTotal)} fatura yüksek hacimli olmakla birlikte sıfır finansal risk taşımaktadır. Ticari ilişki güvenle büyütülebilir.`;
  } else {
    tier = 'STANDARD';
    badgeTag = '✨ Günlük Fatura & Tahsilat Dengesi';
    badgeColor = '#3B82F6';
    subtitle = `📂 ${dateLabel} Fatura: ${formatCurrency(invTotal)} | Aynı Gün Tahsilat: ${colTotal > 0 ? formatCurrency(colTotal) : '—'} | Önc. Gün Tahsilat: ${prevColTotal > 0 ? formatCurrency(prevColTotal) : '—'} | Kalan Borç: ${formatCurrency(balance)} (${vadeDays > 0 ? `${vadeDays} Gün Vade` : 'Aşım Yok'})`;
    advice = colTotal >= invTotal && invTotal > 0
      ? `💳 Fatura tutarı (${formatCurrency(invTotal)}) aynı gün alınan tahsilatla (${formatCurrency(colTotal)}) tamamen kapatılmıştır! Cari hesabı dengededir.`
      : `Müşteri alışveriş ve ödeme dengesi gün bazında kontrol altındadır.`;
  }

  return {
    customerId: custId,
    customerName: custName,
    salesRep,
    selectedDate: targetDate,
    invoiceTotal: invTotal,
    collectionTotal: colTotal,
    prevCollectionTotal: prevColTotal,
    balance,
    vadeDays,
    avgInvoiceAmount,
    invoiceSpikeRatio,
    isAllTimeRecord,
    maxHistoricalInvoice,
    monthlyAvgCollection,
    collectionCapacityRatio,
    sameDayCashHabitPct,
    isSameDayPaymentDrift,
    chequeRiskAmount,
    tier,
    badgeTag,
    badgeColor,
    subtitle,
    advice
  };
}

