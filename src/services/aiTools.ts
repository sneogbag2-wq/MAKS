/**
 * AI Tool Definitions & Execution Handlers
 * Maps Gemini function calls to customerService and calculations
 */

import {
  searchCustomersSync,
  getAllCustomersForReportingSync,
  getGlobalFinancialSummarySync,
  getCurrentStatusSync,
  getCustomerById,
  getCustomerStatement,
  getGlobalHighestTransactionsSync,
  getMonthlyComparisonSync,
  getMonthlyRiskAndRevenueReportSync,
  getMonthlySalesRepPerformanceSync,
  getCustomerPaymentTrendSync,
  getTopCustomersBySalesVolumeSync,
  addManualInvoice,
  addManualCollection,
  addVirmanTransfer,
  deleteTransactionRecord,
  getCustomerChequesSync,
  addManualCheque,
  updateManualCheque,
  deleteManualCheque,
  waitForInit,
  bulkDeleteTransactions,
  purgeTestImportRecords,
  getFinancialHealthReportSync,
  getParetoConcentrationAnalysisSync,
  getCollectionEffectivenessIndexSync,
  getInvoiceControlReportSync,
  executeDynamicAnalyticsQuerySync,
  calculateCustomerDebtToCollectionRiskSync,
  getDeepExecutiveAnalyticsOverviewSync,
  getCurrentMonthMetricsSync,
  getPreviousMonthMetricsSync
} from './customerService';
import { formatCurrency, formatDate } from '../utils/formatters';
import { safeIsoDate } from '../utils/dateUtils';
import { isAdminAuthenticated } from './customRulesService';
import { runExcelVerificationTest } from './excelTestRunnerService';
import { rawExcelCache } from './uploadService';
import { archiveSalesInvoices, archiveCollections, archiveCheques, archiveCreditNotes } from './archiveService';

const DYNAMIC_SUBAGENTS_STORAGE_KEY = 'akgun_dynamic_subagents';

