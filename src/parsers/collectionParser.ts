// src/parsers/collectionParser.ts
// Nakit Tahsilat + Havale Tahsilat → collections koleksiyonu
// Karar #9 (yöntem tespiti) + Karar #11 (CANCELLED çift filtresi)

import { filterCancelledPairs } from '../calculations/cancelledFilter';
import { safeIsoDate } from '../utils/dateUtils';
import { COLUMN_MAPS } from './columnMappings';
import { parseAmount } from './salesParser';

const MAP = COLUMN_MAPS.NAKIT_TAHSILAT;

function detectMethod(row: Record<string, any>, fileTypeKey: string): string {
  if (fileTypeKey === 'HAVALE_TAHSILAT') return 'HAVALE';
  const bankKodu = row[MAP.bankKodu] ?? row['Banka Kodu'];
  const kasaKodu = parseInt(row[MAP.kasaKodu] ?? row['Kasa Kodu']);
  if (bankKodu && String(bankKodu).trim() !== '') return 'HAVALE';
  if (kasaKodu === 12) return 'KREDİ_KARTI';
  return 'NAKİT';
}

export interface CollectionParsedRecord {
  collectionId: string;
  customerId: string;
  date: string | null;
  amount: number;
  method: string;
  status: string;
  source: string;
}

export interface CollectionParseResult {
  records: CollectionParsedRecord[];
  warnings: string[];
  stats: {
    total: number;
    cancelledRemoved: number;
    written: number;
  };
}

export function parseCollection(rows: Record<string, any>[], fileTypeKey: string): CollectionParseResult {
  const warnings: string[] = [];

  const filtered = filterCancelledPairs(rows, MAP.collectionId, MAP.status);
  const cancelledCount = rows.length - filtered.length;

  const records: CollectionParsedRecord[] = [];
  const missingCustomerIds = new Set<string>();

  for (const row of filtered) {
    const rawCustId = row[MAP.customerId] ?? row['Cari Kodu 2'] ?? row['Cari Kodu2'] ?? row['Cari Kodu'] ?? '';
    let customerId = String(rawCustId || '').trim();
    if (customerId.includes('.')) {
      customerId = customerId.split('.')[0];
    }

    if (!/^5000\d{6}$/.test(customerId)) {
      missingCustomerIds.add(customerId || '(boş)');
      continue;
    }

    const amount = parseAmount(row[MAP.amount] ?? row['Tutar']);
    const method = detectMethod(row, fileTypeKey);

    records.push({
      collectionId: String(row[MAP.collectionId] || '').trim(),
      customerId,
      date: safeIsoDate(row[MAP.date]),
      amount,
      method,
      status: 'CREATED',
      source: fileTypeKey,
    });
  }

  if (missingCustomerIds.size > 0) {
    warnings.push(
      `${missingCustomerIds.size} tahsilat atlandı: Müşteri Master'da bulunmayan cari kodları.`
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
