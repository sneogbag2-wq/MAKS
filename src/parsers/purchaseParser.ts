// src/parsers/purchaseParser.ts
// Satın Alma Listesi → purchase_invoices + customer_credit_notes
// Karar #5 Düzeltmesi: SATIN ALMA → purchase_invoices, HİZMET/İADE → customer_credit_notes

import { filterCancelledPairs } from '../calculations/cancelledFilter';
import { safeIsoDate } from '../utils/dateUtils';
import { COLUMN_MAPS } from './columnMappings';
import { parseAmount } from './salesParser';

const MAP = COLUMN_MAPS.SATIN_ALMA;

export interface PurchaseParsedRecord {
  invoiceId: string;
  invoiceDate: string | null;
  customerId: string;
  amount: number;
  eDocumentNo: string | null;
}

export interface CreditNoteParsedRecord {
  creditNoteId: string;
  customerId: string;
  date: string | null;
  amount: number;
  type: string;
  status: string;
  invoiceType: string | null;
  salesRepId: string | null;
  eDocumentNo: string | null;
}

export interface PurchaseParseResult {
  purchaseRecords: PurchaseParsedRecord[];
  creditNoteRecords: CreditNoteParsedRecord[];
  warnings: string[];
  stats: {
    total: number;
    cancelledRemoved: number;
    purchaseWritten: number;
    creditNotesWritten: number;
  };
}

export function parsePurchase(rows: Record<string, any>[]): PurchaseParseResult {
  const warnings: string[] = [];

  const filtered = filterCancelledPairs(rows, MAP.invoiceId, MAP.status);
  const cancelledCount = rows.length - filtered.length;

  const purchaseMap = new Map<string, PurchaseParsedRecord>();
  const creditNoteMap = new Map<string, CreditNoteParsedRecord>();
  const missingCustomerIds = new Set<string>();

  for (const row of filtered) {
    const rawCustId = row[MAP.customerId] ?? row['Cari Kodu 2'] ?? row['Cari Kodu2'] ?? row['Cari Kodu'] ?? row['Müşteri'] ?? '';
    let customerId = String(rawCustId || '').trim();
    if (customerId.includes('.')) {
      customerId = customerId.split('.')[0];
    }
    if (!customerId) continue;

    const rawTip = String(row[MAP.type] ?? row[MAP.invoiceType] ?? row['Tip'] ?? row['Fatura Tipi'] ?? row['Fatura Türü'] ?? '').trim().toUpperCase();
    
    const normTip = rawTip
      .replace(/İ/g, 'I')
      .replace(/I/g, 'I')
      .replace(/Ğ/g, 'G')
      .replace(/Ü/g, 'U')
      .replace(/Ş/g, 'S')
      .replace(/Ö/g, 'O')
      .replace(/Ç/g, 'C');

    const amount = parseAmount(row[MAP.amount] ?? row['Tutar'] ?? row['TUTAR'] ?? 0);
    const invoiceId = String(row[MAP.invoiceId] ?? row['Fatura No'] ?? row['Belge No'] ?? '').trim();
    if (!invoiceId) continue;
    
    const invoiceDate = safeIsoDate(row[MAP.invoiceDate] ?? row['Fatura Tarihi'] ?? row['Tarih']);
    const eDocumentNo = String(row[MAP.eDocumentNo] ?? row['EDOCUMENTNO'] ?? '').trim() || null;

    const isCreditNote = normTip.includes('HIZMET') || normTip.includes('IADE') || normTip.includes('KREDI') || normTip.includes('DEKONT') || normTip.includes('ALACAK');
    const isPurchase = normTip.includes('SATIN') || normTip.includes('ALIM') || normTip.includes('PURCHASE');

    if (isCreditNote || (!isPurchase && normTip.length > 0)) {
      const creditType = normTip.includes('IADE') ? 'IADE_FATURASI' : 'HIZMET_FATURASI';

      if (creditNoteMap.has(invoiceId)) {
        creditNoteMap.get(invoiceId)!.amount += amount;
      } else {
        creditNoteMap.set(invoiceId, {
          creditNoteId:  invoiceId,
          customerId,
          date:          invoiceDate,
          amount,
          type:          creditType,
          status:        'CREATED',
          invoiceType:   String(row[MAP.invoiceType] || '').trim() || null,
          salesRepId:    String(row[MAP.salesRepId] || '').trim() || null,
          eDocumentNo,
        });
      }
    } else {
      if (purchaseMap.has(invoiceId)) {
        purchaseMap.get(invoiceId)!.amount += amount;
      } else {
        purchaseMap.set(invoiceId, {
          invoiceId,
          invoiceDate,
          customerId,
          amount,
          eDocumentNo,
        });
      }
    }
  }
  
  const purchaseRecords = Array.from(purchaseMap.values());
  const creditNoteRecords = Array.from(creditNoteMap.values());

  if (missingCustomerIds.size > 0) {
    warnings.push(
      `${missingCustomerIds.size} alacak dekontu atlandı: Müşteri Master'da bulunmayan cari kodları.`
    );
  }

  return {
    purchaseRecords,
    creditNoteRecords,
    warnings,
    stats: {
      total: rows.length,
      cancelledRemoved: cancelledCount,
      purchaseWritten: purchaseRecords.length,
      creditNotesWritten: creditNoteRecords.length,
    },
  };
}
