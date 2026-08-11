import { useState } from 'react';
import './SummaryPanel.css';

interface SummaryPanelProps {
  connected: boolean;
}

export function SummaryPanel({ connected }: SummaryPanelProps) {
  const [summary, setSummary] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    if (!connected) {
      setError('Not connected to server');
      return;
    }

    setLoading(true);
    setError(null);
    setSummary('');

    try {
      const baseUrl = import.meta.env.DEV ? 'http://localhost:3000' : '';
      const url = `${baseUrl}/api/agent/summary/stream`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (line.startsWith('event: ')) {
              const event = line.slice(7);
              if (event === 'error') {
                setError(data);
                break;
              }
            } else {
              accumulatedText += data;
              setSummary(accumulatedText);
            }
          }
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Summary fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch summary');
      setLoading(false);

      // Fallback to non-streaming endpoint
      try {
        const baseUrl = import.meta.env.DEV ? 'http://localhost:3000' : '';
        const response = await fetch(`${baseUrl}/api/agent/summary`, {
          method: 'POST',
        });
        const data = await response.json();
        if (data.summary) {
          setSummary(data.summary);
          setError(null);
        }
      } catch (fallbackErr) {
        console.error('Fallback summary fetch error:', fallbackErr);
      }
    }
  };

  return (
    <div className="summary-panel">
      <div className="summary-header">
        <h3>Position Summary</h3>
        <button
          onClick={fetchSummary}
          disabled={loading || !connected}
          className="summarize-button"
        >
          {loading ? 'Summarizing...' : 'Summarize'}
        </button>
      </div>

      {error && <div className="summary-error">⚠️ {error}</div>}

      {summary && (
        <div className="summary-content">
          <p>{summary}</p>
        </div>
      )}

      {!summary && !loading && !error && (
        <div className="summary-placeholder">
          Click "Summarize" to generate an AI summary of your current positions.
        </div>
      )}
    </div>
  );
}
