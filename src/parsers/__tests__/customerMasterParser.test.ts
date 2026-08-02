import { describe, it, expect } from 'vitest';
import { parseCustomerMaster } from '../customerMasterParser';

describe('parseCustomerMaster — Smart Merging & Credit Limit', () => {
  it('should parse valid customer master rows and extract credit limit', () => {
    const rawRows = [
      {
        'Müşteri': '5000188291',
        'Dist Satış Şefi Adı': 'Ahmet Şef',
        'Satış Temsilcisi Adı': 'Ali Yılmaz',
        'Satış Kanalı Tanımı': 'Trakya Md',
        'Tabela Adı': 'AHMET MARKET',
        'Müşteri Adı': 'AHMET MARKET GIDA LTD',
        'İl': 'Tekirdağ',
        'İlçe': 'Çorlu',
        'Telefon': '05321234567',
        'Müşteri Durumu': 'Aktif',
        'Kredi Limiti': '100.000,00'
      }
    ];

    const result = parseCustomerMaster(rawRows);
    expect(result.records).toHaveLength(1);
    const rec = result.records[0];
    expect(rec.customerId).toBe('5000188291');
    expect(rec.salesRepName).toBe('Ali Yılmaz');
    expect(rec.creditLimit).toBe(100000);
  });

  it('should smart-merge two rows with the same customerId (Bira / Distile)', () => {
    const rawRows = [
      {
        'Müşteri': '5000188291',
        'Satış Temsilcisi Adı': 'Ali Yılmaz (Bira)',
        'Satış Kanalı Tanımı': 'Trakya Md',
        'Tabela Adı': 'AHMET MARKET',
        'Müşteri Adı': 'AHMET MARKET GIDA LTD',
        'Kredi Limiti': '100000'
      },
      {
        'Müşteri': '5000188291',
        'Satış Temsilcisi Adı': 'Mehmet Demir (Distile)',
        'Satış Kanalı Tanımı': 'Trakya Distile Md',
        'Tabela Adı': 'AHMET MARKET',
        'Müşteri Adı': 'AHMET MARKET GIDA LTD',
        'Kredi Limiti': '150000'
      }
    ];

    const result = parseCustomerMaster(rawRows);
    expect(result.records).toHaveLength(1);
    const merged = result.records[0];

    expect(merged.customerId).toBe('5000188291');
    expect(merged.creditLimit).toBe(250000);
    expect(merged.salesRepName).toContain('Ali Yılmaz (Bira)');
    expect(merged.salesRepName).toContain('Mehmet Demir (Distile)');
    expect(merged.salesChannel).toContain('Trakya Md');
    expect(merged.salesChannel).toContain('Trakya Distile Md');
    expect(merged.signName).toBe('AHMET MARKET (Bira / Distile)');
    expect(result.warnings.some(w => w.includes('Bira/Distile'))).toBe(true);
  });

  it('should skip 6-digit Migros codes and warn on invalid customer codes', () => {
    const rawRows = [
      { 'Müşteri': '123456' }, // Migros
      { 'Müşteri': 'INVALID' }
    ];

    const result = parseCustomerMaster(rawRows);
    expect(result.records).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('Migros'))).toBe(true);
    expect(result.warnings.some(w => w.includes('Geçersiz'))).toBe(true);
  });
});
