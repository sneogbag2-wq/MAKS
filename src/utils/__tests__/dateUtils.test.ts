import { describe, it, expect } from 'vitest';
import { safeIsoDate } from '../dateUtils';

describe('safeIsoDate', () => {
  it('should parse Turkish date string DD.MM.YYYY', () => {
    const iso = safeIsoDate('29.07.2026');
    expect(iso).toContain('2026-07-29');
  });

  it('should parse Turkish date string with slashes DD/MM/YYYY', () => {
    const iso = safeIsoDate('15/05/2026');
    expect(iso).toContain('2026-05-15');
  });

  it('should parse JavaScript Date object', () => {
    const d = new Date('2026-07-29T10:00:00.000Z');
    expect(safeIsoDate(d)).toBe('2026-07-29T10:00:00.000Z');
  });

  it('should parse Excel serial numbers', () => {
    const iso = safeIsoDate(46232);
    expect(iso).not.toBeNull();
    expect(iso).toContain('2026-07-29');
  });

  it('should return null safely for invalid date strings or null without throwing', () => {
    expect(safeIsoDate(null)).toBeNull();
    expect(safeIsoDate(undefined)).toBeNull();
    expect(safeIsoDate('')).toBeNull();
    expect(safeIsoDate('invalid-date-string')).toBeNull();
  });
});
