// src/calculations/phoneValidator.ts
// Karar #7: Telefon numarası doğrulama

const PHONE_REGEX = /^5\d{9}$/;
const PLACEHOLDER_PHONES = new Set(['5999999999', '5559999999']);

/**
 * TR mobil telefon numarasını doğrular.
 * 5 ile başlayan 10 haneli sayı olmalı, bilinen placeholder değerler kabul edilmez.
 *
 * @param rawPhone - Ham telefon değeri
 * @returns - Geçerli numara veya null
 */
export function validatePhone(rawPhone: string | number | null | undefined): string | null {
  if (rawPhone === null || rawPhone === undefined || rawPhone === '') return null;
  let phone = String(rawPhone).trim().replace(/\D/g, '');

  // 90532XXXXXXX (12 digits) -> 532XXXXXXX
  if (phone.length === 12 && phone.startsWith('90')) {
    phone = phone.slice(2);
  }
  // 0532XXXXXXX (11 digits) -> 532XXXXXXX
  else if (phone.length === 11 && phone.startsWith('0')) {
    phone = phone.slice(1);
  }

  if (!PHONE_REGEX.test(phone)) return null;
  if (PLACEHOLDER_PHONES.has(phone)) return null;
  return phone;
}
