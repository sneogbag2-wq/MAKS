// src/utils/dateUtils.ts
// Excel tarih değerlerini güvenli bir şekilde ISO string'e dönüştürür.
// Asla RangeError atmaz.

/**
 * Excel'den gelen tarih değerini (Date objesi, string "29.07.2026", "2026-07-29", veya Excel sayısal serial)
 * güvenli bir şekilde ISO string'e çevirir.
 *
 * @param val
 * @returns - "YYYY-MM-DDTHH:mm:ss.sssZ" veya null
 */
export function safeIsoDate(val: any): string | null {
  if (val === null || val === undefined || val === '') return null;

  try {
    // 1. Zaten Date objesi ise
    if (val instanceof Date) {
      if (!isNaN(val.getTime())) return val.toISOString();
      return null;
    }

    // 2. Excel serial number (sayı veya sayısal string ör: 46233 veya "46233")
    const numVal = Number(val);
    if (!isNaN(numVal) && typeof val !== 'boolean' && String(val).trim() !== '' && !String(val).includes('-') && !String(val).includes('/') && (typeof val === 'number' || /^\d+(\.\d+)?$/.test(String(val).trim()))) {
      if (numVal > 30000 && numVal < 60000) {
        const date = new Date(Math.round((numVal - 25569) * 86400 * 1000));
        if (!isNaN(date.getTime())) return date.toISOString();
      }
    }

    // 3. String ise
    let str = String(val).trim();
    if (!str) return null;

    // TR formatı: "29.07.2026" veya "29/07/2026" → "2026-07-29"
    const trMatch = str.match(/^(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{4})/);
    if (trMatch) {
      const day = trMatch[1].padStart(2, '0');
      const month = trMatch[2].padStart(2, '0');
      const year = trMatch[3];
      str = `${year}-${month}-${day}`;
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch (err) {
    console.warn('Tarih dönüştürme uyarısı:', val, err);
  }

  return null;
}

export function formatDate(val: any): string {
  if (!val) return '-';
  const iso = safeIsoDate(val);
  if (!iso) return String(val);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}
