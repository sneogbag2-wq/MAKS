import { describe, it, expect, beforeAll } from 'vitest';
import {
  initFromArchive,
  searchCustomersSync,
  getCustomerStatementSync,
  getMonthlySalesRepPerformanceSync,
  getCurrentStatusSync,
  getInvoiceControlDataSync,
  calculateDeepInvoiceAnalysisSync,
  invalidateCache
} from '../customerService';

describe('customerService unit tests', () => {
  beforeAll(async () => {
    await initFromArchive();
  });

  it('should search customers by query and return valid list', () => {
    const all = searchCustomersSync();
    expect(all).toBeInstanceOf(Array);
    expect(all.length).toBeGreaterThan(0);

    const filtered = searchCustomersSync('5000188291');
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0].customerId).toBe('5000188291');
  });

  it('should generate customer statement sync', () => {
    const stmt = getCustomerStatementSync('5000188291');
    expect(stmt).toHaveProperty('customer');
    expect(stmt).toHaveProperty('balance');
    expect(stmt).toHaveProperty('transactions');
    expect(stmt.transactions).toBeInstanceOf(Array);
  });

  it('should calculate monthly sales rep performance sync', () => {
    const repPerf = getMonthlySalesRepPerformanceSync();
    expect(repPerf).toHaveProperty('monthLabel');
    expect(repPerf).toHaveProperty('repList');
    expect(repPerf.repList).toBeInstanceOf(Array);
  });

  it('should return current dashboard status metrics sync', () => {
    const status = getCurrentStatusSync();
    expect(status).toHaveProperty('openInvoiceCount');
    expect(status).toHaveProperty('todayCollections');
    expect(status).toHaveProperty('portfolioAverageTerm');
  });

  it('should calculate invoice control data for a given date', () => {
    const ctrlData = getInvoiceControlDataSync('2026-07-30');
    expect(ctrlData).toHaveProperty('customers');
    expect(ctrlData).toHaveProperty('stats');
  });

  it('should calculate 5-pillar deep invoice analysis sync', () => {
    const analysis = calculateDeepInvoiceAnalysisSync('5000266833', '2026-07-28');
    expect(analysis).toHaveProperty('tier');
    expect(analysis).toHaveProperty('badgeTag');
    expect(analysis).toHaveProperty('subtitle');
    expect(analysis).toHaveProperty('advice');
    expect(analysis.avgInvoiceAmount).toBeGreaterThanOrEqual(0);
  });

  it('should invalidate caches cleanly', () => {
    expect(() => invalidateCache()).not.toThrow();
  });
});

