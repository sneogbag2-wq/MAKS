import { describe, it, expect } from 'vitest';
import {
  calculateBalance,
  getAllCollectionEvents,
  getDaysOverdue,
  getAgingBuckets,
  calculateOverdueRatio,
  calculateFinancialHealthScore,
  calculateCEI,
  calculateParetoConcentration
} from '../cariCalculations';

describe('cariCalculations', () => {
  describe('calculateBalance', () => {
    it('should calculate balance = Sales - Collections - CreditNotes', () => {
      const sales = [{ amount: 1000 }, { amount: 500 }];
      const collections = [{ amount: 400 }];
      const creditNotes = [{ amount: 100 }];
      expect(calculateBalance(sales, collections, creditNotes)).toBe(1000);
    });

    it('should return 0 when no data is provided', () => {
      expect(calculateBalance([], [], [])).toBe(0);
    });

    it('should return negative balance if customer overpaid', () => {
      const sales = [{ amount: 500 }];
      const collections = [{ amount: 800 }];
      expect(calculateBalance(sales, collections, [])).toBe(-300);
    });
  });

  describe('getDaysOverdue', () => {
    it('should calculate correct overdue days based on reference date', () => {
      const refDate = new Date('2026-07-30');
      expect(getDaysOverdue('2026-07-20', refDate)).toBe(10);
      expect(getDaysOverdue('2026-06-30', refDate)).toBe(30);
      expect(getDaysOverdue('2026-07-30', refDate)).toBe(0);
    });

    it('should return 0 for invalid dates', () => {
      expect(getDaysOverdue(null)).toBe(0);
      expect(getDaysOverdue('invalid-date')).toBe(0);
    });
  });

  describe('getAgingBuckets (Karar #12 FIFO Aging)', () => {
    const refDate = new Date('2026-07-30');

    it('should return all 0s when net balance <= 0', () => {
      const sales = [{ invoiceDate: '2026-01-01', amount: 500 }];
      const collections = [{ amount: 500 }];
      const buckets = getAgingBuckets(sales, collections, [], refDate);

      expect(buckets.current).toBe(0);
      expect(buckets.days30).toBe(0);
      expect(buckets.days60).toBe(0);
      expect(buckets.days90).toBe(0);
      expect(buckets.over90).toBe(0);
      expect(buckets.averageVade).toBe(0);
    });

    it('should apply FIFO aging correctly to remaining unpaid amounts', () => {
      const sales = [
        { invoiceDate: '2026-03-01', amount: 1000 },
        { invoiceDate: '2026-06-15', amount: 600 },
        { invoiceDate: '2026-07-15', amount: 400 },
      ];
      const collections = [{ amount: 1200 }];
      const buckets = getAgingBuckets(sales, collections, [], refDate);

      expect(buckets.over90).toBe(0);
      expect(buckets.days30).toBe(400);
      expect(buckets.current).toBe(400);
      expect(buckets.days60).toBe(0);
      expect(buckets.days90).toBe(0);
    });
  });

  describe('getAllCollectionEvents', () => {
    it('should combine collections and credit notes sorted by date', () => {
      const collections = [{ date: '2026-07-10', method: 'NAKİT', amount: 100 }];
      const creditNotes = [{ date: '2026-07-05', type: 'IADE_FATURASI', amount: 50 }];

      const events = getAllCollectionEvents(collections, creditNotes);
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('ALACAK_DEKONTU');
      expect(events[0].amount).toBe(50);
      expect(events[1].eventType).toBe('TAHSILAT');
      expect(events[1].amount).toBe(100);
    });
  });

  describe('Financial Analysis & CFO Ratios', () => {
    it('calculateOverdueRatio should calculate percentage of overdue debt', () => {
      const agingBuckets = { current: 1000, days30: 500, days60: 500, days90: 0, over90: 0 };
      expect(calculateOverdueRatio(agingBuckets, 2000)).toBe(50);
    });

    it('calculateFinancialHealthScore should score customer risk accurately', () => {
      const cleanBuckets = { current: 1000, days30: 0, days60: 0, days90: 0, over90: 0 };
      const cleanScore = calculateFinancialHealthScore(cleanBuckets, 1000, 30);
      expect(cleanScore.healthScore).toBeGreaterThanOrEqual(90);
      expect(cleanScore.riskLevel).toContain('DÜŞÜK RİSK');

      const riskyBuckets = { current: 100, days30: 200, days60: 200, days90: 200, over90: 300 };
      const riskyScore = calculateFinancialHealthScore(riskyBuckets, 1000, 60);
      expect(riskyScore.healthScore).toBeLessThan(50);
      expect(riskyScore.riskLevel).toContain('KRİTİK RİSK');
    });

    it('calculateCEI should return collection effectiveness index', () => {
      expect(calculateCEI(800, 1000, 200)).toBe(80);
    });

    it('calculateParetoConcentration should calculate 80/20 concentration ratio', () => {
      const items = [
        { customerId: 'A', balance: 8000 },
        { customerId: 'B', balance: 1000 },
        { customerId: 'C', balance: 500 },
        { customerId: 'D', balance: 300 },
        { customerId: 'E', balance: 200 }
      ];
      const result = calculateParetoConcentration(items, 'balance');
      expect(result.countFor80Percent).toBe(1);
      expect(result.percentageOfCustomersFor80Percent).toBe(20);
      expect(result.isConcentrationHigh).toBe(true);
    });
  });
});
