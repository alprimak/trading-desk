import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { Position } from './types';
import App from './App';

/**
 * These tests render the real <App /> component and assert against its
 * rendered output — they do NOT reimplement App's summary logic.
 *
 * Two collaborators are stubbed so the assertions stay focused on App itself:
 *   - useWebSocket: the data source. Stubbing it is how we inject positions.
 *   - PositionsGrid / SummaryPanel: separate components (explicitly out of
 *     scope for #28) that pull in the WASM-backed grid and a streaming fetch.
 *
 * Everything under test — the open-position filter, both P&L aggregations,
 * the color-class ternaries and the formatPnL output — is App.tsx's own code.
 */

const wsState = vi.hoisted(() => ({
  positions: [] as Position[],
  connected: true,
  lastError: null as string | null,
}));

vi.mock('./ws/useWebSocket', () => ({
  useWebSocket: () => ({
    positions: wsState.positions,
    connected: wsState.connected,
    lastError: wsState.lastError,
    enterPosition: vi.fn(),
    exitPosition: vi.fn(),
    adjustPosition: vi.fn(),
  }),
}));

vi.mock('./grid/PositionsGrid', () => ({
  PositionsGrid: ({ positions }: { positions: Position[] }) => (
    <div data-testid="positions-grid">{positions.length}</div>
  ),
}));

vi.mock('./agent/SummaryPanel', () => ({
  SummaryPanel: () => <div data-testid="summary-panel" />,
}));

/** Build a position fixture; every field is overridable per test. */
function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id: '1',
    symbol: 'BTC-USD',
    side: 'long',
    qty: 1,
    entry_price: 50000,
    mark_price: 51000,
    unrealized_pnl: 0,
    opened_at: '2024-01-01T00:00:00Z',
    status: 'open',
    ...overrides,
  };
}

/** Render App with the given websocket state and return the summary spans. */
function renderApp(state: Partial<typeof wsState> = {}) {
  wsState.positions = state.positions ?? [];
  wsState.connected = state.connected ?? true;
  wsState.lastError = state.lastError ?? null;
  render(<App />);
}

/** The `.summary-value` span sitting next to the given summary label. */
function summaryValue(label: string): HTMLElement {
  const item = screen.getByText(label).closest('.summary-item');
  expect(item).not.toBeNull();
  const value = item!.querySelector('.summary-value');
  expect(value).not.toBeNull();
  return value as HTMLElement;
}

beforeEach(() => {
  wsState.positions = [];
  wsState.connected = true;
  wsState.lastError = null;
});

afterEach(() => {
  cleanup();
});

