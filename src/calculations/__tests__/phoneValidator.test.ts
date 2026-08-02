import { describe, it, expect } from 'vitest';
import { validatePhone } from '../phoneValidator';

describe('validatePhone', () => {
  it('should validate and clean correct Turkish 10-digit mobile numbers', () => {
    expect(validatePhone('5321234567')).toBe('5321234567');
    expect(validatePhone('05321234567')).toBe('5321234567');
    expect(validatePhone('+90 532 123 45 67')).toBe('5321234567');
    expect(validatePhone('532-123-45-67')).toBe('5321234567');
  });

  it('should reject invalid or landline numbers', () => {
    expect(validatePhone('2121234567')).toBeNull();
    expect(validatePhone('02121234567')).toBeNull();
    expect(validatePhone('12345')).toBeNull();
    expect(validatePhone('')).toBeNull();
    expect(validatePhone(null)).toBeNull();
    expect(validatePhone(undefined)).toBeNull();
  });

  it('should reject known placeholder phone numbers', () => {
    expect(validatePhone('5999999999')).toBeNull();
    expect(validatePhone('5559999999')).toBeNull();
  });
});
