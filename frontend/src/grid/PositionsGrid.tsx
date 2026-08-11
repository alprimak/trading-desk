import { DataGrid, ColumnDef, useAdaptiveFlash } from '@askturret/grid';
import type { Position } from '../types';
import { formatCurrency, formatPnL } from '../utils/format';
import './PositionsGrid.css';

interface PositionsGridProps {
  positions: Position[];
  onExitPosition: (positionId: string) => void;
  onAdjustPosition: (positionId: string, delta: number) => void;
}

export function PositionsGrid({
  positions,
  onExitPosition,
  onAdjustPosition,
}: PositionsGridProps) {
  const openPositions = positions.filter((p) => p.status === 'open');

  // Adaptive performance: disable flash when FPS drops below 55
  const { disableFlash } = useAdaptiveFlash();

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
      flashOnChange: true,
      formatter: (value) => (value as number).toString(),
      cellClass: () => 'tabular-nums',
    },
    {
      field: 'entry_price',
      header: 'Entry',
      width: '120px',
      align: 'right',
      formatter: (value) => formatCurrency(value as number),
      cellClass: () => 'tabular-nums',
    },
    {
      field: 'mark_price',
      header: 'Mark',
      width: '120px',
      align: 'right',
      flashOnChange: true,
      formatter: (value) => formatCurrency(value as number),
      cellClass: () => 'tabular-nums',
    },
    {
      field: 'unrealized_pnl',
      header: 'P&L $',
      width: '120px',
      align: 'right',
      flashOnChange: true,
      formatter: (value) => formatPnL(value as number),
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
      width: '180px',
      formatter: (_value, row) => (
        <div className="action-controls">
          <button
            onClick={() => onAdjustPosition(row.id, -1)}
            className="adjust-button adjust-minus"
            title="Decrease by 1"
          >
            −
          </button>
          <button
            onClick={() => onAdjustPosition(row.id, 1)}
            className="adjust-button adjust-plus"
            title="Increase by 1"
          >
            +
          </button>
          <button
            onClick={() => onExitPosition(row.id)}
            className="exit-button"
            title="Close position"
          >
            ✕
          </button>
        </div>
      ),
      cellClass: () => 'action-cell',
    },
  ];

  if (openPositions.length === 0) {
    return (
      <div className="positions-grid">
        <div className="empty-state">No open positions</div>
      </div>
    );
  }

  return (
    <div className="positions-grid">
      <DataGrid
        data={openPositions}
        columns={columns}
        rowKey="id"
        className="positions-table"
        emptyMessage="No open positions"
        stickyHeader
        disableFlash={disableFlash}
      />
    </div>
  );
}
