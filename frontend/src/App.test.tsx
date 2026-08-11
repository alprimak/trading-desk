import { describe, it, expect } from 'vitest';
import type { Position } from './types';

// Test the summary calculation logic from App.tsx
describe('App summary calculations', () => {
  describe('unrealizedPnL aggregation', () => {
    it('sums unrealized_pnl across open positions only', () => {
      const positions: Position[] = [
        {
          id: '1',
          symbol: 'BTC-USD',
          side: 'long',
          qty: 1,
          entry_price: 50000,
          mark_price: 51000,
          unrealized_pnl: 1000,
          opened_at: '2024-01-01T00:00:00Z',
          status: 'open',
        },
        {
          id: '2',
          symbol: 'ETH-USD',
          side: 'short',
          qty: 10,
          entry_price: 3000,
          mark_price: 2900,
          unrealized_pnl: 1000,
          opened_at: '2024-01-01T00:00:00Z',
          status: 'open',
        },
        {
          id: '3',
          symbol: 'SOL-USD',
          side: 'long',
          qty: 100,
          entry_price: 100,
          mark_price: 95,
          unrealized_pnl: -500,
          opened_at: '2024-01-01T00:00:00Z',
          status: 'closed',
          exit_price: 95,
          realized_pnl: -500,
        },
      ];

      const openPositions = positions.filter((p) => p.status === 'open');
      const unrealizedPnL = openPositions.reduce((sum, p) => sum + p.unrealized_pnl, 0);

      expect(unrealizedPnL).toBe(2000); // Only open positions: 1000 + 1000
    });

    it('returns 0 when no open positions', () => {
      const positions: Position[] = [];
      const openPositions = positions.filter((p) => p.status === 'open');
      const unrealizedPnL = openPositions.reduce((sum, p) => sum + p.unrealized_pnl, 0);

      expect(unrealizedPnL).toBe(0);
    });

    it('handles negative unrealized P&L', () => {
      const positions: Position[] = [
        {
          id: '1',
          symbol: 'BTC-USD',
          side: 'long',
          qty: 1,
          entry_price: 50000,
          mark_price: 48000,
          unrealized_pnl: -2000,
          opened_at: '2024-01-01T00:00:00Z',
          status: 'open',
        },
      ];

      const openPositions = positions.filter((p) => p.status === 'open');
      const unrealizedPnL = openPositions.reduce((sum, p) => sum + p.unrealized_pnl, 0);

      expect(unrealizedPnL).toBe(-2000);
    });
  });

  describe('realizedPnL aggregation', () => {
    it('sums realized_pnl across ALL positions (open + closed)', () => {
      const positions: Position[] = [
        {
          id: '1',
          symbol: 'BTC-USD',
          side: 'long',
          qty: 1,
          entry_price: 50000,
          mark_price: 51000,
          unrealized_pnl: 1000,
          opened_at: '2024-01-01T00:00:00Z',
          status: 'open',
          realized_pnl: 200, // Partial reduce
        },
        {
          id: '2',
          symbol: 'ETH-USD',
          side: 'short',
          qty: 10,
          entry_price: 3000,
          mark_price: 2900,
          unrealized_pnl: 0,
          opened_at: '2024-01-01T00:00:00Z',
          status: 'closed',
          exit_price: 2900,
          realized_pnl: 1000,
        },
      ];

      const realizedPnL = positions.reduce((sum, p) => sum + (p.realized_pnl ?? 0), 0);

      expect(realizedPnL).toBe(1200); // 200 + 1000
    });

    it('handles missing realized_pnl (null/undefined)', () => {
      const positions: Position[] = [
        {
          id: '1',
          symbol: 'BTC-USD',
          side: 'long',
          qty: 1,
          entry_price: 50000,
          mark_price: 51000,
          unrealized_pnl: 1000,
          opened_at: '2024-01-01T00:00:00Z',
          status: 'open',
          // No realized_pnl field
        },
      ];

      const realizedPnL = positions.reduce((sum, p) => sum + (p.realized_pnl ?? 0), 0);

      expect(realizedPnL).toBe(0);
    });

    it('returns 0 when no positions have realized P&L', () => {
      const positions: Position[] = [
        {
          id: '1',
          symbol: 'BTC-USD',
          side: 'long',
          qty: 1,
          entry_price: 50000,
          mark_price: 51000,
          unrealized_pnl: 1000,
          opened_at: '2024-01-01T00:00:00Z',
          status: 'open',
        },
      ];

      const realizedPnL = positions.reduce((sum, p) => sum + (p.realized_pnl ?? 0), 0);

      expect(realizedPnL).toBe(0);
    });
  });

  describe('color class selection', () => {
    it('selects pnl-positive for positive unrealized P&L', () => {
      const unrealizedPnL = 1234.56;
      const colorClass = unrealizedPnL >= 0 ? 'pnl-positive' : 'pnl-negative';
      expect(colorClass).toBe('pnl-positive');
    });

    it('selects pnl-negative for negative unrealized P&L', () => {
      const unrealizedPnL = -1234.56;
      const colorClass = unrealizedPnL >= 0 ? 'pnl-positive' : 'pnl-negative';
      expect(colorClass).toBe('pnl-negative');
    });

    it('selects pnl-positive for zero unrealized P&L', () => {
      const unrealizedPnL = 0;
      const colorClass = unrealizedPnL >= 0 ? 'pnl-positive' : 'pnl-negative';
      expect(colorClass).toBe('pnl-positive');
    });

    it('selects neutral (empty string) for zero realized P&L (issue #20)', () => {
      const realizedPnL = 0;
      const colorClass = realizedPnL === 0 ? '' : realizedPnL >= 0 ? 'pnl-positive' : 'pnl-negative';
      expect(colorClass).toBe('');
    });

    it('selects pnl-positive for positive realized P&L', () => {
      const realizedPnL = 100;
      const colorClass = realizedPnL === 0 ? '' : realizedPnL >= 0 ? 'pnl-positive' : 'pnl-negative';
      expect(colorClass).toBe('pnl-positive');
    });

    it('selects pnl-negative for negative realized P&L', () => {
      const realizedPnL = -100;
      const colorClass = realizedPnL === 0 ? '' : realizedPnL >= 0 ? 'pnl-positive' : 'pnl-negative';
      expect(colorClass).toBe('pnl-negative');
    });
  });
});
