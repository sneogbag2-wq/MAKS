import { describe, it, expect } from 'vitest';
import { getCancelledDocSet, filterCancelledPairs } from '../cancelledFilter';

describe('cancelledFilter', () => {
  const mockData = [
    { 'Fatura No': 'FT-001', 'Fatura Durum': 'CREATED', amount: 100 },
    { 'Fatura No': 'FT-002', 'Fatura Durum': 'CANCELLED', amount: 200 },
    { 'Fatura No': 'FT-002', 'Fatura Durum': 'CREATED', amount: 200 },
    { 'Fatura No': 'FT-003', 'Fatura Durum': 'CREATED', amount: 300 },
  ];

  it('should identify all document numbers with CANCELLED status', () => {
    const cancelledDocs = getCancelledDocSet(mockData, 'Fatura No', 'Fatura Durum');
    expect(cancelledDocs.has('FT-002')).toBe(true);
    expect(cancelledDocs.has('FT-001')).toBe(false);
    expect(cancelledDocs.size).toBe(1);
  });

  it('should filter out both CANCELLED record and its CREATED pair (two-pass filter)', () => {
    const cleaned = filterCancelledPairs(mockData, 'Fatura No', 'Fatura Durum');
    expect(cleaned).toHaveLength(2);
    expect(cleaned.map((r) => r['Fatura No'])).toEqual(['FT-001', 'FT-003']);
  });

  it('should return original rows if no CANCELLED status exists', () => {
    const cleanData = [
      { 'Fatura No': 'FT-001', 'Fatura Durum': 'CREATED' },
      { 'Fatura No': 'FT-003', 'Fatura Durum': 'CREATED' },
    ];
    const cleaned = filterCancelledPairs(cleanData, 'Fatura No', 'Fatura Durum');
    expect(cleaned).toEqual(cleanData);
  });
});
