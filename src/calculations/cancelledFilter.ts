// src/calculations/cancelledFilter.ts
// Karar #11: CANCELLED kayıtları "çift bazında" dışlama
// Panel ve WhatsApp bot bu fonksiyonu kullanır.

/**
 * CANCELLED olan belge numaralarını toplar.
 * Hem CANCELLED satırın kendisi hem eşleşen CREATED satırı dışlanmalı.
 *
 * @param rows - Ham veri satırları
 * @param docField - Belge numarası sütun adı ('Fatura No' veya 'Belge Numarası')
 * @param statusField - Durum sütun adı ('Fatura Durum' veya 'Kayıt Tipi')
 * @returns - Dışlanacak belge numaraları kümesi
 */
export function getCancelledDocSet<T extends Record<string, any>>(
  rows: T[],
  docField: keyof T | string,
  statusField: keyof T | string
): Set<string> {
  const cancelledSet = new Set<string>();
  for (const row of rows) {
    const status = String(row[statusField as string] || '').trim().toUpperCase();
    if (status === 'CANCELLED') {
      const docNo = String(row[docField as string] || '').trim();
      if (docNo) cancelledSet.add(docNo);
    }
  }
  return cancelledSet;
}

/**
 * Veri setinden CANCELLED ve eşleşen CREATED satırları filtreler.
 * İki geçişli filtredir — tek satır bazlı `status !== 'CANCELLED'` YETERSİZDİR.
 *
 * @param rows - Ham veri satırları
 * @param docField - Belge numarası sütun adı
 * @param statusField - Durum sütun adı
 * @returns - Temizlenmiş satırlar
 */
export function filterCancelledPairs<T extends Record<string, any>>(
  rows: T[],
  docField: keyof T | string,
  statusField: keyof T | string
): T[] {
  const cancelledSet = getCancelledDocSet(rows, docField, statusField);
  if (cancelledSet.size === 0) return rows;
  return rows.filter((row) => {
    const docNo = String(row[docField as string] || '').trim();
    return !cancelledSet.has(docNo);
  });
}