describe('App summary rendering', () => {
  describe('unrealized P&L', () => {
    it('sums unrealized_pnl across open positions only', () => {
      renderApp({
        positions: [
          makePosition({ id: '1', unrealized_pnl: 1000, status: 'open' }),
          makePosition({ id: '2', unrealized_pnl: 1000, status: 'open' }),
          makePosition({
            id: '3',
            unrealized_pnl: -500,
            status: 'closed',
            exit_price: 95,
            realized_pnl: -500,
          }),
        ],
      });

      // Closed position's -500 must NOT be included: 1000 + 1000
      expect(summaryValue('Unrealized P&L').textContent).toBe('+$2,000.00');
    });

    it('renders +$0.00 when there are no open positions', () => {
      renderApp({ positions: [] });

      expect(summaryValue('Unrealized P&L').textContent).toBe('+$0.00');
    });

    it('renders negative unrealized P&L with the sign before the dollar', () => {
      renderApp({
        positions: [makePosition({ unrealized_pnl: -2000, status: 'open' })],
      });

      expect(summaryValue('Unrealized P&L').textContent).toBe('-$2,000.00');
    });

    it('applies pnl-positive for positive unrealized P&L', () => {
      renderApp({
        positions: [makePosition({ unrealized_pnl: 1234.56, status: 'open' })],
      });

      const value = summaryValue('Unrealized P&L');
      expect(value.classList.contains('pnl-positive')).toBe(true);
      expect(value.classList.contains('pnl-negative')).toBe(false);
    });

    it('applies pnl-negative for negative unrealized P&L', () => {
      renderApp({
        positions: [makePosition({ unrealized_pnl: -1234.56, status: 'open' })],
      });

      const value = summaryValue('Unrealized P&L');
      expect(value.classList.contains('pnl-negative')).toBe(true);
      expect(value.classList.contains('pnl-positive')).toBe(false);
    });

    it('applies pnl-positive for zero unrealized P&L', () => {
      renderApp({
        positions: [makePosition({ unrealized_pnl: 0, status: 'open' })],
      });

      expect(summaryValue('Unrealized P&L').classList.contains('pnl-positive')).toBe(true);
    });
  });

  describe('realized P&L', () => {
    it('sums realized_pnl across ALL positions (open + closed)', () => {
      renderApp({
        positions: [
          // Open position carrying realized P&L from a partial reduce
          makePosition({ id: '1', unrealized_pnl: 1000, status: 'open', realized_pnl: 200 }),
          makePosition({
            id: '2',
            unrealized_pnl: 0,
            status: 'closed',
            exit_price: 2900,
            realized_pnl: 1000,
          }),
        ],
      });

      expect(summaryValue('Realized P&L').textContent).toBe('+$1,200.00');
    });

    it('treats a missing realized_pnl as zero', () => {
      renderApp({
        // No realized_pnl field at all
        positions: [makePosition({ unrealized_pnl: 1000, status: 'open' })],
      });

      expect(summaryValue('Realized P&L').textContent).toBe('+$0.00');
    });

    it('renders neutral color for zero realized P&L (issue #20)', () => {
      renderApp({
        positions: [makePosition({ realized_pnl: 0, status: 'open' })],
      });

      const value = summaryValue('Realized P&L');
      expect(value.classList.contains('pnl-positive')).toBe(false);
      expect(value.classList.contains('pnl-negative')).toBe(false);
    });

    it('applies pnl-positive for positive realized P&L', () => {
      renderApp({
        positions: [makePosition({ realized_pnl: 100, status: 'open' })],
      });

      const value = summaryValue('Realized P&L');
      expect(value.textContent).toBe('+$100.00');
      expect(value.classList.contains('pnl-positive')).toBe(true);
    });

    it('applies pnl-negative for negative realized P&L', () => {
      renderApp({
        positions: [makePosition({ realized_pnl: -100, status: 'open' })],
      });

      const value = summaryValue('Realized P&L');
      expect(value.textContent).toBe('-$100.00');
      expect(value.classList.contains('pnl-negative')).toBe(true);
    });
  });

  describe('open position count', () => {
    it('counts only open positions', () => {
      renderApp({
        positions: [
          makePosition({ id: '1', status: 'open' }),
          makePosition({ id: '2', status: 'open' }),
          makePosition({ id: '3', status: 'closed', realized_pnl: 10 }),
        ],
      });

      expect(summaryValue('Open Positions').textContent).toBe('2');
    });
  });
});

describe('App connection state', () => {
  it('shows Connected when the socket is up', () => {
    renderApp({ connected: true });

    expect(screen.getByText('Connected')).not.toBeNull();
    const indicator = document.querySelector('.status-indicator');
    expect(indicator?.classList.contains('connected')).toBe(true);
  });

  it('shows Disconnected when the socket is down', () => {
    renderApp({ connected: false });

    expect(screen.getByText('Disconnected')).not.toBeNull();
    const indicator = document.querySelector('.status-indicator');
    expect(indicator?.classList.contains('disconnected')).toBe(true);
  });

  it('renders the error banner only when there is an error', () => {
    renderApp({ lastError: null });
    expect(document.querySelector('.error-banner')).toBeNull();

    cleanup();

    renderApp({ lastError: 'connection refused' });
    const banner = document.querySelector('.error-banner');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('connection refused');
  });
});
