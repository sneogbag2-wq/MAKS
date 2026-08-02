import { describe, it, expect } from 'vitest';
import { getAgingBuckets } from '../cariCalculations';

const REF = new Date('2026-07-30T00:00:00Z');

function invoiceDaysAgo(days: number, amount: number, id = `INV-${days}`) {
  const d = new Date(REF);
  d.setUTCDate(d.getUTCDate() - days);
  return { invoiceId: id, invoiceDate: d.toISOString().slice(0, 10), amount };
}

describe('getAgingBuckets — dilim dağılımı (mini bar grafiği verisi)', () => {
  it('her dilim için ödenmemiş fatura tutarlarını distribution içinde döner', () => {
    const sales = [
      invoiceDaysAgo(10, 1000, 'A'),
      invoiceDaysAgo(15, 500, 'B'),
      invoiceDaysAgo(45, 2000, 'C'),
    ];
    const buckets = getAgingBuckets(sales, [], [], REF);

    expect(buckets.distribution).toBeDefined();
    expect(buckets.distribution.current).toEqual([1000, 500]);
    expect(buckets.distribution.days30).toEqual([2000]);
    expect(buckets.distribution.days60).toEqual([]);
  });

  it('distribution toplamı ilgili dilim tutarına eşittir', () => {
    const sales = [invoiceDaysAgo(5, 300), invoiceDaysAgo(20, 700)];
    const buckets = getAgingBuckets(sales, [], [], REF);

    const sum = buckets.distribution.current.reduce((s, v) => s + v, 0);
    expect(sum).toBe(buckets.current);
  });

  it('bakiye <= 0 ise tüm dilimler ve dağılımlar boştur', () => {
    const sales = [invoiceDaysAgo(100, 1000)];
    const collections = [{ amount: 1000, date: '2026-07-01' }];
    const buckets = getAgingBuckets(sales, collections, [], REF);

    expect(buckets.current).toBe(0);
    expect(buckets.over90).toBe(0);
    expect(buckets.distribution.over90).toEqual([]);
  });

  it('FIFO ile kısmen kapatılan faturanın yalnızca kalan kısmı dağılıma girer', () => {
    const sales = [invoiceDaysAgo(10, 1000)];
    const collections = [{ amount: 600, date: '2026-07-20' }];
    const buckets = getAgingBuckets(sales, collections, [], REF);

    expect(buckets.current).toBe(400);
    expect(buckets.distribution.current).toEqual([400]);
  });
});

describe('90+ gün birleştirmesi (days90 + over90)', () => {
  it('91–120 gün arası borç days90 dilimine düşer ve kaybolmaz', () => {
    const sales = [invoiceDaysAgo(100, 5000)];
    const buckets = getAgingBuckets(sales, [], [], REF);

    expect(buckets.days90).toBe(5000);
    expect(buckets.over90).toBe(0);

    expect(buckets.days90 + buckets.over90).toBe(5000);
  });

  it('120+ gün borç over90 dilimine düşer', () => {
    const sales = [invoiceDaysAgo(200, 3000)];
    const buckets = getAgingBuckets(sales, [], [], REF);

    expect(buckets.over90).toBe(3000);
    expect(buckets.days90).toBe(0);
  });

  it('her iki dilimde de borç varsa toplam doğru hesaplanır', () => {
    const sales = [invoiceDaysAgo(100, 5000, 'X'), invoiceDaysAgo(200, 3000, 'Y')];
    const buckets = getAgingBuckets(sales, [], [], REF);

    expect(buckets.days90).toBe(5000);
    expect(buckets.over90).toBe(3000);
    expect(buckets.days90 + buckets.over90).toBe(8000);

    const merged = [...buckets.distribution.days90, ...buckets.distribution.over90]
      .sort((a, b) => b - a);
    expect(merged).toEqual([5000, 3000]);
  });

  it('tüm dilimlerin toplamı net bakiyeye eşittir', () => {
    const sales = [
      invoiceDaysAgo(10, 1000),
      invoiceDaysAgo(45, 2000),
      invoiceDaysAgo(75, 1500),
      invoiceDaysAgo(100, 800),
      invoiceDaysAgo(200, 700),
    ];
    const buckets = getAgingBuckets(sales, [], [], REF);
    const total =
      buckets.current + buckets.days30 + buckets.days60 + buckets.days90 + buckets.over90;

    expect(total).toBe(6000);
  });
});
