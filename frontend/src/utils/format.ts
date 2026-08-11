/**
 * Currency and number formatting utilities with thousands separators
 */

const currencyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a number as currency with thousands separators
 * @param value - The numeric value to format
 * @returns Formatted string like "$1,234.56"
 */
export function formatCurrency(value: number): string {
  return `$${currencyFormatter.format(Math.abs(value))}`;
}

/**
 * Format a P&L value with sign prefix and thousands separators
 * @param value - The P&L value to format
 * @returns Formatted string like "+$1,234.56" or "-$1,234.56"
 */
export function formatPnL(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${currencyFormatter.format(Math.abs(value))}`;
}
