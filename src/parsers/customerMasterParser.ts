// src/parsers/customerMasterParser.ts
// Müşteri Master Excel → customers koleksiyonu (upsert)
// Karar #7 + #8 + Faz 2 Akıllı Birleştirme (Smart Merging Bira/Distile)

import { validatePhone } from '../calculations/phoneValidator';
import { COLUMN_MAPS } from './columnMappings';

const MAP = COLUMN_MAPS.MUSTERI_MASTER;

export interface CustomerMasterParsedRecord {
  customerId: string;
  salesManagerName: string | null;
  salesRepName: string | null;
  salesChannel: string | null;
  volumeSegment: string | null;
  signName: string | null;
  customerName: string | null;
  province: string | null;
  district: string | null;
  shippingAddress: string | null;
  phone: string | null;
  customerStatus: string | null;
  workPeriod: string | null;
  creditLimit: number | null;
  divisions?: Record<string, any>;
  updatedAt: string;
}

export interface ParseResult<T> {
  records: T[];
  warnings: string[];
}

function parseLimit(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  let str = String(val).replace(/[^\d\.,\-]/g, '').trim();
  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  return parseFloat(str) || 0;
}

/**
 * Müşteri Master Excel satırlarını Firestore upsert formatına dönüştürür.
 * İki satır aynı müşteri kodu ile geldiğinde (Bira/Distile) verileri akıllıca birleştirir.
 */
export function parseCustomerMaster(rows: Record<string, any>[]): ParseResult<CustomerMasterParsedRecord> {
  const recordMap = new Map<string, CustomerMasterParsedRecord>();
  const warnings: string[] = [];
  let skippedMigros = 0;

  for (const row of rows) {
    const rawId = String(row[MAP.customerId] || '').trim();

    // 6 haneli Migros kodları — kapsam dışı (Karar #7)
    if (rawId.length === 6) {
      skippedMigros++;
      continue;
    }

    // 10 haneli 5000XXXXXX formatı kontrolü
    if (!/^5000\d{6}$/.test(rawId)) {
      warnings.push(`Geçersiz müşteri kodu atlandı: "${rawId}"`);
      continue;
    }

    const phone = validatePhone(row[MAP.phone]);
    const repName = String(row[MAP.salesRepName] || '').trim() || null;
    const channel = String(row[MAP.salesChannel] || '').trim() || null;
    const sign = String(row[MAP.signName] || '').trim() || null;
    const limit = parseLimit(row[MAP.creditLimit]);

    const newRecord: CustomerMasterParsedRecord = {
      customerId:       rawId,
      salesManagerName: String(row[MAP.salesManagerName] || '').trim() || null,
      salesRepName:     repName,
      salesChannel:     channel,
      volumeSegment:    String(row[MAP.volumeSegment] || '').trim() || null,
      signName:         sign,
      customerName:     String(row[MAP.customerName] || '').trim() || null,
      province:         String(row[MAP.province] || '').trim() || null,
      district:         String(row[MAP.district] || '').trim() || null,
      shippingAddress:  String(row[MAP.shippingAddress] || '').trim() || null,
      phone,
      customerStatus:   String(row[MAP.customerStatus] || '').trim() || null,
      workPeriod:       String(row[MAP.workPeriod] || '').trim() || null,
      creditLimit:      limit > 0 ? limit : null,
      updatedAt:        new Date().toISOString(),
    };

    if (!recordMap.has(rawId)) {
      recordMap.set(rawId, newRecord);
    } else {
      // Akıllı Birleştirme (Smart Merging: Bira + Distile)
      const existing = recordMap.get(rawId)!;

      // 1. Kredi Limitlerini Topla
      const combinedLimit = (existing.creditLimit || 0) + limit;
      existing.creditLimit = combinedLimit > 0 ? combinedLimit : null;

      // 2. Satış Temsilcilerini Birleştir
      if (repName && existing.salesRepName && !existing.salesRepName.includes(repName)) {
        existing.salesRepName = `${existing.salesRepName} / ${repName}`;
      } else if (repName && !existing.salesRepName) {
        existing.salesRepName = repName;
      }

      // 3. Satış Kanallarını Birleştir
      if (channel && existing.salesChannel && !existing.salesChannel.includes(channel)) {
        existing.salesChannel = `${existing.salesChannel} / ${channel}`;
      } else if (channel && !existing.salesChannel) {
        existing.salesChannel = channel;
      }

      // 4. Tabela Adı Etiketleme
      if (existing.signName && !existing.signName.includes('(')) {
        if (existing.salesChannel && existing.salesChannel.includes('/')) {
          existing.signName = `${existing.signName} (Bira / Distile)`;
        } else if (sign && existing.signName !== sign) {
          existing.signName = `${existing.signName} / ${sign}`;
        }
      }

      // 5. Birim Detaylarını Sakla
      if (!existing.divisions) {
        existing.divisions = {};
      }
      existing.divisions[channel || 'birim2'] = {
        salesRep: repName,
        limit,
        channel
      };

      warnings.push(`Müşteri ${rawId} (${existing.customerName || 'Cari'}) için mükerrer birim satırları (Bira/Distile) akıllıca birleştirildi.`);
    }
  }

  if (skippedMigros > 0) {
    warnings.push(`${skippedMigros} Migros zincir kaydı kapsam dışı bırakıldı (6 haneli kod).`);
  }

  return { records: Array.from(recordMap.values()), warnings };
}