function getPersistedSubagents(): Record<string, any> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = localStorage.getItem(DYNAMIC_SUBAGENTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function savePersistedSubagent(agent: any) {
  try {
    if (typeof window === 'undefined') return;
    const current = getPersistedSubagents();
    current[agent.name] = agent;
    localStorage.setItem(DYNAMIC_SUBAGENTS_STORAGE_KEY, JSON.stringify(current));
  } catch (e) {}
}

const dynamicSubagentsRegistry: Record<string, any> = {
  researchSubagent: {
    name: 'researchSubagent',
    role: 'Research Subagent (Kod & Veri Araştırma Ajanı)',
    description: 'Veritabanında, 3.600+ cari kaydında, ekstrelerde, arşivlerde ve Excel verilerinde milisaniyelik derinlemesine tarama yapar.',
    systemPrompt: 'Sen Research Subagent (Kod & Veri Araştırma Ajanı) rolündesin. Görevin veritabanında, ekstrelerde ve dosyalarda en detaylı bilgiyi arayıp bulmaktır.'
  },
  taskExecutionSubagent: {
    name: 'taskExecutionSubagent',
    role: 'Task Execution Subagent (İşlem & Operasyon İcra Ajanı)',
    description: 'Fatura, tahsilat, virman, silme ve veri değiştirme operasyonlarını Admin şifre güvenliğiyle icra eder.',
    systemPrompt: 'Sen Task Execution Subagent (İşlem & Operasyon İcra Ajanı) rolündesin. Görevin veritabanı mütasyonlarını ve operasyonları güvenle yönetmektir.'
  },
  visualDesignerSubagent: {
    name: 'visualDesignerSubagent',
    role: 'Visual Designer & Image Generator Subagent (Görsel & UI Tasarım Ajanı)',
    description: 'Grafikler (renderChart), harita konumları (googleMapsLinkMarkdown) ve görsel Markdown tabloları tasarlar.',
    systemPrompt: 'Sen Visual Designer Subagent rolündesin. Görevin yanıtları en şık grafiklerle, harita linkleriyle ve harika tablolarla görselleştirmektir.'
  },
  schedulerSubagent: {
    name: 'schedulerSubagent',
    role: 'Scheduler & Background Cron Subagent (Zamanlayıcı ve Arka Plan Ajanı)',
    description: 'Vadesi yaklaşan çek/senet takibi, periyodik borç/tahsilat kontrolleri ve zamanlı hatırlatmaları yönetir.',
    systemPrompt: 'Sen Scheduler & Background Cron Subagent rolündesin. Görevin vade tarihlerini ve periyodik finansal takipleri yönetmektir.'
  },
  dynamicFactorySubagent: {
    name: 'dynamicFactorySubagent',
    role: 'Dynamic Subagent Factory (Dinamik Alt-Ajan Üretici)',
    description: 'Runtime\'da sıfırdan yeni uzman ajanlar tanımlar (defineSubagent) ve çalıştırır (invokeSubagent).',
    systemPrompt: 'Sen Dynamic Subagent Factory rolündesin. Görevin sıradışı isteklerde sıfırdan yeni alt-ajanlar tanımlayıp göreve başlatmaktır.'
  },
  interactiveAlignmentSubagent: {
    name: 'interactiveAlignmentSubagent',
    role: 'Interactive Modal & Aligning Subagent (Kullanıcı Mülakat & Karar Ajanı)',
    description: 'Değişiklikler öncesi iki aşamalı önizleme sunar, kullanıcı onayını alır; ⚠️ Stratejik Risk Uyarısı ve 💡 Aksiyon Önerileri ekler.',
    systemPrompt: 'Sen Interactive Alignment Subagent rolündesin. Görevin mütasyon öncesi kullanıcı onayı almak, risk uyarısı ve aksiyon tavsiyesi vermektir.'
  },
  ...getPersistedSubagents()
};

export const aiToolDeclarations = [
  {
    name: 'getGlobalFinancialSummary',
    description: 'Get global financial summary including total sales, collections, credit notes, and net receivables balance.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },
  {
    name: 'getCurrentStatus',
    description: 'Get current operational status metrics: open invoice count, today collections total, weighted portfolio average payment terms.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },
  {
    name: 'searchCustomers',
    description: 'Search for customers by name, customer ID (5000XXXXXX), or sign name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Search query (customer ID, name, or business title)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'getCustomerDetails',
    description: 'Get detailed information and balance for a specific customer by customerId.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customerId: {
          type: 'STRING',
          description: 'Customer ID (e.g. 5000123456)'
        }
      },
      required: ['customerId']
    }
  },
  {
    name: 'getCustomerStatement',
    description: 'Get detailed account statement ledger (ekstre) and FIFO aging for a specific customer by customerId.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customerId: {
          type: 'STRING',
          description: 'Customer ID (e.g. 5000123456)'
        }
      },
      required: ['customerId']
    }
  },
  {
    name: 'queryTransactions',
    description: 'Query specific customer transactions (collections, sales invoices, credit notes) or open unpaid invoices (ACIK_FATURA) by customer name/code, transaction type, and date ordering. ALWAYS use this for questions like "X customer\'s last collection", "open invoices of Y", "average payment term days".',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Customer name, customer code (5000XXXXXX), or business sign name (e.g. "darwin", "777", "akin market")'
        },
        transactionType: {
          type: 'STRING',
          description: 'Filter transaction type: "ACIK_FATURA" (unpaid open invoices), "TAHSILAT" (collections), "SATIS" (sales invoices), "DEKONT" (credit notes), or "ALL"'
        },
        sortBy: {
          type: 'STRING',
          description: 'Sorting order: "LATEST" (newest date first, default for "last/en son"), "OLDEST" (oldest first), "HIGHEST_AMOUNT" (largest amount first)'
        },
        limit: {
          type: 'NUMBER',
          description: 'Number of records to return (default: 10). Set this to a high number (e.g., 50 or 100) if you need to calculate averages over long periods like 3-6 months.'
        }
      },
      required: []
    }
  },
  {
    name: 'getTopDebtors',
    description: 'Get the top N customers with highest debt (positive balance). Use this for "en borçlu müşteri", "en yüksek borcu olanlar", "alacak riski".',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: {
          type: 'NUMBER',
          description: 'Number of top debtors to return (default: 10)'
        }
      },
      required: []
    }
  },
  {
    name: 'getTopCustomersBySalesVolume',
    description: 'Get top N customers with highest sales volume (Ciro / Satış Hacmi). For questions like "bugün en çok fatura kesilen", "dün en çok satış yapılan", "bu ayki ciro liderleri", pass day="today" / day="yesterday" or month="current" / specific month name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'NUMBER', description: 'Number of top customers to return (default: 10)' },
        day: { type: 'STRING', description: 'Optional day filter: "today" / "bugün", "yesterday" / "dün", or YYYY-MM-DD date' },
        month: { type: 'STRING', description: 'Optional month name or "current" / "bu ay" (e.g. "current", "Temmuz", "07")' },
        year: { type: 'STRING', description: 'Optional year (e.g. "2026")' }
      },
      required: []
    }
  },
  {
    name: 'getInvoiceControlReport',
    description: 'Get date-based invoice and collection control report for specific dates (e.g., "17 Temmuz 2026", "2026-07-16"), specific sales reps (e.g. "BERK KUTAY KORKMAZ", "ALİCAN AKBAŞ"), or find customers with unpaid invoices on a specific date. ALWAYS use this tool for questions like "X temsilcinin 17 temmuz faturaları", "16 temmuzda tahsilat alınmayan müşteriler", "tarih bazlı fatura kontrol".',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: { type: 'STRING', description: 'Date to query (e.g. "17 Temmuz", "2026-07-17", "16 Temmuz 2026")' },
        salesRep: { type: 'STRING', description: 'Sales rep name (e.g. "BERK KUTAY KORKMAZ", "ALİCAN AKBAŞ")' },
        unpaidOnly: { type: 'BOOLEAN', description: 'Set to true to find customers who had sales invoices on that date but 0 collections (tahsilat alınmayan müşteriler)' }
      },
      required: []
    }
  },
  {
    name: 'getAgingBreakdown',
    description: 'Get aging distribution overview (0-30, 31-60, 61-90, 90+ days overdue balances).',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },
  {
    name: 'getPaymentMethodsBreakdown',
    description: 'Get breakdown of collection amounts by payment method (Nakit, Havale, Kredi Kartı, Hizmet, İade).',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },
  {
    name: 'getSalesRepSummary',
    description: 'Get list of sales representatives with customer counts and portfolio balances.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },
  {
    name: 'addManualInvoice',
    description: 'Add a new manual sales invoice for a customer.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customerId: { type: 'STRING', description: 'Customer ID (e.g. 5000123456)' },
        amount: { type: 'NUMBER', description: 'Invoice amount in TL' },
        invoiceDate: { type: 'STRING', description: 'Date (YYYY-MM-DD)' },
        eDocumentNo: { type: 'STRING', description: 'Document number' },
        description: { type: 'STRING', description: 'Note' }
      },
      required: ['customerId', 'amount']
    }
  },
  {
    name: 'addManualCollection',
    description: 'Add a new manual collection / payment for a customer.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customerId: { type: 'STRING', description: 'Customer ID (e.g. 5000123456)' },
        amount: { type: 'NUMBER', description: 'Payment amount in TL' },
        date: { type: 'STRING', description: 'Date (YYYY-MM-DD)' },
        method: { type: 'STRING', description: 'Method: "NAKİT", "HAVALE", "KREDİ_KARTI"' },
        eDocumentNo: { type: 'STRING', description: 'Receipt number' },
        description: { type: 'STRING', description: 'Note' }
      },
      required: ['customerId', 'amount']
    }
  },
  {
    name: 'bulkDeleteTransactions',
    description: 'Toplu veri silme aracı.',
    parameters: {
      type: 'OBJECT',
      properties: {
        year: { type: 'NUMBER', description: 'Sadece bu yıla ait verileri sil' },
        customerId: { type: 'STRING', description: 'Sadece bu müşteriye ait verileri sil' },
        type: { type: 'STRING', description: 'Silinecek işlem türü: "SATIS", "TAHSILAT", "CEK", "TUMU"' }
      },
      required: ['type']
    }
  },
  {
    name: 'addVirmanTransfer',
    description: 'Transfer debt / balance from Source customer to Target customer.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sourceCustomerId: { type: 'STRING', description: 'Source customer ID' },
        targetCustomerId: { type: 'STRING', description: 'Target customer ID' },
        amount: { type: 'NUMBER', description: 'Transfer amount in TL' },
        date: { type: 'STRING', description: 'Date (YYYY-MM-DD)' },
        description: { type: 'STRING', description: 'Virman note' }
      },
      required: ['sourceCustomerId', 'targetCustomerId', 'amount']
    }
  },
  {
    name: 'getGlobalHighestTransactions',
    description: 'Get SINGLE highest record (tek bir rekor havale/fatura).',
    parameters: {
      type: 'OBJECT',
      properties: {
        type: { type: 'STRING', description: 'Transaction type: "TAHSILAT" or "SATIS"' },
        limit: { type: 'NUMBER', description: 'Number of records to return (default: 5)' }
      },
      required: []
    }
  },
  {
    name: 'getMonthlyComparisonReport',
    description: 'Compare sales, collections, and transactions between two months or date periods.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Optional customer name or code' },
        period1: { type: 'STRING', description: 'First month name or number' },
        period2: { type: 'STRING', description: 'Second month name or number' }
      },
      required: ['period1', 'period2']
    }
  },
  {
    name: 'getMonthlyRiskAndRevenueReport',
    description: 'Ay bazlı risk, ciro, tahsilat hacmi ve devreden borç yükünü detaylı hesaplar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        year: { type: 'STRING', description: 'Yıl' },
        month: { type: 'STRING', description: 'Ay' },
        query: { type: 'STRING', description: 'Müşteri adı/kodu' }
      },
      required: []
    }
  },
  {
    name: 'getCollectionBreakdown',
    description: 'Get global breakdown of collections by payment method.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },
  {
    name: 'getCustomerPaymentTrend',
    description: 'Get historical payment trend and actual payment days (3M, 6M, 12M days to pay).',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Customer query' }
      },
      required: []
    }
  },
  {
    name: 'calculateCustomerDebtToCollectionRisk',
    description: 'Calculates Debt-to-Collection Turnover Risk for a customer using Coverage Months = Net Debt / Monthly Avg Collection. Returns risk level (LOW, MEDIUM, HIGH) and turnover days.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Customer name, code (5000XXXXXX), or sign name' }
      },
      required: []
    }
  },
  {
    name: 'getDeepExecutiveAnalyticsOverview',
    description: 'Get deep executive analytics including 60+ days overdue customer list & ranking, 30k+ high risk customer list & ranking, active month vs previous month collection growth (MoM Growth), and top performing sales reps of the month.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },
  {
    name: 'deleteTransaction',
    description: 'Delete a specific transaction by ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'Transaction ID' },
        type: { type: 'STRING', description: 'Transaction type' }
      },
      required: ['id']
    }
  },
  {
    name: 'getCustomerCheques',
    description: 'Get cheques and senets list and total risk for a customer or globally.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customerId: { type: 'STRING', description: 'Customer ID' },
        query: { type: 'STRING', description: 'Search query' }
      },
      required: []
    }
  },
  {
    name: 'addManualCheque',
    description: 'Add a new cheque or senet record for a customer.',
    parameters: {
      type: 'OBJECT',
      properties: {
        customerId: { type: 'STRING', description: 'Customer ID' },
        type: { type: 'STRING', description: 'Type: "ÇEK" or "SENET"' },
        amount: { type: 'NUMBER', description: 'Amount in TL' },
        docNo: { type: 'STRING', description: 'Document number' },
        subNo: { type: 'STRING', description: 'Sub number' },
        dueDate: { type: 'STRING', description: 'Due date' },
        bankName: { type: 'STRING', description: 'Bank name' },
        status: { type: 'STRING', description: 'Status' }
      },
      required: ['customerId', 'amount']
    }
  },
  {
    name: 'purgeTestImportRecords',
    description: 'Veritabanındaki test/geçici aktarım kayıtlarını temizler.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },
  {
    name: 'runExcelVerificationTest',
    description: 'Run automated in-app test suite on uploaded or raw Excel file rows.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fileType: { type: 'STRING', description: 'File type' },
        userScenarios: { type: 'STRING', description: 'Custom test instructions' }
      },
      required: []
    }
  },
  {
    name: 'mapAndImportExcel',
    description: 'Bilinmeyen Excel formatını aktarır.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fileName: { type: 'STRING', description: 'File name' },
        targetType: { type: 'STRING', description: 'Target type' },
        customerIdField: { type: 'STRING', description: 'Customer ID field' },
        amountField: { type: 'STRING', description: 'Amount field' },
        defaultDate: { type: 'STRING', description: 'Default date' },
        defaultDescription: { type: 'STRING', description: 'Default description' }
      },
      required: ['fileName', 'targetType', 'customerIdField', 'amountField']
    }
  },
  {
    name: 'advancedMapAndImportExcel',
    description: 'Gelişmiş Excel dönüştürme ve aktarım.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fileName: { type: 'STRING', description: 'File name' },
        jsFunctionBody: { type: 'STRING', description: 'JS code body' }
      },
      required: ['fileName', 'jsFunctionBody']
    }
  },
  {
    name: 'getFinancialHealthReport',
    description: 'Get CFO Executive Financial Health Report.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search query' }
      },
      required: []
    }
  },
  {
    name: 'getParetoConcentrationAnalysis',
    description: 'Get Pareto (80/20) Sales Volume and Receivable Risk Concentration Analysis.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: []
    }
  },
  {
    name: 'importCustomerMaster',
    description: 'Yüklenen Müşteri Master Excel dosyasını aktarır.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fileName: { type: 'STRING', description: 'File name' }
      },
      required: []
    }
  },
  {
    name: 'getCollectionEffectivenessIndex',
    description: 'Get Collection Effectiveness Index (CEI %).',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search query' }
      },
      required: []
    }
  },
  {
    name: 'updateManualCheque',
    description: 'Update status of existing cheque/senet.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'Cheque ID' },
        status: { type: 'STRING', description: 'Status' },
        description: { type: 'STRING', description: 'Description' }
      },
      required: ['id']
    }
  },
  {
    name: 'deleteManualCheque',
    description: 'Delete cheque/senet from database.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: { type: 'STRING', description: 'Cheque ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'reconcileChequesWithExcel',
    description: 'Reconcile database cheques with uploaded Excel.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fileName: { type: 'STRING', description: 'File name' },
        action: { type: 'STRING', description: 'Action' }
      },
      required: []
    }
  },
  {
    name: 'readUploadedExcelData',
    description: 'Yüklenen geçici Excel dosyasının ham satırlarını okur.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fileName: { type: 'STRING', description: 'File name' },
        limit: { type: 'NUMBER', description: 'Limit' }
      },
      required: []
    }
  },
  {
    name: 'executeDynamicAnalyticsQuery',
    description: 'JOKER / MAXIMUM INTELLIGENCE SELF-EXTENDING TOOL.',
    parameters: {
      type: 'OBJECT',
      properties: {
        queryPurpose: { type: 'STRING', description: 'Purpose description' },
        jsFunctionBody: { type: 'STRING', description: 'JS Function body' }
      },
      required: ['queryPurpose', 'jsFunctionBody']
    }
  },
  {
    name: 'defineSubagent',
    description: 'Define brand-new subagent.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Name' },
        role: { type: 'STRING', description: 'Role' },
        description: { type: 'STRING', description: 'Description' },
        systemPrompt: { type: 'STRING', description: 'System prompt' }
      },
      required: ['name', 'role', 'description', 'systemPrompt']
    }
  },
  {
    name: 'invokeSubagent',
    description: 'Invoke subagent.',
    parameters: {
      type: 'OBJECT',
      properties: {
        subagentName: { type: 'STRING', description: 'Subagent name' },
        taskPrompt: { type: 'STRING', description: 'Task prompt' }
      },
      required: ['subagentName', 'taskPrompt']
    }
  }
];

