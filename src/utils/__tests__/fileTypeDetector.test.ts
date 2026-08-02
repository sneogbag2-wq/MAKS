import { describe, it, expect } from 'vitest';
import { detectFileType } from '../fileTypeDetector';

describe('detectFileType', () => {
  it('should auto-detect MUSTERI_MASTER by filename', async () => {
    const file = new File([''], 'Müşteri_Master_Listesi_2026.xlsx');
    const result = await detectFileType(file);
    expect(result.key).toBe('MUSTERI_MASTER');
    expect(result.confidence).toBe('high');
  });

  it('should auto-detect SATIS by filename', async () => {
    const file = new File([''], 'Satış_(Veri_Yazma)_Listesi_29072026.xlsx');
    const result = await detectFileType(file);
    expect(result.key).toBe('SATIS');
  });

  it('should auto-detect SATIN_ALMA by filename', async () => {
    const file = new File([''], 'Satın_Alma_(Veri_Yazma)_Listesi_29072026.xlsx');
    const result = await detectFileType(file);
    expect(result.key).toBe('SATIN_ALMA');
  });

  it('should auto-detect HAVALE_TAHSILAT by filename', async () => {
    const file = new File([''], 'Havale_Tahsilatı_Listesi_29072026.xlsx');
    const result = await detectFileType(file);
    expect(result.key).toBe('HAVALE_TAHSILAT');
  });

  it('should auto-detect NAKIT_TAHSILAT by filename', async () => {
    const file = new File([''], 'Nakit_Tahsilat_Listesi_29072026.xlsx');
    const result = await detectFileType(file);
    expect(result.key).toBe('NAKIT_TAHSILAT');
  });

  it('should return null key for unrecognized filename', async () => {
    const file = new File([''], 'random_unknown_file.xlsx');
    const result = await detectFileType(file);
    expect(result.key).toBeNull();
  });
});
