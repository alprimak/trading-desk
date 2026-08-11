import { DataGrid, ColumnDef, useAdaptiveFlash } from '@askturret/grid';
import { useState, useEffect, useRef } from 'react';
import type { Position } from '../types';
import './PositionsGrid.css';

interface PositionsGridProps {
  positions: Position[];
  onExitPosition: (positionId: string) => void;
}

export function PositionsGrid({ positions, onExitPosition }: PositionsGridProps) {
  const openPositions = positions.filter((p) => p.status === 'open');

  // Track positions that are animating out (closing)
  const [closingIds, setClosingIds] = useState<Set<string>>(new Set());
  const prevOpenIdsRef = useRef<Set<string>>(new Set());

  // Adaptive performance: disable flash when FPS drops below 55
  const { disableFlash } = useAdaptiveFlash();

  // Detect when positions close and trigger exit animation
  useEffect(() => {
    const currentOpenIds = new Set(openPositions.map(p => p.id));
    const prevOpenIds = prevOpenIdsRef.current;

    // Find positions that just closed
    const newlyClosedIds = new Set<string>();
    prevOpenIds.forEach(id => {
      if (!currentOpenIds.has(id)) {
        newlyClosedIds.add(id);
      }
    });

    if (newlyClosedIds.size > 0) {
      // Start exit animation
      setClosingIds(prev => new Set([...prev, ...newlyClosedIds]));

      // Remove from closing set after animation completes (200ms)
      setTimeout(() => {
        setClosingIds(prev => {
          const next = new Set(prev);
          newlyClosedIds.forEach(id => next.delete(id));
          return next;
        });
      }, 200);
    }

    prevOpenIdsRef.current = currentOpenIds;
  }, [openPositions]);

  // Include positions that are closing (for exit animation)
  const displayPositions = positions.filter(p =>
    p.status === 'open' || closingIds.has(p.id)
  );

  // Column definitions using the real @askturret/grid API
  const columns: ColumnDef<Position>[] = [
    {
      field: 'symbol',
      header: 'Symbol',
      width: '120px',
      formatter: (value) => value as string,
      cellClass: () => 'symbol',
    },
    {
      field: 'side',
      header: 'Side',
      width: '80px',
      formatter: (value) => (value as string).toUpperCase(),
      cellClass: (value) => `side side-${value}`,
    },
    {
      field: 'qty',
      header: 'Qty',
      width: '100px',
      align: 'right',
      formatter: (value) => (value as number).toString(),
      cellClass: () => 'tabular-nums',
    },
    {
      field: 'entry_price',
      header: 'Entry',
      width: '120px',
      align: 'right',
      formatter: (value) => `$${(value as number).toFixed(2)}`,
      cellClass: () => 'tabular-nums',
    },
    {
      field: 'mark_price',
      header: 'Mark',
      width: '120px',
      align: 'right',
      flashOnChange: true,
      formatter: (value) => `$${(value as number).toFixed(2)}`,
      cellClass: () => 'tabular-nums',
    },
    {
      field: 'unrealized_pnl',
      header: 'P&L $',
      width: '120px',
      align: 'right',
      flashOnChange: true,
      formatter: (value) => {
        const pnl = value as number;
        const sign = pnl >= 0 ? '+' : '';
        return `${sign}${pnl.toFixed(2)}`;
      },
      cellClass: (value) => {
        const pnl = value as number;
        if (pnl > 0) return 'tabular-nums pnl-positive';
        if (pnl < 0) return 'tabular-nums pnl-negative';
        return 'tabular-nums';
      },
    },
    {
      field: 'pnl_pct',
      header: 'P&L %',
      width: '100px',
      align: 'right',
      formatter: (_value, row) => {
        const pct = (row.unrealized_pnl / (row.entry_price * row.qty)) * 100;
        const sign = pct >= 0 ? '+' : '';
        return `${sign}${pct.toFixed(2)}%`;
      },
      cellClass: (_value, row) => {
        const pnl = row.unrealized_pnl;
        if (pnl > 0) return 'tabular-nums pnl-positive';
        if (pnl < 0) return 'tabular-nums pnl-negative';
        return 'tabular-nums';
      },
    },
    {
      field: 'opened_at',
      header: 'Age',
      width: '80px',
      align: 'right',
      formatter: (value) => {
        const seconds = Math.floor(
          (Date.now() - new Date(value as string).getTime()) / 1000
        );
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        return `${Math.floor(seconds / 3600)}h`;
      },
      cellClass: () => 'tabular-nums',
    },
    {
      field: 'id',
      header: 'Action',
      width: '100px',
      formatter: (_value, row) => (
        <button
          onClick={() => onExitPosition(row.id)}
          className="exit-button"
        >
          Exit
        </button>
      ),
      cellClass: () => 'action-cell',
    },
  ];

  if (openPositions.length === 0 && closingIds.size === 0) {
    return (
      <div className="positions-grid">
        <div className="empty-state">No open positions</div>
      </div>
    );
  }

  return (
    <div className="positions-grid">
      <DataGrid
        data={displayPositions}
        columns={columns}
        rowKey="id"
        className="positions-table"
        emptyMessage="No open positions"
        stickyHeader
        disableFlash={disableFlash}
        rowClass={(row) => closingIds.has(row.id) ? 'row-exit' : undefined}
      />
    </div>
  );
}
