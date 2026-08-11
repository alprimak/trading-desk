import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPnL } from './format';

describe('formatCurrency', () => {
  it('formats positive values with thousands separators', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
    expect(formatCurrency(45689.01)).toBe('$45,689.01');
    expect(formatCurrency(1000000.99)).toBe('$1,000,000.99');
  });

  it('formats negative values with thousands separators', () => {
    expect(formatCurrency(-1234.56)).toBe('$1,234.56');
    expect(formatCurrency(-45689.01)).toBe('$45,689.01');
  });

  it('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('always shows two decimal places', () => {
    expect(formatCurrency(100)).toBe('$100.00');
    expect(formatCurrency(100.1)).toBe('$100.10');
    expect(formatCurrency(100.99)).toBe('$100.99');
  });

  it('formats small values correctly', () => {
    expect(formatCurrency(0.01)).toBe('$0.01');
    expect(formatCurrency(9.99)).toBe('$9.99');
  });
});

describe('formatPnL', () => {
  it('formats positive values with + sign and thousands separators', () => {
    expect(formatPnL(1234.56)).toBe('+$1,234.56');
    expect(formatPnL(45689.01)).toBe('+$45,689.01');
    expect(formatPnL(1000000.99)).toBe('+$1,000,000.99');
  });

  it('formats negative values with - sign and thousands separators', () => {
    // Critical: sign before dollar sign, not after (issue #11)
    expect(formatPnL(-1234.56)).toBe('-$1,234.56');
    expect(formatPnL(-45689.01)).toBe('-$45,689.01');
    expect(formatPnL(-1631.65)).toBe('-$1,631.65');
  });

  it('formats zero with + sign', () => {
    expect(formatPnL(0)).toBe('+$0.00');
  });

  it('sign placement is correct (not $-X or -$-X)', () => {
    const negative = formatPnL(-100);
    expect(negative).toBe('-$100.00');
    expect(negative).not.toContain('$-');
    expect(negative).not.toContain('-$-');
  });

  it('always shows two decimal places', () => {
    expect(formatPnL(100)).toBe('+$100.00');
    expect(formatPnL(-100)).toBe('-$100.00');
    expect(formatPnL(100.1)).toBe('+$100.10');
  });

  it('handles small values', () => {
    expect(formatPnL(0.01)).toBe('+$0.01');
    expect(formatPnL(-0.01)).toBe('-$0.01');
  });
});
