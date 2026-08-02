// src/parsers/salesParser.ts
// Satış Listesi → sales_invoices koleksiyonu
// Karar #11 (CANCELLED çift filtresi) + EFES dışlama

import { filterCancelledPairs } from '../calculations/cancelledFilter';
import { safeIsoDate } from '../utils/dateUtils';
import { COLUMN_MAPS } from './columnMappings';

const MAP = COLUMN_MAPS.SATIS;

function isEfes(row: Record<string, any>): boolean {
  const kod = String(row[MAP.customerId] || '').trim().toUpperCase();
  const ad  = String(row[MAP._customerName] || '').toUpperCase();
  return kod === 'EFES' || ad.includes('EFES PAZARLAMA');
}

export function parseAmount(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;
  
  if (str.includes(',') && str.lastIndexOf(',') > str.lastIndexOf('.')) {
    const cleaned = str.replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
  }
  if (str.includes(',') && str.lastIndexOf('.') > str.lastIndexOf(',')) {
    const cleaned = str.replace(/,/g, '');
    return parseFloat(cleaned) || 0;
  }
  if (str.includes(',') && !str.includes('.')) {
    return parseFloat(str.replace(',', '.')) || 0;
  }
  
  return parseFloat(str.replace(/[^0-9.-]/g, '')) || 0;
}

export interface SalesParsedRecord {
  invoiceId: string;
  invoiceDate: string | null;
  customerId: string;
  amount: number;
  eDocumentNo: string | null;
}

export interface SalesParseResult {
  records: SalesParsedRecord[];
  warnings: string[];
  stats: {
    total: number;
    cancelledRemoved: number;
    efesRemoved: number;
    written: number;
  };
}

export function parseSales(rows: Record<string, any>[]): SalesParseResult {
  const warnings: string[] = [];

  const filtered = filterCancelledPairs(rows, MAP.invoiceId, MAP.status);
  const cancelledCount = rows.length - filtered.length;

  const nonEfes = filtered.filter((row) => !isEfes(row));
  const efesCount = filtered.length - nonEfes.length;

  const recordsMap = new Map<string, SalesParsedRecord>();
  const missingCustomerIds = new Set<string>();

  for (const row of nonEfes) {
    const rawCustId = row[MAP.customerId] ?? row['Cari Kodu 2'] ?? row['Cari Kodu2'] ?? row['Cari Kodu'] ?? '';
    let customerId = String(rawCustId || '').trim();
    if (customerId.includes('.')) {
      customerId = customerId.split('.')[0];
    }
    if (!customerId || customerId === 'EFES') continue;

    if (!/^5000\d{6}$/.test(customerId)) {
      missingCustomerIds.add(customerId);
      continue;
    }

    const amount = parseAmount(row[MAP.amount]);
    const invoiceId = String(row[MAP.invoiceId] || '').trim();
    if (!invoiceId) continue;

    if (recordsMap.has(invoiceId)) {
      const existing = recordsMap.get(invoiceId)!;
      existing.amount += amount;
    } else {
      recordsMap.set(invoiceId, {
        invoiceId,
        invoiceDate: safeIsoDate(row[MAP.invoiceDate]),
        customerId,
        amount,
        eDocumentNo: String(row[MAP.eDocumentNo] || '').trim() || null,
      });
    }
  }

  const records = Array.from(recordsMap.values());

  if (missingCustomerIds.size > 0) {
    warnings.push(
      `${missingCustomerIds.size} kayıt atlandı: Müşteri Master'da bulunmayan cari kodları. ` +
      `Müşteri Master dosyasını güncelleyip tekrar yükleyin.`
    );
  }

  return {
    records,
    warnings,
    stats: {
      total: rows.length,
      cancelledRemoved: cancelledCount,
      efesRemoved: efesCount,
      written: records.length,
    },
  };
}
