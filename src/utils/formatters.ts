// src/utils/formatters.ts
// Para, tarih ve sayı formatlama yardımcıları

/**
 * Türk Lirası formatında para birimi
 * @param amount 
 * @returns örn: "1.234.567,89 ₺"
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Kısa para formatı (K, M)
 * @param amount 
 * @returns örn: "1,2M ₺" veya "345K ₺"
 */
export function formatCurrencyShort(amount: number | null | undefined): string {
  if (!amount) return '₺0';
  if (Math.abs(amount) >= 1_000_000)
    return `₺${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000)
    return `₺${(amount / 1_000).toFixed(0)}K`;
  return formatCurrency(amount);
}

/**
 * Tarih formatı
 * @param date 
 * @returns örn: "29 Tem 2026"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Gecikme günü metni
 * @param days 
 * @returns
 */
export function formatOverdueDays(days: number): string {
  if (days <= 0) return 'Güncel';
  return `${days} gün gecikmiş`;
}

/**
 * Sayı formatı (binlik ayraç)
 * @param num 
 * @returns
 */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('tr-TR').format(num);
}
