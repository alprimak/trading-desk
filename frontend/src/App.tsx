import { useState } from 'react';
import { useWebSocket } from './ws/useWebSocket';
import { PositionsGrid } from './grid/PositionsGrid';
import { SummaryPanel } from './agent/SummaryPanel';
import './App.css';

const SYMBOLS = [
  'BTC-USD',
  'ETH-USD',
  'SOL-USD',
  'AAPL',
  'TSLA',
  'NVDA',
  'SPY',
  'QQQ',
  'MSFT',
  'GOOG',
];

function App() {
  const { positions, connected, lastError, enterPosition, exitPosition } =
    useWebSocket();

  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [qty, setQty] = useState('1');

  const handleEnter = (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = parseFloat(qty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      alert('Invalid quantity');
      return;
    }
    enterPosition(symbol, side, qtyNum);
  };

  const openPositions = positions.filter((p) => p.status === 'open');
  const totalPnL = openPositions.reduce((sum, p) => sum + p.unrealized_pnl, 0);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Live Position Monitor</h1>
          <div className="connection-status">
            <span
              className={`status-indicator ${connected ? 'connected' : 'disconnected'}`}
            />
            <span className="status-text">
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="header-right">
          <div className="summary">
            <div className="summary-item">
              <span className="summary-label">Open Positions</span>
              <span className="summary-value">{openPositions.length}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Total P&L</span>
              <span
                className={`summary-value ${totalPnL >= 0 ? 'pnl-positive' : 'pnl-negative'}`}
              >
                {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {lastError && (
        <div className="error-banner">
          <span>⚠️ {lastError}</span>
        </div>
      )}

      <div className="content">
        <div className="enter-position-form">
          <h2>Enter Position</h2>
          <form onSubmit={handleEnter}>
            <div className="form-row">
              <div className="form-group">
                <label>Symbol</label>
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                >
                  {SYMBOLS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Side</label>
                <div className="side-buttons">
                  <button
                    type="button"
                    className={`side-button ${side === 'long' ? 'active' : ''}`}
                    onClick={() => setSide('long')}
                  >
                    Long
                  </button>
                  <button
                    type="button"
                    className={`side-button ${side === 'short' ? 'active' : ''}`}
                    onClick={() => setSide('short')}
                  >
                    Short
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Quantity</label>
                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  step="0.01"
                  min="0.01"
                />
              </div>

              <div className="form-group">
                <button type="submit" className="enter-button">
                  Enter Position
                </button>
              </div>
            </div>
          </form>
        </div>

        <SummaryPanel connected={connected} />

        <PositionsGrid positions={positions} onExitPosition={exitPosition} />
      </div>
    </div>
  );
}

export default App;
