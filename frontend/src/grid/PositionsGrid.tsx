import { DataGrid, ColumnDef } from '@askturret/grid';
import type { Position } from '../types';
import './PositionsGrid.css';

interface PositionsGridProps {
  positions: Position[];
  onExitPosition: (positionId: string) => void;
}

export function PositionsGrid({ positions, onExitPosition }: PositionsGridProps) {
  const openPositions = positions.filter((p) => p.status === 'open');

  // Column definitions using the real @askturret/grid API
  const columns: ColumnDef<Position>[] = [
    {
      field: 'symbol',
      header: 'Symbol',
      width: 120,
      formatter: (value) => value as string,
      cellClass: 'symbol',
    },
    {
      field: 'side',
      header: 'Side',
      width: 80,
      formatter: (value) => (value as string).toUpperCase(),
      cellClass: (value) => `side side-${value}`,
    },
    {
      field: 'qty',
      header: 'Qty',
      width: 100,
      align: 'right',
      formatter: (value) => (value as number).toString(),
      cellClass: 'tabular-nums',
    },
    {
      field: 'entry_price',
      header: 'Entry',
      width: 120,
      align: 'right',
      formatter: (value) => `$${(value as number).toFixed(2)}`,
      cellClass: 'tabular-nums',
    },
    {
      field: 'mark_price',
      header: 'Mark',
      width: 120,
      align: 'right',
      flashOnChange: true, // Built-in flash highlighting
      formatter: (value) => `$${(value as number).toFixed(2)}`,
      cellClass: 'tabular-nums',
    },
    {
      field: 'unrealized_pnl',
      header: 'P&L $',
      width: 120,
      align: 'right',
      flashOnChange: true, // Built-in flash highlighting
      formatter: (value, row) => {
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
      width: 100,
      align: 'right',
      formatter: (_, row) => {
        const pct = (row.unrealized_pnl / (row.entry_price * row.qty)) * 100;
        const sign = pct >= 0 ? '+' : '';
        return `${sign}${pct.toFixed(2)}%`;
      },
      cellClass: (_, row) => {
        const pnl = row.unrealized_pnl;
        if (pnl > 0) return 'tabular-nums pnl-positive';
        if (pnl < 0) return 'tabular-nums pnl-negative';
        return 'tabular-nums';
      },
    },
    {
      field: 'opened_at',
      header: 'Age',
      width: 80,
      align: 'right',
      formatter: (value) => {
        const seconds = Math.floor(
          (Date.now() - new Date(value as string).getTime()) / 1000
        );
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        return `${Math.floor(seconds / 3600)}h`;
      },
      cellClass: 'tabular-nums',
    },
    {
      field: 'id', // Use id as field for action column
      header: 'Action',
      width: 100,
      formatter: (_, row) => {
        // Return a placeholder - actual button will be in cellClass/custom render
        return 'Exit';
      },
      cellClass: 'action-cell',
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
      />
      {/* Action buttons rendered separately since formatter returns strings/ReactNode */}
      <div className="action-overlay">
        {openPositions.map((pos, idx) => (
          <button
            key={pos.id}
            onClick={() => onExitPosition(pos.id)}
            className="exit-button"
            style={{
              position: 'absolute',
              top: `${(idx + 1) * 48 + 12}px`, // Assuming ~48px row height + header
              right: '20px',
            }}
          >
            Exit
          </button>
        ))}
      </div>
    </div>
  );
}
