// src/utils/fileTypeDetector.ts
import * as XLSX from 'xlsx';
import { FILE_TYPES } from '../config/fileTypes';

const FILENAME_PATTERNS = [
  { key: FILE_TYPES.MUSTERI_MASTER.key, pattern: /müşteri|musteri|master|export\s*\(\d+\)|cari[\s\-_]?master|cari[\s\-_]?açılış|cari[\s\-_]?acilis/i },
  { key: FILE_TYPES.SATIN_ALMA.key, pattern: /satın[\s\-_]?alma|satin[\s\-_]?alma|satınalma|satinalma|purchase|alış|alis|alım|alim/i },
  { key: FILE_TYPES.SATIS.key, pattern: /satış|satis|sales/i },
  { key: FILE_TYPES.HAVALE_TAHSILAT.key, pattern: /havale|eft|banka/i },
  { key: FILE_TYPES.NAKIT_TAHSILAT.key, pattern: /nakit|kasa|pos/i },
  { key: FILE_TYPES.CEK.key, pattern: /çek|cek|cheque/i },
  { key: FILE_TYPES.SENET.key, pattern: /senet|promissory|bono/i },
];

export async function readExcelHeaders(file: File): Promise<string[]> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', sheetRows: 10 });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        let headers: string[] = [];
        for (let i = 0; i < Math.min(5, json.length); i++) {
          const rowStr = (json[i] || []).map((h: any) => String(h || '').trim()).join(' ').toLowerCase();
          if (
            rowStr.includes('fatura') ||
            rowStr.includes('cari') ||
            rowStr.includes('müşteri') ||
            rowStr.includes('belge') ||
            rowStr.includes('tabela') ||
            rowStr.includes('tutar')
          ) {
            headers = (json[i] || []).map((h: any) => String(h || '').trim());
            break;
          }
        }
        if (headers.length === 0 && json.length > 0) {
          headers = (json[0] || []).map((h: any) => String(h || '').trim());
        }
        resolve(headers);
      } catch (err) {
        console.warn('Excel header okuma hatası:', err);
        resolve([]);
      }
    };
    reader.onerror = () => resolve([]);
    reader.readAsArrayBuffer(file);
  });
}

export async function detectFileType(file: File): Promise<{ key: string | null; confidence: 'high' | 'medium' | 'low'; matchedBy: string }> {
  if (!file) return { key: null, confidence: 'low', matchedBy: 'none' };

  const filename = file.name || '';

  for (const { key, pattern } of FILENAME_PATTERNS) {
    if (pattern.test(filename)) {
      return { key, confidence: 'high', matchedBy: `dosya_adı (${filename})` };
    }
  }

  const headers = await readExcelHeaders(file);
  if (headers.length > 0) {
    const headerStr = headers.join(' ').toLowerCase();
    const normHeaderStr = headerStr.replace(/\s+/g, '');

    if (headerStr.includes('tabela') || (headerStr.includes('müşteri') && headerStr.includes('adres'))) {
      return { key: FILE_TYPES.MUSTERI_MASTER.key, confidence: 'high', matchedBy: 'sütun_başlıkları' };
    }

    if (normHeaderStr.includes('satıştutarı') || normHeaderStr.includes('satistutari')) {
      return { key: FILE_TYPES.SATIS.key, confidence: 'high', matchedBy: 'sütun_başlıkları' };
    }

    if (
      normHeaderStr.includes('carikodu2') ||
      normHeaderStr.includes('carikodu') ||
      (normHeaderStr.includes('faturano') && normHeaderStr.includes('tip'))
    ) {
      if (!normHeaderStr.includes('satıştutarı') && !normHeaderStr.includes('satistutari')) {
        return { key: FILE_TYPES.SATIN_ALMA.key, confidence: 'high', matchedBy: 'sütun_başlıkları' };
      }
    }

    if (headerStr.includes('belge numarası') && headerStr.includes('kayıt tipi')) {
      return { key: FILE_TYPES.NAKIT_TAHSILAT.key, confidence: 'medium', matchedBy: 'sütun_başlıkları' };
    }
  }

  return { key: null, confidence: 'low', matchedBy: 'none' };
}

