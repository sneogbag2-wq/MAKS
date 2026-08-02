// src/parsers/chequeSenetParser.ts
// Çek ve Senet Listeleri → cheques koleksiyonu

import { filterCancelledPairs } from '../calculations/cancelledFilter';
import { safeIsoDate } from '../utils/dateUtils';
import { parseAmount } from './salesParser';

export interface ChequeSenetParsedRecord {
  id: string;
  docNo: string;
  subNo: string;
  customerId: string;
  customerName: string | null;
  type: string;
  issueDate: string | null;
  dueDate: string | null;
  amount: number;
  bankName: string | null;
  accountNo: string | null;
  description: string | null;
  status: string;
  source: string;
}

export interface ChequeSenetParseResult {
  records: ChequeSenetParsedRecord[];
  warnings: string[];
  stats: {
    total: number;
    cancelledRemoved: number;
    written: number;
  };
}

export function parseChequeSenet(rows: Record<string, any>[], fileTypeKey: string): ChequeSenetParseResult {
  const warnings: string[] = [];

  const filtered = filterCancelledPairs(rows, 'Belge Numarası', 'Kayıt Tipi');
  const cancelledCount = rows.length - filtered.length;

  const records: ChequeSenetParsedRecord[] = [];
  const missingCustomerIds = new Set<string>();
  const defaultType = fileTypeKey === 'SENET' ? 'SENET' : 'ÇEK';

  for (const row of filtered) {
    const rawCustId = row['Cari Kodu 2'] ?? row['Cari Kodu2'] ?? row['Cari Kodu'] ?? '';
    let customerId = String(rawCustId || '').trim();
    if (customerId.includes('.')) {
      customerId = customerId.split('.')[0];
    }

    if (!/^5000\d{6}$/.test(customerId)) {
      missingCustomerIds.add(customerId || '(boş)');
      continue;
    }

    const docNo = String(row['Belge Numarası'] || '').trim();
    const subNo = String(row['Çek No'] || row['Senet No'] || '').trim();
    const id = docNo ? (subNo ? `${docNo}_${subNo}` : docNo) : `cs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const amount = parseAmount(row['Tutar']);
    const issueDate = safeIsoDate(row['Fatura Tarihi'] || row['Alınış Tarihi']);
    const dueDate   = safeIsoDate(row['Vade Tarihi']);
    const bankName  = String(row['Banka Adı'] || row['Banka'] || '').trim() || null;
    const accountNo = String(row['Çek Hesap No'] || '').trim() || null;
    const description = String(row['Açıklama'] || '').trim() || null;

    records.push({
      id,
      docNo,
      subNo,
      customerId,
      customerName: String(row['Cari Adı'] || '').trim() || null,
      type: defaultType,
      issueDate,
      dueDate,
      amount,
      bankName,
      accountNo,
      description,
      status: 'CREATED',
      source: fileTypeKey,
    });
  }

  if (missingCustomerIds.size > 0) {
    warnings.push(
      `${missingCustomerIds.size} ${defaultType.toLowerCase()} kaydı atlandı: Müşteri Master'da bulunmayan cari kodları.`
    );
  }

  return {
    records,
    warnings,
    stats: {
      total: rows.length,
      cancelledRemoved: cancelledCount,
      written: records.length,
    },
  };
}