export function getRelevantToolsForQuery(userMessage = '', attachments: any[] = []) {
  const query = (userMessage || '').toLowerCase();
  const hasAttachments = attachments && attachments.length > 0;

  const isGlobalRecordIntent = /(şirketin en yüksek|tüm veritabanı en yüksek|milyonluk havale|milyonluk işlem|rekor tahsilat|tüm zamanların en büyük)/i.test(query);
  const isSpecificCustomerOrDateIntent = /(faturası|fatura|tarihli|ekstresi|son 5|bakkal|market|büfe|tekel|şarküteri|lokanta|pub|bar|oteller|\bltd\b|\baş\b|\ba\.ş\b|\bkafe\b|gıda|ticaret|shop|marketleri)/i.test(query) ||
    /\b(\d{1,2})\s+([a-zA-ZğüşıöçĞÜŞİÖÇ]+)\b/i.test(query);

  const isMutationIntent = /(ekle|yükle|sil|düzelt|virman|transfer|fatura kes|tahsilat al|çek ekle|purge|temizle|güncelle|devir|işle|kaydet|yansıt|aktar)/i.test(query);
  const isExcelIntent = hasAttachments || /(excel|dosya|aktarım|aktar|tanımsız|mapping|import|sütun|devir bakiy|bakiye devri|devir yap|devir işle|01\.01\.2026)/i.test(query);
  const isAnalyticsIntent = /(rapor| trend|aylık|karşılaştır|kıyasla|pareto|cei|sağlık|sağlığı|cfo|risk|tahsilat tür|ödeme yöntem|yaşlandırma|temsilci|çek|senet)/i.test(query);

  const coreToolNames = [
    'getGlobalFinancialSummary',
    'getCurrentStatus',
    'searchCustomers',
    'getCustomerDetails',
    'getCustomerStatement',
    'queryTransactions',
    'getTopDebtors',
    'getTopCustomersBySalesVolume',
    'getFinancialHealthReport',
    'getMonthlyRiskAndRevenueReport',
    'getInvoiceControlReport',
    'executeDynamicAnalyticsQuery',
    'defineSubagent',
    'invokeSubagent'
  ];

  const selectedToolNames = new Set(coreToolNames);

  if (isGlobalRecordIntent) {
    selectedToolNames.add('getGlobalHighestTransactions');
  }

  if (isAnalyticsIntent) {
    selectedToolNames.add('getAgingBreakdown');
    selectedToolNames.add('getPaymentMethodsBreakdown');
    selectedToolNames.add('getSalesRepSummary');
    selectedToolNames.add('getMonthlyComparisonReport');
    selectedToolNames.add('getCollectionBreakdown');
    selectedToolNames.add('getCustomerPaymentTrend');
    selectedToolNames.add('getParetoConcentrationAnalysis');
    selectedToolNames.add('getCollectionEffectivenessIndex');
    selectedToolNames.add('getCustomerCheques');
  }

  if (isMutationIntent) {
    selectedToolNames.add('addManualInvoice');
    selectedToolNames.add('addManualCollection');
    selectedToolNames.add('addVirmanTransfer');
    selectedToolNames.add('deleteTransaction');
    selectedToolNames.add('bulkDeleteTransactions');
    selectedToolNames.add('addManualCheque');
    selectedToolNames.add('updateManualCheque');
    selectedToolNames.add('deleteManualCheque');
    selectedToolNames.add('reconcileChequesWithExcel');
    selectedToolNames.add('purgeTestImportRecords');
  }

  if (isExcelIntent) {
    selectedToolNames.add('readUploadedExcelData');
    selectedToolNames.add('runExcelVerificationTest');
    selectedToolNames.add('mapAndImportExcel');
    selectedToolNames.add('advancedMapAndImportExcel');
    selectedToolNames.add('reconcileChequesWithExcel');
  }

  if (isSpecificCustomerOrDateIntent && !isGlobalRecordIntent) {
    selectedToolNames.delete('getGlobalHighestTransactions');
  }

  return aiToolDeclarations.filter(t => selectedToolNames.has(t.name));
}

