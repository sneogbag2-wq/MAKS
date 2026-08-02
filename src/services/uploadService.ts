// src/services/uploadService.ts
// Excel dosyasını okuyup parse edip veri deposuna yazar.

import * as XLSX from 'xlsx';
import { parseCustomerMaster } from '../parsers/customerMasterParser';
import { parseSales } from '../parsers/salesParser';
import { parsePurchase } from '../parsers/purchaseParser';
import { parseCollection } from '../parsers/collectionParser';
import { parseChequeSenet } from '../parsers/chequeSenetParser';
import { FILE_TYPES } from '../config/fileTypes';
import { saveUploadedData } from './customerService';

export const rawExcelCache = new Map<string, any[]>();

export function clearRawExcelCache(): void {
  rawExcelCache.clear();
}

export async function readExcelFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: null });
        resolve(rows);
      } catch (err: any) {
        reject(new Error(`Excel okuma hatası: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsArrayBuffer(file);
  });
}

export function parseByType(rows: any[], fileTypeKey: string): any {
  switch (fileTypeKey) {
    case 'MUSTERI_MASTER':   return parseCustomerMaster(rows);
    case 'SATIS':            return parseSales(rows);
    case 'SATIN_ALMA':       return parsePurchase(rows);
    case 'NAKIT_TAHSILAT':   return parseCollection(rows, 'NAKIT_TAHSILAT');
    case 'HAVALE_TAHSILAT':  return parseCollection(rows, 'HAVALE_TAHSILAT');
    case 'CEK':              return parseChequeSenet(rows, 'CEK');
    case 'SENET':            return parseChequeSenet(rows, 'SENET');
    default:
      throw new Error(`Bilinmeyen dosya tipi: ${fileTypeKey}`);
  }
}

export interface ColumnValidationResult {
  valid: boolean;
  missingColumns: string[];
}

export function validateColumns(rows: any[], fileTypeKey: string): ColumnValidationResult {
  if (!rows || rows.length === 0) {
    return { valid: false, missingColumns: ['Dosya boş'] };
  }
  const headers = Object.keys(rows[0] || {}).map((h) => String(h || '').trim());
  const required = FILE_TYPES[fileTypeKey]?.requiredColumns || [];

  const missingColumns = required.filter((col) => {
    const colNorm = col.replace(/\s+/g, '').toLowerCase();
    return !headers.some((h) => h.replace(/\s+/g, '').toLowerCase() === colNorm);
  });

  return { valid: missingColumns.length === 0, missingColumns };
}

export interface ProcessFileResult {
  success: boolean;
  isFormatError?: boolean;
  isTemporary?: boolean;
  rowCount?: number;
  rawRows?: any[];
  missingColumns?: string[];
  result?: any;
  error?: string;
}

export async function processFile(
  file: File,
  fileTypeKey: string,
  onProgress: (status: string) => void = () => {},
  isTemporary = false
): Promise<ProcessFileResult> {
  try {
    onProgress('Dosya okunuyor...');
    const rows = await readExcelFile(file);

    onProgress('Sütunlar doğrulanıyor...');
    const { valid, missingColumns } = validateColumns(rows, fileTypeKey);
    if (!valid) {
      rawExcelCache.set(file.name, rows);
      return {
        success: false,
        isFormatError: true,
        rawRows: rows,
        missingColumns,
        error: `Dosya doğrulama hatası: Eksik sütunlar — ${missingColumns.join(', ')}. ` +
               `Bu dosya "${fileTypeKey}" tipinde değil olabilir.`,
      };
    }

    onProgress('Veriler işleniyor...');
    const result = parseByType(rows, fileTypeKey);

    if (isTemporary) {
      rawExcelCache.set(file.name, rows);
      return { 
        success: true, 
        isTemporary: true,
        rowCount: rows.length,
        result: result
      };
    }

    const fileMeta = { filename: file.name, filesize: file.size };
    const saveResult = await saveUploadedData(fileTypeKey, result, fileMeta);

    result.notificationSummary = saveResult?.notificationSummary || null;
    result.mergeResult         = saveResult?.mergeResult || null;
    result.matchResult         = saveResult?.matchResult || null;

    onProgress('Tamamlandı!');
    return { success: true, result };

  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
