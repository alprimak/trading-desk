import { useMemo, useRef, useEffect } from 'react';
import { Grid, Column } from '@askturret/grid';
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
      if (prevPos && pos.status === 'open') {
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

  const getChangeClass = (posId: string, field: string) => {
    const change = changesRef.current.get(`${posId}-${field}`);
    return change ? `cell-change-${change.direction}` : '';
  };

  const getPnLClass = (pnl: number) => {
    if (pnl > 0) return 'pnl-positive';
    if (pnl < 0) return 'pnl-negative';
    return '';
  };

  // Column definitions for @askturret/grid
  const columns: Column<Position>[] = useMemo(
    () => [
      {
        id: 'symbol',
        header: 'Symbol',
        accessorKey: 'symbol',
        cell: ({ value }: { value: string }) => (
          <span className="symbol">{value}</span>
        ),
      },
      {
        id: 'side',
        header: 'Side',
        accessorKey: 'side',
        cell: ({ value }: { value: 'long' | 'short' }) => (
          <span className={`side side-${value}`}>{value.toUpperCase()}</span>
        ),
      },
      {
        id: 'qty',
        header: 'Qty',
        accessorKey: 'qty',
        align: 'right',
        cell: ({ value }: { value: number }) => (
          <span className="tabular-nums">{value}</span>
        ),
      },
      {
        id: 'entry_price',
        header: 'Entry',
        accessorKey: 'entry_price',
        align: 'right',
        cell: ({ value }: { value: number }) => (
          <span className="tabular-nums">${value.toFixed(2)}</span>
        ),
      },
      {
        id: 'mark_price',
        header: 'Mark',
        accessorKey: 'mark_price',
        align: 'right',
        cell: ({ value, row }: { value: number; row: Position }) => (
          <span
            className={`tabular-nums ${getChangeClass(row.id, 'mark_price')}`}
          >
            ${value.toFixed(2)}
          </span>
        ),
      },
      {
        id: 'unrealized_pnl',
        header: 'P&L $',
        accessorKey: 'unrealized_pnl',
        align: 'right',
        cell: ({ value, row }: { value: number; row: Position }) => {
          const sign = value >= 0 ? '+' : '';
          return (
            <span
              className={`tabular-nums ${getPnLClass(value)} ${getChangeClass(
                row.id,
                'unrealized_pnl'
              )}`}
            >
              {sign}
              {value.toFixed(2)}
            </span>
          );
        },
      },
      {
        id: 'pnl_pct',
        header: 'P&L %',
        accessorFn: (row: Position) =>
          (row.unrealized_pnl / (row.entry_price * row.qty)) * 100,
        align: 'right',
        cell: ({ value, row }: { value: number; row: Position }) => {
          const sign = value >= 0 ? '+' : '';
          return (
            <span className={`tabular-nums ${getPnLClass(row.unrealized_pnl)}`}>
              {sign}
              {value.toFixed(2)}%
            </span>
          );
        },
      },
      {
        id: 'age',
        header: 'Age',
        accessorKey: 'opened_at',
        align: 'right',
        cell: ({ value }: { value: string }) => {
          const seconds = Math.floor(
            (Date.now() - new Date(value).getTime()) / 1000
          );
          let display;
          if (seconds < 60) display = `${seconds}s`;
          else if (seconds < 3600)
            display = `${Math.floor(seconds / 60)}m`;
          else display = `${Math.floor(seconds / 3600)}h`;
          return <span className="tabular-nums">{display}</span>;
        },
      },
      {
        id: 'action',
        header: 'Action',
        cell: ({ row }: { row: Position }) => (
          <button
            onClick={() => onExitPosition(row.id)}
            className="exit-button"
          >
            Exit
          </button>
        ),
      },
    ],
    [onExitPosition]
  );

  if (openPositions.length === 0) {
    return (
      <div className="positions-grid">
        <div className="empty-state">No open positions</div>
      </div>
    );
  }

  return (
    <div className="positions-grid">
      <Grid
        data={openPositions}
        columns={columns}
        getRowId={(row: Position) => row.id}
        className="positions-table"
      />
    </div>
  );
}