export async function executeAiTool(toolName: string, args: any = {}): Promise<any> {
  await waitForInit();
  try {
    const MUTATING_TOOLS = [
      'addManualInvoice',
      'addManualCollection',
      'addVirmanTransfer',
      'deleteTransaction',
      'bulkDeleteTransactions',
      'addManualCheque',
      'updateManualCheque',
      'deleteManualCheque',
      'reconcileChequesWithExcel',
      'mapAndImportExcel',
      'advancedMapAndImportExcel',
      'importCustomerMaster',
      'processCustomerMasterImport',
      'purgeTestImportRecords',
      'resetAndClearArchive',
      'clearAllDataArchive'
    ];
    if (MUTATING_TOOLS.includes(toolName) && !isAdminAuthenticated()) {
      return {
        error: 'ADMIN_REQUIRED',
        status: 'DENIED',
        message: '🔒 Bu işlem veritabanında değişiklik (Yükleme/Silme/Ekleme) gerektirdiği için yalnızca Admin yetkisiyle yapılabilir. Lütfen sohbet paneli başlığındaki kilit simgesinden Admin Girişi yapınız.'
      };
    }
    switch (toolName) {
      case 'defineSubagent': {
        const { name, role, description, systemPrompt } = args || {};
        if (!name || !role) {
          return { status: 'ERROR', message: 'Alt-ajan ismi ve rolü belirtilmelidir.' };
        }
        const newAgentObj = {
          name,
          role,
          description: description || role,
          systemPrompt: systemPrompt || role,
          createdTime: new Date().toISOString()
        };
        dynamicSubagentsRegistry[name] = newAgentObj;
        savePersistedSubagent(newAgentObj);
        return {
          status: 'SUCCESS',
          subagentName: name,
          role,
          message: `🤖 "${role}" (${name}) alt-ajan tipi başarıyla dinamik olarak oluşturuldu ve kalıcı sisteme kaydedildi.`
        };
      }

      case 'invokeSubagent': {
        const { subagentName, taskPrompt } = args || {};
        const persisted = getPersistedSubagents();
        const agent = dynamicSubagentsRegistry[subagentName] || persisted[subagentName];
        if (!agent) {
          return {
            status: 'ERROR',
            message: `"${subagentName}" adında tanımlı bir alt-ajan bulunamadı. Lütfen önce defineSubagent aracı ile alt-ajanı tanımlayın.`
          };
        }
        return {
          status: 'SUCCESS',
          isSubagentInvocation: true,
          subagentName,
          role: agent.role,
          systemPrompt: agent.systemPrompt,
          taskPrompt,
          summary: `🚀 [Alt-Ajan: ${agent.role}] Görev icra ediliyor: "${taskPrompt || agent.description}"`
        };
      }

      case 'executeDynamicAnalyticsQuery': {
        return executeDynamicAnalyticsQuerySync(args || {});
      }

      case 'getFinancialHealthReport': {
        const query = args.query || '';
        return getFinancialHealthReportSync(query);
      }

      case 'getInvoiceControlReport': {
        return getInvoiceControlReportSync(args);
      }

      case 'getParetoConcentrationAnalysis': {
        return getParetoConcentrationAnalysisSync();
      }

      case 'getCollectionEffectivenessIndex': {
        const query = args.query || '';
        return getCollectionEffectivenessIndexSync(query);
      }

      case 'getGlobalHighestTransactions': {
        const type = (args.type || 'TAHSILAT').toUpperCase();
        const limit = args.limit || 5;
        const res = getGlobalHighestTransactionsSync({ type, limit });
        const top = res[0] || null;
        return {
          type,
          count: res.length,
          highestRecord: top,
          transactions: res,
          summary: top
            ? `Tüm veritabanı genelinde en yüksek ${type} işlemi: ${top.formattedAmount} (Müşteri: ${top.customerName}, Tarih: ${top.formattedDate})`
            : 'Kayıt bulunamadı'
        };
      }

      case 'getMonthlyComparisonReport': {
        const query = args.query || '';
        const period1 = args.period1 || 'Nisan';
        const period2 = args.period2 || 'Mayıs';
        return getMonthlyComparisonSync({ query, period1, period2 });
      }

      case 'getMonthlyRiskAndRevenueReport': {
        return getMonthlyRiskAndRevenueReportSync(args || {});
      }

      case 'getCollectionBreakdown': {
        const chartData = getDashboardChartDataSync();
        const breakdown = chartData.tahsilatData || [];
        const total = breakdown.reduce((sum: number, item: any) => sum + (item.value || 0), 0);
        return {
          totalCollections: formatCurrency(total),
          breakdown: breakdown.map((item: any) => ({
            method: item.name,
            amount: formatCurrency(item.value),
            rawAmount: item.value,
            percentage: total > 0 ? `${((item.value / total) * 100).toFixed(1)}%` : '0%'
          }))
        };
      }

      case 'getCustomerPaymentTrend': {
        const query = args.query || '';
        return getCustomerPaymentTrendSync(query);
      }

      case 'getGlobalFinancialSummary': {
        const summary = getGlobalFinancialSummarySync();
        return {
          totalSales: formatCurrency(summary.totalSalesAmount || summary.totalSales || 0),
          totalCollections: formatCurrency(summary.totalCollectionAmount || summary.totalCollections || 0),
          totalCreditNotes: formatCurrency(summary.totalCreditNoteAmount || summary.totalCreditNotes || 0),
          netReceivables: formatCurrency(summary.totalNetReceivables || summary.netReceivables || 0),
          raw: summary
        };
      }

      case 'getCurrentStatus': {
        const status = getCurrentStatusSync();
        return {
          openInvoicesCount: status.openInvoiceCount || status.openInvoicesCount || 0,
          todayCollections: formatCurrency(status.todayCollections || 0),
          averageTermDays: typeof status.portfolioAverageTerm === 'number' ? `${status.portfolioAverageTerm} gün` : '0 gün',
          raw: status
        };
      }

      case 'searchCustomers': {
        const results = searchCustomersSync(args.query || '', true);
        return {
          count: results.length,
          customers: results.slice(0, 15).map((c: any) => ({
            customerId: c.customerId,
            customerName: c.customerName,
            signName: c.signName,
            salesRep: c.salesRep,
            cityDistrict: `${c.province || ''}/${c.district || ''}`,
            balance: formatCurrency(c.balance || 0),
            rawBalance: c.balance || 0
          }))
        };
      }

      case 'getCustomerDetails': {
        const customer = await getCustomerById(args.customerId, true);
        if (!customer) {
          return { error: `Müşteri bulunamadı: ${args.customerId}` };
        }
        const mapsQuery = encodeURIComponent(`${customer.signName || customer.customerName} ${customer.district || ''} ${customer.province || ''}`);
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

        return {
          customerId: customer.customerId,
          customerName: customer.customerName,
          signName: customer.signName,
          salesRep: customer.salesRep,
          phone: customer.phone || 'Belirtilmedi',
          cityDistrict: `${customer.province || ''}/${customer.district || ''}`,
          googleMapsUrl: googleMapsUrl,
          googleMapsLinkMarkdown: `[🗺️ Google Haritalar Konumunda Aç](${googleMapsUrl})`,
          status: customer.customerStatus,
          balance: formatCurrency(customer.balance || 0),
          rawBalance: customer.balance || 0
        };
      }

      case 'getCustomerStatement': {
        const stmt = await getCustomerStatement(args.customerId);
        if (!stmt || !stmt.customer) {
          return { error: `Müşteri bulunamadı veya işlem geçmişi yok: ${args.customerId}` };
        }
        return {
          customer: {
            customerId: stmt.customer.customerId,
            name: stmt.customer.customerName,
            signName: stmt.customer.signName,
            balance: formatCurrency(stmt.customer.balance || 0)
          },
          summary: {
            totalSales: formatCurrency(stmt.summary.totalSales),
            totalCollections: formatCurrency(stmt.summary.totalCollections),
            totalCreditNotes: formatCurrency(stmt.summary.totalCreditNotes)
          },
          aging: {
            current: formatCurrency(stmt.aging.current),
            days30: formatCurrency(stmt.aging.days30),
            days60: formatCurrency(stmt.aging.days60),
            days90Plus: formatCurrency(stmt.aging.days90 + stmt.aging.over90),
            averageVade: stmt.aging.averageVade ? `${stmt.aging.averageVade} gün` : 'Vade aşımı yok'
          },
          openInvoiceCount: (stmt.openInvoices || []).length,
          totalOpenAmount: formatCurrency((stmt.openInvoices || []).reduce((sum: number, i: any) => sum + i.openAmount, 0)),
          openInvoices: (stmt.openInvoices || []).map((inv: any) => ({
            invoiceDate: formatDate(inv.invoiceDate),
            eDocumentNo: inv.eDocumentNo,
            originalAmount: formatCurrency(inv.originalAmount),
            openAmount: formatCurrency(inv.openAmount),
            daysOverdue: `${inv.daysOverdue} gün`,
            isPartial: inv.isPartial
          })),
          recentTransactions: (stmt.transactions || []).slice(-10).map((t: any) => ({
            date: formatDate(t.date),
            docNo: t.docNo,
            type: t.type,
            amount: formatCurrency(t.credit || t.debit),
            runningBalance: formatCurrency(t.balance || 0)
          })),
          exportButtonsMarkdown: `\n\n### 📥 Kurumsal Çıktı & Döküm İşlemleri\n[🖨️ PDF / A4 Yazdır](https://action-pdf-${stmt.customer.customerId}) [📊 Excel İndir (.xlsx)](https://action-excel-${stmt.customer.customerId}) [🏢 Ekstre Modalı Aç](https://action-modal-${stmt.customer.customerId})\n`
        };
      }

      case 'queryTransactions': {
        const query = (args.query || '').trim();
        const transactionType = (args.transactionType || 'ALL').toUpperCase();
        const sortBy = (args.sortBy || 'LATEST').toUpperCase();
        const limit = args.limit || 10;

        if (!query && sortBy === 'HIGHEST_AMOUNT') {
          const targetType = (transactionType === 'SATIS' || transactionType === 'SALE' || transactionType === 'FATURA') ? 'SATIS' : 'TAHSILAT';
          const globalHighest = getGlobalHighestTransactionsSync({ type: targetType, limit });
          const top = globalHighest[0] || null;

          return {
            searchType: 'GLOBAL_TOP_TRANSACTIONS',
            transactionType: targetType,
            totalCount: globalHighest.length,
            highestRecord: top,
            summary: top
              ? `Tüm veritabanı genelinde en yüksek ${targetType} işlemi: ${top.formattedAmount} (Müşteri: ${top.customerName}, Tarih: ${top.formattedDate})`
              : 'Kayıt bulunamadı',
            transactions: globalHighest.map((t: any) => ({
              rank: t.rank,
              customerName: t.customerName,
              signName: t.signName,
              salesRep: t.salesRep,
              amount: t.formattedAmount,
              rawAmount: t.amount,
              date: t.formattedDate,
              methodOrDocNo: t.method || t.eDocumentNo || '-'
            }))
          };
        }

        let matchedCustomers: any[] = [];
        if (query) {
          const cleanedQuery = query
            .replace(/\b(\d{1,2})\s+([a-zA-ZğüşıöçĞÜŞİÖÇ]+)(?:\s+(\d{4}))?\b/gi, '')
            .replace(/\b\d{4}[-/. ]\d{1,2}[-/. ]\d{1,2}\b/g, '')
            .replace(/(faturası|fatura|tarihli|tahsilatı|tahsilat|ödemesi|ödeme|dekontu|ekstresi|son|geçmiş|açık)/gi, '')
            .trim();

          const searchQuery = cleanedQuery.length >= 2 ? cleanedQuery : query;
          matchedCustomers = searchCustomersSync(searchQuery, true);
          if (matchedCustomers.length === 0 && searchQuery !== query) {
            matchedCustomers = searchCustomersSync(query, true);
          }
          if (matchedCustomers.length === 0) {
            const all = getAllCustomersForReportingSync();
            const qLower = searchQuery.toLowerCase();
            matchedCustomers = all.filter(c =>
              c.customerId.includes(qLower) ||
              (c.customerName || '').toLowerCase().includes(qLower) ||
              (c.signName || '').toLowerCase().includes(qLower) ||
              (c.salesRep || '').toLowerCase().includes(qLower)
            );

            if (matchedCustomers.length === 0) {
              const tokens = searchQuery.split(/\s+/).filter(t => t.length >= 3 && !['shop', 'ltd', 'şti', 'gıda', 'ticaret', 'market', 'büfe'].includes(t));
              for (const token of tokens) {
                const tokenMatches = all.filter(c =>
                  (c.customerName || '').toLowerCase().includes(token) ||
                  (c.signName || '').toLowerCase().includes(token)
                );
                if (tokenMatches.length > 0) {
                  matchedCustomers = tokenMatches;
                  break;
                }
              }
            }
          }
        }

        if (matchedCustomers.length === 0) {
          return {
            status: 'CUSTOMER_NOT_FOUND',
            searchedQuery: query,
            message: `Veritabanı arşivinde "${query}" aramasına uygun bir müşteri kaydı bulunamadı.`,
            instruction: 'Kullanıcıya bu isimde bir müşteri bulunamadığını söyle. SAKIN getGlobalHighestTransactions ÇAĞIRMA veya şirket rekorlarını sunma!'
          };
        }

        const results: any[] = [];

        for (const cust of matchedCustomers.slice(0, 5)) {
          const stmt = await getCustomerStatement(cust.customerId);
          if (!stmt) continue;

          if (transactionType === 'ACIK_FATURA' || transactionType === 'OPEN_INVOICE') {
            const openInvoices = stmt.openInvoices || [];
            results.push({
              customer: {
                customerId: cust.customerId,
                customerName: cust.customerName,
                signName: cust.signName,
                balance: formatCurrency(cust.balance || 0),
                rawBalance: cust.balance || 0
              },
              averageVade: stmt.aging?.averageVade ? `${stmt.aging.averageVade} gün` : 'Vade aşımı yok (Bakiye ≤ 0)',
              openInvoiceCount: openInvoices.length,
              totalOpenAmount: formatCurrency(openInvoices.reduce((sum: number, i: any) => sum + i.openAmount, 0)),
              openInvoices: openInvoices.map((inv: any) => ({
                invoiceDate: formatDate(inv.invoiceDate),
                eDocumentNo: inv.eDocumentNo,
                originalAmount: formatCurrency(inv.originalAmount),
                openAmount: formatCurrency(inv.openAmount),
                daysOverdue: `${inv.daysOverdue} gün`,
                isPartial: inv.isPartial
              }))
            });
            continue;
          }

          if (!stmt.transactions) continue;
          let txs = [...stmt.transactions];

          if (transactionType === 'TAHSILAT' || transactionType === 'COLLECTION') {
            txs = txs.filter(t => (t.type || '').includes('TAHSİLAT'));
          } else if (transactionType === 'SATIS' || transactionType === 'SALE') {
            txs = txs.filter(t => (t.type || '') === 'SATIŞ');
          } else if (transactionType === 'DEKONT' || transactionType === 'CREDIT_NOTE') {
            txs = txs.filter(t => (t.type || '').includes('ALACAK DEKONTU'));
          }

          const dateMatch = query.match(/\b(\d{1,2})\s+([a-zA-ZğüşıöçĞÜŞİÖÇ]+)(?:\s+(\d{4}))?\b/i);
          if (dateMatch) {
            const day = parseInt(dateMatch[1], 10);
            const monthNames = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
            const mIdx = monthNames.indexOf(dateMatch[2].toLowerCase());
            if (day && mIdx !== -1) {
              const padDay = String(day).padStart(2, '0');
              const padMonth = String(mIdx + 1).padStart(2, '0');
              const targetPattern = `-${padMonth}-${padDay}`;
              const dateFiltered = txs.filter(t => String(t.date).includes(targetPattern));
              
              if (dateFiltered.length === 0) {
                const targetDateFormatted = `2026-${padMonth}-${padDay}`;
                const ctrlReport = getInvoiceControlReportSync({ date: targetDateFormatted, query: cust.customerName || cust.signName });
                const matchedInReport = (ctrlReport.customers || []).find((c: any) =>
                  c.customerId === cust.customerId ||
                  (c.customerName || '').toLowerCase().includes((cust.customerName || '').toLowerCase()) ||
                  (c.signName || '').toLowerCase().includes((cust.signName || '').toLowerCase())
                );

                if (matchedInReport && (matchedInReport.invoiceTotal > 0 || matchedInReport.collectionTotal > 0)) {
                  txs = [{
                    date: targetDateFormatted,
                    type: matchedInReport.invoiceTotal > 0 ? 'SATIŞ' : 'TAHSİLAT',
                    docNo: 'FATURA_KONTROL',
                    debit: matchedInReport.invoiceTotal || 0,
                    credit: matchedInReport.collectionTotal || 0,
                    description: `Fatura Kontrol Kaydı (${targetDateFormatted}) - Fatura: ${formatCurrency(matchedInReport.invoiceTotal || 0)}, Tahsilat: ${formatCurrency(matchedInReport.collectionTotal || 0)}`
                  }];
                } else {
                  results.push({
                    customer: {
                      customerId: cust.customerId,
                      customerName: cust.customerName,
                      signName: cust.signName,
                      balance: formatCurrency(cust.balance || 0)
                    },
                    requestedDate: dateMatch[0],
                    transactionCount: 0,
                    message: `"${cust.signName || cust.customerName}" için ${dateMatch[0]} tarihinde herhangi bir işlem kaydı bulunamadı.`,
                    instruction: 'Kullanıcıya bu müşterinin belirtilen tarihte faturası olmadığını net olarak söyle. SAKIN başka müşterinin veya şirket rekorlarının faturalarını gösterme!'
                  });
                  continue;
                }
              } else {
                txs = dateFiltered;
              }
            }
          }

          if (sortBy === 'LATEST') {
            txs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          } else if (sortBy === 'OLDEST') {
            txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          } else if (sortBy === 'HIGHEST_AMOUNT') {
            txs.sort((a, b) => (b.credit || b.debit) - (a.credit || a.debit));
          }

          const slicedTxs = txs.slice(0, limit).map(t => ({
            date: formatDate(t.date),
            rawDate: t.date,
            type: t.type,
            docNo: t.docNo,
            amount: formatCurrency(t.credit || t.debit),
            rawAmount: t.credit || t.debit,
            description: t.description
          }));

          results.push({
            customer: {
              customerId: cust.customerId,
              customerName: cust.customerName,
              signName: cust.signName,
              balance: formatCurrency(cust.balance || 0)
            },
            averageVade: stmt.aging?.averageVade ? `${stmt.aging.averageVade} gün` : 'Vade aşımı yok',
            transactionCount: txs.length,
            transactions: slicedTxs
          });
        }

        return {
          matchedCustomerCount: matchedCustomers.length,
          query: query,
          results
        };
      }

      case 'getSalesRepSummary': {
        const all = getAllCustomersForReportingSync();
        const repMap: Record<string, any> = {};

        for (const c of all) {
          const rep = c.salesRep || 'Temsilci Belirtilmemiş';
          if (!repMap[rep]) {
            repMap[rep] = { salesRep: rep, customerCount: 0, totalBalance: 0 };
          }
          repMap[rep].customerCount++;
          repMap[rep].totalBalance += (c.balance || 0);
        }

        const reps = Object.values(repMap).sort((a: any, b: any) => b.totalBalance - a.totalBalance);

        return {
          salesReps: reps.map((r: any) => ({
            salesRep: r.salesRep,
            customerCount: r.customerCount,
            totalBalance: formatCurrency(r.totalBalance),
            rawBalance: r.totalBalance
          }))
        };
      }

      case 'getTopDebtors': {
        const limit = args.limit || 10;
        const all = getAllCustomersForReportingSync();
        const top = all
          .filter(c => (c.balance || 0) > 0)
          .sort((a, b) => (b.balance || 0) - (a.balance || 0))
          .slice(0, limit);

        return {
          count: top.length,
          criteria: 'Borç Bazlı (Açık Pozitif Cari Bakiye)',
          debtors: top.map((c, idx) => ({
            rank: idx + 1,
            customerId: c.customerId,
            customerName: c.customerName || c.signName,
            signName: c.signName || c.customerName,
            salesRep: c.salesRepName || c.salesRep || 'Key Account',
            balance: formatCurrency(c.balance),
            cekSenet: c.cekSenet ? formatCurrency(c.cekSenet) : '₺0,00',
            toplamRisk: formatCurrency(c.toplamRisk || c.balance),
            rawBalance: c.balance
          }))
        };
      }

      case 'getTopCustomersBySalesVolume': {
        const top = getTopCustomersBySalesVolumeSync(args);
        return {
          count: top.length,
          criteria: 'Ciro Bazlı (Satış Hacmi / SATIS Faturaları)',
          periodLabel: top[0]?.periodLabel || 'Tüm Zamanlar Kümülatif',
          note: 'Bakiyesi alacaklı/sıfır olan yüksek cirolu müşteriler de dahildir.',
          customers: top
        };
      }

      case 'getAgingBreakdown': {
        const chartData = getDashboardChartDataSync();
        return {
          agingBuckets: (chartData.vadeData || []).map((b: any) => ({
            range: b.name,
            amount: formatCurrency(b.value),
            rawAmount: b.value
          }))
        };
      }

      case 'getPaymentMethodsBreakdown': {
        const chartData = getDashboardChartDataSync();
        return {
          methods: (chartData.tahsilatData || []).map((m: any) => ({
            method: m.name,
            amount: formatCurrency(m.value),
            rawAmount: m.value
          }))
        };
      }

      case 'addManualInvoice': {
        const inv = await addManualInvoice(args);
        return {
          success: true,
          message: `Manuel fatura başarıyla eklendi: ${inv.invoiceId}`,
          invoice: {
            invoiceId: inv.invoiceId,
            customerId: inv.customerId,
            amount: formatCurrency(inv.amount),
            date: formatDate(inv.invoiceDate)
          }
        };
      }

      case 'addManualCollection': {
        const col = await addManualCollection(args);
        return {
          success: true,
          message: `Manuel tahsilat başarıyla eklendi: ${col.collectionId}`,
          collection: {
            collectionId: col.collectionId,
            customerId: col.customerId,
            amount: formatCurrency(col.amount),
            method: col.method,
            date: formatDate(col.date)
          }
        };
      }

      case 'addVirmanTransfer': {
        const res = await addVirmanTransfer(args);
        return {
          success: true,
          message: `Cariler arası virman transferi yapıldı (Belge No: ${res.virmanDocNo})`,
          virmanDocNo: res.virmanDocNo
        };
      }

      case 'deleteTransaction': {
        const res = await deleteTransactionRecord(args);
        return {
          success: true,
          message: `İşlem başarıyla silindi (ID: ${args.id})`,
          deletedId: args.id
        };
      }

      case 'bulkDeleteTransactions': {
        if (!isAdminAuthenticated()) return { error: 'Bu işlem için Admin girişi yapılması gereklidir.' };
        const res = await bulkDeleteTransactions(args);
        return {
          success: true,
          message: `Kriterlere uyan toplam ${res.deletedCount} adet işlem kalıcı olarak silindi.`,
          deletedCount: res.deletedCount
        };
      }

      case 'getCustomerCheques': {
        let cid = args.customerId;
        if (!cid && args.query) {
          const matches = searchCustomersSync(args.query, true);
          if (matches.length > 0) cid = matches[0].customerId;
        }
        const list = getCustomerChequesSync(cid);
        const totalRisk = list.reduce((s: number, c: any) => s + (c.amount || 0), 0);
        return {
          count: list.length,
          totalChequeRisk: formatCurrency(totalRisk),
          rawTotalRisk: totalRisk,
          cheques: list.map((ch: any) => ({
            id: ch.id,
            docNo: ch.docNo,
            subNo: ch.subNo,
            customerId: ch.customerId,
            customerName: ch.customerName,
            type: ch.type,
            issueDate: formatDate(ch.issueDate),
            dueDate: formatDate(ch.dueDate),
            amount: formatCurrency(ch.amount),
            rawAmount: ch.amount,
            bankName: ch.bankName || ch.description || '-',
            status: ch.status
          }))
        };
      }

      case 'addManualCheque': {
        const res = await addManualCheque(args);
        return {
          success: true,
          message: `${res.type} kaydı/güncellemesi başarıyla eklendi (${res.docNo})`,
          cheque: res
        };
      }

      case 'updateManualCheque': {
        const res = await updateManualCheque(args.id, { status: args.status || 'IADE', description: args.description || 'AI Güncelleme' });
        return {
          success: true,
          message: `Çek/Senet durumu '${args.status || 'IADE'}' olarak güncellendi (ID: ${args.id})`,
          cheque: res
        };
      }

      case 'deleteManualCheque': {
        await deleteManualCheque(args.id);
        return {
          success: true,
          message: `Çek/Senet kaydı veritabanından başarıyla silindi (ID: ${args.id})`
        };
      }

      case 'reconcileChequesWithExcel': {
        let rows = rawExcelCache.get(args.fileName);
        if (!rows || rows.length === 0) {
          const cachedKeys = Array.from(rawExcelCache.keys());
          if (cachedKeys.length > 0) {
            rows = rawExcelCache.get(cachedKeys[cachedKeys.length - 1]);
          }
        }
        if (!rows || rows.length === 0) return { error: 'Karşılaştırılacak Excel dosyası bulunamadı.' };

        const excelDocNos = new Set<string>();
        const excelAmounts = new Set<number>();
        for (const r of rows) {
          for (const k of Object.keys(r)) {
            const val = String(r[k] || '').trim();
            if (val) excelDocNos.add(val.toLowerCase());
            const num = parseFloat(String(r[k]).replace(/[^\d\.]/g, ''));
            if (!isNaN(num) && num > 0) excelAmounts.add(num);
          }
        }

        const allCheques = getCustomerChequesSync();
        const action = (args.action || 'IADE').toUpperCase();
        
        const processedCheques: any[] = [];
        let processedCount = 0;
        let totalProcessedAmount = 0;

        for (const ch of allCheques) {
          const docMatch = ch.docNo && excelDocNos.has(String(ch.docNo).toLowerCase());
          const amtMatch = ch.amount && excelAmounts.has(ch.amount);
          
          if (!docMatch && !amtMatch) {
            if (action === 'DELETE') {
              await deleteManualCheque(ch.id);
            } else {
              await updateManualCheque(ch.id, { status: 'IADE', description: 'Excel Karşılaştırma - İade Edildi' });
            }
            processedCount++;
            totalProcessedAmount += (ch.amount || 0);
            processedCheques.push(ch);
          }
        }

        await waitForInit();
        return {
          success: true,
          actionApplied: action === 'DELETE' ? 'SİLİNDİ' : 'İADE EDİLDİ',
          processedCount,
          totalProcessedAmount: formatCurrency(totalProcessedAmount),
          processedCheques: processedCheques.map(c => ({
            docNo: c.docNo,
            customerName: c.customerName,
            amount: formatCurrency(c.amount),
            status: action === 'DELETE' ? 'SİLİNDİ' : 'İADE'
          }))
        };
      }

      case 'runExcelVerificationTest': {
        let inputRows = args.rows;
        if (!inputRows || inputRows.length === 0) {
          const type = (args.fileType || 'SATIS').toUpperCase();
          if (type.includes('CEK') || type.includes('SENET')) {
            inputRows = getCustomerChequesSync();
          } else {
            inputRows = getAllCustomersForReportingSync();
          }
        }
        const res = runExcelVerificationTest(inputRows, args.fileType || 'AUTO', args.userScenarios || '');
        return {
          testReport: res.reportMarkdown,
          passed: res.passedCount,
          failed: res.failedCount,
          warnings: res.warningCount,
          summary: res.reportMarkdown
        };
      }

      case 'importCustomerMaster':
      case 'processCustomerMasterImport': {
        if (!isAdminAuthenticated()) return { error: 'Bu işlem için Admin girişi yapılması gereklidir.' };
        let rows = rawExcelCache.get(args.fileName);
        if (!rows || rows.length === 0) {
          const cachedKeys = Array.from(rawExcelCache.keys());
          if (cachedKeys.length > 0) {
            rows = rawExcelCache.get(cachedKeys[cachedKeys.length - 1]);
          }
        }
        if (!rows || rows.length === 0) return { error: 'Önbellekte yüklü Müşteri Master Excel verisi bulunamadı. Lütfen önce Müşteri Master Excel dosyanızı ekleyiniz.' };

        const { parseCustomerMaster } = await import('../parsers/customerMasterParser');
        const { archiveCustomers } = await import('./archiveService');
        const parsed = parseCustomerMaster(rows);
        const res = await archiveCustomers(parsed.records);
        await waitForInit();
        return {
          success: true,
          added: res.added,
          skippedDuplicate: res.skippedDuplicate,
          warnings: parsed.warnings,
          summaryReport: `📊 **Veritabanı İnceleme ve Eşleştirme Raporu (Müşteri Master Listesi):**\n\n• 🛡️ **Mükerrer Kayıt Koruması:** **${res.skippedDuplicate} Adet** kayıt veritabanında zaten var olduğu için **görmezden gelindi (korundu).**\n• 📥 **Yeni Eklenen Cariler:** **${res.added} Adet** veritabanında olmayan yeni müşteri sisteme **kaydedildi!**`
        };
      }

      case 'mapAndImportExcel': {
        if (!isAdminAuthenticated()) return { error: 'Bu işlem için Admin girişi yapılması gereklidir.' };
        let rows = rawExcelCache.get(args.fileName);
        if (!rows || rows.length === 0) {
          const cachedKeys = Array.from(rawExcelCache.keys());
          if (cachedKeys.length > 0) {
            rows = rawExcelCache.get(cachedKeys[cachedKeys.length - 1]);
          }
        }
        if (!rows || rows.length === 0) return { error: 'Dosya önbellekte bulunamadı veya boş.' };
        
        const mappedRecords: any[] = [];
        let skipped = 0;

        let index = 0;
        for (const row of rows) {
          const cid = row[args.customerIdField];
          const amount = row[args.amountField];
          if (!cid || amount === undefined) {
            skipped++;
            continue;
          }
          
          index++;
          if (args.targetType === 'SATIS') {
            mappedRecords.push({
              invoiceId: `MANUAL-EXCEL-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`,
              customerId: String(cid).trim(),
              amount: parseFloat(amount) || 0,
              invoiceDate: args.defaultDate || new Date().toISOString().split('T')[0],
              eDocumentNo: 'ÖZEL_AKTARIM',
              description: args.defaultDescription || 'Tanımsız Excel Aktarımı'
            });
          } else if (args.targetType === 'TAHSILAT') {
            mappedRecords.push({
              collectionId: `MANUAL-EXCEL-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`,
              customerId: String(cid).trim(),
              amount: parseFloat(amount) || 0,
              date: args.defaultDate || new Date().toISOString().split('T')[0],
              method: 'HAVALE',
              eDocumentNo: 'ÖZEL_AKTARIM',
              description: args.defaultDescription || 'Tanımsız Excel Aktarımı'
            });
          } else if (args.targetType === 'CEK') {
            mappedRecords.push({
              id: `MANUAL-EXCEL-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`,
              docNo: 'ÖZEL_AKTARIM',
              customerId: String(cid).trim(),
              amount: parseFloat(amount) || 0,
              issueDate: args.defaultDate || new Date().toISOString().split('T')[0],
              dueDate: args.defaultDate || new Date().toISOString().split('T')[0],
              type: 'ÇEK',
              status: 'PORTFOY'
            });
          }
        }
        
        if (mappedRecords.length > 0) {
          if (args.targetType === 'SATIS') await archiveSalesInvoices(mappedRecords);
          else if (args.targetType === 'TAHSILAT') await archiveCollections(mappedRecords);
          else if (args.targetType === 'CEK') await archiveCheques(mappedRecords);
          
          await waitForInit();
          return { success: true, processed: mappedRecords.length, addedRecords: mappedRecords.length, skipped, message: `BAŞARILI! Toplam ${mappedRecords.length} kayıt veritabanına eklendi.` };
        } else {
          return { error: 'Geçerli müşteri/tutar bilgisi içeren satır bulunamadı.', skipped };
        }
      }

      case 'advancedMapAndImportExcel': {
        if (!isAdminAuthenticated()) return { error: 'Bu işlem için Admin girişi yapılması gereklidir.' };
        let rows = rawExcelCache.get(args.fileName);
        if (!rows || rows.length === 0) {
          const cachedKeys = Array.from(rawExcelCache.keys());
          if (cachedKeys.length > 0) {
            rows = rawExcelCache.get(cachedKeys[cachedKeys.length - 1]);
          }
        }
        if (!rows || rows.length === 0) return { error: 'Dosya önbellekte bulunamadı veya boş.' };
        
        let processor: Function;
        try {
          processor = new Function('row', args.jsFunctionBody);
        } catch (err: any) {
          return { error: 'Oluşturulan JS kodu derlenemedi: ' + err.message };
        }

        const parseAmountHelper = (val: any) => {
          if (val === null || val === undefined) return 0;
          if (typeof val === 'number') return isNaN(val) ? 0 : val;
          let str = String(val).replace(/[^\d\.,\-]/g, '').trim();
          if (str.includes('.') && str.includes(',')) {
            str = str.replace(/\./g, '').replace(',', '.');
          } else if (str.includes(',')) {
            str = str.replace(',', '.');
          }
          return parseFloat(str) || 0;
        };

        const getRowValueHelper = (row: any, targetKey: string) => {
          if (!row || !targetKey) return undefined;
          if (row[targetKey] !== undefined) return row[targetKey];
          const normTarget = String(targetKey).replace(/[\s\u00A0]+/g, '').toLowerCase();
          
          const tutarKeywords = ['tutar', 'bakiye', 'borc', 'borç', 'alacak', 'tahsilat', 'ödeme', 'odeme', 'amount', 'net'];
          const isTutarSearch = tutarKeywords.some(kw => normTarget.includes(kw));
          
          const cariKeywords = ['cari', 'müşteri', 'musteri', 'kod', 'id'];
          const isCariSearch = cariKeywords.some(kw => normTarget.includes(kw));

          for (const k of Object.keys(row)) {
            const normK = String(k).replace(/[\s\u00A0]+/g, '').toLowerCase();
            if (normK === normTarget || normK.includes(normTarget)) return row[k];
            if (isTutarSearch && tutarKeywords.some(kw => normK.includes(kw))) return row[k];
            if (isCariSearch && cariKeywords.some(kw => normK.includes(kw))) return row[k];
          }
          return undefined;
        };

        const mappedSales: any[] = [];
        const mappedCollections: any[] = [];
        const mappedCreditNotes: any[] = [];
        const mappedCheques: any[] = [];
        let successCount = 0;
        let errorCount = 0;

        let index = 0;
        for (const rawRow of rows) {
          try {
            index++;
            const proxyRow = new Proxy({ ...rawRow }, {
              get(target, prop) {
                if (typeof prop === 'string') {
                  const val = getRowValueHelper(target, prop);
                  if (val !== undefined) return val;
                }
                return target[prop];
              }
            });

            const results = processor(proxyRow);
            if (Array.isArray(results)) {
              for (const res of results) {
                if (!res) continue;

                let cid = res.customerId ? String(res.customerId).trim() : '';
                if (!cid || !/^5000\d{6}$/.test(cid)) {
                  for (const k of Object.keys(rawRow)) {
                    const valStr = String(rawRow[k] || '').trim();
                    if (/^5000\d{6}$/.test(valStr)) {
                      cid = valStr;
                      break;
                    }
                  }
                }
                if (!cid) continue;

                const amount = Math.abs(parseAmountHelper(res.amount));
                if (amount <= 0) continue;

                const rawDate = safeIsoDate(res.date);
                const d = rawDate ? rawDate.split('T')[0] : new Date().toISOString().split('T')[0];
                const desc = res.description || 'AI Gelişmiş Excel Aktarımı';
                
                if (res.type === 'DEVIR_BORC' || res.type === 'DEVIR') {
                  const originalAmt = parseAmountHelper(res.amount);
                  if (originalAmt < 0) {
                    mappedCollections.push({ collectionId: `ADV-DEV-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`, customerId: cid, amount: Math.abs(originalAmt), date: d, method: 'HAVALE', eDocumentNo: 'DEVIR_ALACAK', status: 'CREATED', type: 'DEVIR_ALACAK', description: desc });
                  } else {
                    mappedSales.push({ invoiceId: `ADV-DEV-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`, customerId: cid, amount: Math.abs(originalAmt), invoiceDate: d, eDocumentNo: 'DEVIR_BORC', status: 'CREATED', type: 'DEVIR_BORC', description: desc });
                  }
                } else if (res.type === 'DEVIR_ALACAK') {
                  mappedCollections.push({ collectionId: `ADV-DEV-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`, customerId: cid, amount, date: d, method: 'HAVALE', eDocumentNo: 'DEVIR_ALACAK', status: 'CREATED', type: 'DEVIR_ALACAK', description: desc });
                } else if (res.type === 'VIRMAN_BORC' || res.type === 'VIRMAN') {
                  const originalAmt = parseAmountHelper(res.amount);
                  if (originalAmt < 0) {
                    mappedCollections.push({ collectionId: `ADV-VIR-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`, customerId: cid, amount: Math.abs(originalAmt), date: d, method: 'HAVALE', eDocumentNo: 'VIRMAN_ALACAK', status: 'CREATED', type: 'VIRMAN_ALACAK', description: desc });
                  } else {
                    mappedSales.push({ invoiceId: `ADV-VIR-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`, customerId: cid, amount: Math.abs(originalAmt), invoiceDate: d, eDocumentNo: 'VIRMAN_BORC', status: 'CREATED', type: 'VIRMAN_BORC', description: desc });
                  }
                } else if (res.type === 'VIRMAN_ALACAK') {
                  mappedCollections.push({ collectionId: `ADV-VIR-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`, customerId: cid, amount, date: d, method: 'HAVALE', eDocumentNo: 'VIRMAN_ALACAK', status: 'CREATED', type: 'VIRMAN_ALACAK', description: desc });
                } else if (res.type === 'SATIS') {
                  mappedSales.push({ invoiceId: `ADV-EXC-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`, customerId: cid, amount, invoiceDate: d, eDocumentNo: 'SATIS_FATURASI', status: 'CREATED', type: 'SATIS', description: desc });
                } else if (res.type === 'TAHSILAT') {
                  mappedCollections.push({ collectionId: `ADV-EXC-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`, customerId: cid, amount, date: d, method: 'HAVALE', eDocumentNo: 'TAHSILAT', status: 'CREATED', type: 'TAHSILAT', description: desc });
                } else if (res.type === 'CEK' || res.type === 'ÇEK' || res.type === 'SENET') {
                  const docType = (res.type === 'SENET' || String(res.type).toUpperCase().includes('SENET')) ? 'SENET' : 'ÇEK';
                  mappedCheques.push({
                    id: `ADV-EXC-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`,
                    docNo: res.docNo || res.documentNo || `EVR-${Date.now()}-${index}`,
                    customerId: cid,
                    amount,
                    issueDate: d,
                    dueDate: res.dueDate ? safeIsoDate(res.dueDate)?.split('T')[0] : d,
                    type: docType,
                    bankName: res.bankName || res.bank || 'Portföy Çek/Senet',
                    description: desc,
                    status: 'PORTFOY'
                  });
                } else if (res.type === 'IADE' || res.type === 'DEKONT') {
                  mappedCreditNotes.push({ creditNoteId: `ADV-EXC-${Date.now()}-${index}-${Math.random().toString(36).substr(2,5)}`, customerId: cid, amount, date: d, documentNo: 'ALACAK_DEKONTU', status: 'CREATED', type: 'ALACAK_DEKONTU', description: desc });
                }
                successCount++;
              }
            }
          } catch (e) {
            errorCount++;
          }
        }
        
        const custGroups: Record<string, any[]> = {};
        const allItems = [
          ...mappedSales.map(s => ({ ...s, _kind: 'SATIS', _net: s.amount })),
          ...mappedCollections.map(c => ({ ...c, _kind: 'TAHSILAT', _net: -c.amount })),
          ...mappedCreditNotes.map(cn => ({ ...cn, _kind: 'IADE', _net: -cn.amount }))
        ];

        allItems.forEach(item => {
          if (!custGroups[item.customerId]) custGroups[item.customerId] = [];
          custGroups[item.customerId].push(item);
        });

        const finalSales: any[] = [];
        const finalCollections: any[] = [];
        const finalCreditNotes: any[] = [];

        Object.values(custGroups).forEach(group => {
          const positives = group.filter(x => x._net > 0);
          const negatives = group.filter(x => x._net < 0);

          const cancelledPos = new Set<number>();
          const cancelledNeg = new Set<number>();

          positives.forEach((pos, pIdx) => {
            negatives.forEach((neg, nIdx) => {
              if (!cancelledPos.has(pIdx) && !cancelledNeg.has(nIdx) && Math.abs(pos.amount - neg.amount) < 0.01) {
                cancelledPos.add(pIdx);
                cancelledNeg.add(nIdx);
              }
            });
          });

          group.forEach((item) => {
            const isPos = item._net > 0;
            const pIdx = positives.indexOf(item);
            const nIdx = negatives.indexOf(item);

            if (isPos && cancelledPos.has(pIdx)) return;
            if (!isPos && cancelledNeg.has(nIdx)) return;

            if (item._kind === 'SATIS') finalSales.push(item);
            else if (item._kind === 'TAHSILAT') finalCollections.push(item);
            else if (item._kind === 'IADE') finalCreditNotes.push(item);
          });
        });

        if (finalSales.length) await archiveSalesInvoices(finalSales);
        if (finalCollections.length) await archiveCollections(finalCollections);
        if (finalCreditNotes.length) await archiveCreditNotes(finalCreditNotes);
        if (mappedCheques.length) await archiveCheques(mappedCheques);
        
        const finalCount = finalSales.length + finalCollections.length + finalCreditNotes.length + mappedCheques.length;
        if (finalCount > 0) {
          await initFromArchive();
          invalidateCache();
        }
        
        return { 
          success: true, 
          processedRecords: finalCount, 
          addedRecords: finalCount,
          skippedCancelledPairs: successCount - finalCount,
          errors: errorCount, 
          message: finalCount > 0 ? `BAŞARILI: Veritabanına TAM ${finalCount} adet yeni kayıt başarıyla YAZILDI!` : 'Aktarılacak net kayıt bulunamadı (birbirini götüren virmanlar elendi).',
          debugGeneratedCode: args.jsFunctionBody 
        };
      }

      case 'purgeTestImportRecords': {
        if (!isAdminAuthenticated()) return { error: 'Bu işlem için Admin girişi yapılması gereklidir.' };
        const res = await purgeTestImportRecords();
        return {
          success: true,
          deletedCount: res.deletedCount,
          message: `Veritabanı temizlendi! Toplam ${res.deletedCount} adet hatalı test/aktarım kaydı silindi.`
        };
      }

      case 'readUploadedExcelData': {
        let rows = rawExcelCache.get(args.fileName);
        if (!rows || rows.length === 0) {
          const cachedKeys = Array.from(rawExcelCache.keys());
          if (cachedKeys.length > 0) {
            rows = rawExcelCache.get(cachedKeys[cachedKeys.length - 1]);
          }
        }
        if (!rows || rows.length === 0) return { error: 'Geçici bellekte okunacak Excel dosyası bulunamadı.' };

        const limit = args.limit || 50;
        return {
          success: true,
          totalRows: rows.length,
          returnedRows: Math.min(rows.length, limit),
          data: rows.slice(0, limit)
        };
      }

      case 'calculateCustomerDebtToCollectionRisk': {
        const query = (args.query || '').trim();
        if (query) {
          const matched = searchCustomersSync(query, true);
          if (matched.length > 0) {
            const risk = calculateCustomerDebtToCollectionRiskSync(matched[0]);
            return {
              customerName: matched[0].signName || matched[0].customerName,
              balance: formatCurrency(risk.balance),
              monthlyAvgCollection: formatCurrency(risk.monthlyAvgCollection),
              coverageMonths: `${risk.coverageMonths} Ay`,
              coverageDays: `${risk.coverageDays} Gün`,
              riskLevel: risk.riskLevel,
              riskLabel: risk.riskLabel,
              actionAdvice: risk.actionAdvice
            };
          }
        }
        const overview = getDeepExecutiveAnalyticsOverviewSync();
        return {
          title: 'Genel Şirket Borç/Tahsilat Risk Özeti',
          risky30kGroup: overview.risky30kGroup,
          over60DaysOverdue: overview.over60DaysOverdue
        };
      }

      case 'getDeepExecutiveAnalyticsOverview': {
        return getDeepExecutiveAnalyticsOverviewSync();
      }

      default:
        return { error: `Bilinmeyen fonksiyon: ${toolName}` };
    }
  } catch (err: any) {
    return { error: `Fonksiyon çalıştırma hatası (${toolName}): ${err.message}` };
  }
}
