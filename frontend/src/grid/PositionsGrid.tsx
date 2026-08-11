import { useMemo, useRef, useEffect } from 'react';
import type { Position } from '../types';
import './PositionsGrid.css';

interface PositionsGridProps {
  positions: Position[];
  onExitPosition: (positionId: string) => void;
}

interface CellChange {
  rowId: string;
  field: string;
  direction: 'up' | 'down' | 'stale';
  timestamp: number;
}

export function PositionsGrid({ positions, onExitPosition }: PositionsGridProps) {
  const prevPositionsRef = useRef<Map<string, Position>>(new Map());
  const changesRef = useRef<Map<string, CellChange>>(new Map());

  // Track cell changes for flashing animations
  useEffect(() => {
    const prev = prevPositionsRef.current;
    const changes = new Map<string, CellChange>();

    positions.forEach((pos) => {
      const prevPos = prev.get(pos.id);
      if (prevPos) {
        // Check for changes in numeric fields
        const fields: (keyof Position)[] = ['mark_price', 'unrealized_pnl'];
        fields.forEach((field) => {
          const prevValue = prevPos[field] as number;
          const currentValue = pos[field] as number;
          if (prevValue !== currentValue) {
            const direction = currentValue > prevValue ? 'up' : 'down';
            changes.set(`${pos.id}-${field}`, {
              rowId: pos.id,
              field: field as string,
              direction,
              timestamp: Date.now(),
            });
          }
        });
      }
    });

    changesRef.current = changes;

    // Update previous positions
    const newPrev = new Map<string, Position>();
    positions.forEach((p) => newPrev.set(p.id, p));
    prevPositionsRef.current = newPrev;

    // Clear old changes after animation duration
    const timer = setTimeout(() => {
      const now = Date.now();
      changesRef.current.forEach((change, key) => {
        if (now - change.timestamp > 180) {
          changesRef.current.delete(key);
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [positions]);

  const openPositions = useMemo(
    () => positions.filter((p) => p.status === 'open'),
    [positions]
  );

  const formatPrice = (price: number) => price.toFixed(2);
  const formatPnL = (pnl: number) => {
    const sign = pnl >= 0 ? '+' : '';
    return `${sign}${pnl.toFixed(2)}`;
  };
  const formatPnLPct = (pnl: number, entry: number, qty: number) => {
    const pct = (pnl / (entry * qty)) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  };
  const formatAge = (openedAt: string) => {
    const seconds = Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  const getChangeClass = (posId: string, field: string) => {
    const change = changesRef.current.get(`${posId}-${field}`);
    return change ? `cell-change-${change.direction}` : '';
  };

  const getPnLClass = (pnl: number) => {
    if (pnl > 0) return 'pnl-positive';
    if (pnl < 0) return 'pnl-negative';
    return '';
  };

  return (
    <div className="positions-grid">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Side</th>
            <th className="align-right">Qty</th>
            <th className="align-right">Entry</th>
            <th className="align-right">Mark</th>
            <th className="align-right">P&L $</th>
            <th className="align-right">P&L %</th>
            <th className="align-right">Age</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {openPositions.length === 0 ? (
            <tr>
              <td colSpan={9} className="empty-state">
                No open positions
              </td>
            </tr>
          ) : (
            openPositions.map((pos) => (
              <tr key={pos.id}>
                <td className="symbol">{pos.symbol}</td>
                <td className={`side side-${pos.side}`}>
                  {pos.side.toUpperCase()}
                </td>
                <td className="align-right tabular-nums">{pos.qty}</td>
                <td className="align-right tabular-nums">
                  ${formatPrice(pos.entry_price)}
                </td>
                <td
                  className={`align-right tabular-nums ${getChangeClass(
                    pos.id,
                    'mark_price'
                  )}`}
                >
                  ${formatPrice(pos.mark_price)}
                </td>
                <td
                  className={`align-right tabular-nums ${getPnLClass(
                    pos.unrealized_pnl
                  )} ${getChangeClass(pos.id, 'unrealized_pnl')}`}
                >
                  {formatPnL(pos.unrealized_pnl)}
                </td>
                <td
                  className={`align-right tabular-nums ${getPnLClass(
                    pos.unrealized_pnl
                  )}`}
                >
                  {formatPnLPct(pos.unrealized_pnl, pos.entry_price, pos.qty)}
                </td>
                <td className="align-right tabular-nums">
                  {formatAge(pos.opened_at)}
                </td>
                <td>
                  <button
                    onClick={() => onExitPosition(pos.id)}
                    className="exit-button"
                  >
                    Exit
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
