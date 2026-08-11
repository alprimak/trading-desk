use crate::state::{AppState, ServerMsg, Tick};
use rand::Rng;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::time;
use tracing::debug;

/// Mock market data feed - emits ticks at TICK_RATE_HZ per symbol
pub async fn run_feed(state: AppState, symbols: Vec<String>, tick_rate_hz: u64) {
    let interval_ms = 1000 / tick_rate_hz;
    let mut interval = time::interval(Duration::from_millis(interval_ms));

    // Position broadcast coalescing: only broadcast each position at POSITION_UPDATE_HZ
    let position_update_hz = std::env::var("POSITION_UPDATE_HZ")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(5); // Default: 5 Hz (200ms cadence)

    let position_update_interval = Duration::from_millis(1000 / position_update_hz);
    let mut last_broadcast: HashMap<String, Instant> = HashMap::new();

    // Initialize with realistic starting prices
    let mut prices: std::collections::HashMap<String, f64> = symbols
        .iter()
        .map(|s| {
            let base_price = match s.as_str() {
                "BTC-USD" => 45000.0,
                "ETH-USD" => 2500.0,
                "SOL-USD" => 100.0,
                "AAPL" => 175.0,
                "TSLA" => 250.0,
                "NVDA" => 450.0,
                "SPY" => 450.0,
                "QQQ" => 380.0,
                "MSFT" => 380.0,
                "GOOG" => 140.0,
                _ => 100.0,
            };
            (s.clone(), base_price)
        })
        .collect();

    loop {
        interval.tick().await;

        // Update and emit tick for EACH symbol on every interval tick
        for symbol in &symbols {
            let current_price = prices.get(symbol).copied().unwrap_or(100.0);

            // Random walk with small variance
            let change_pct = rand::thread_rng().gen_range(-0.001..0.001);
            let new_price = current_price * (1.0 + change_pct);
            prices.insert(symbol.clone(), new_price);

            // Spread is 0.05% of price
            let spread = new_price * 0.0005;
            let bid = new_price - spread / 2.0;
            let ask = new_price + spread / 2.0;

            let tick = Tick {
                symbol: symbol.clone(),
                bid,
                ask,
                last: new_price,
                ts: chrono::Utc::now().to_rfc3339(),
            };

            // Store latest tick
            state.latest_ticks.insert(symbol.clone(), tick.clone());

            // Update all open positions for this symbol with new mark price
            let mid = tick.mid();
            let now = Instant::now();

            for mut entry in state.positions.iter_mut() {
                if entry.symbol == *symbol && entry.status == crate::state::PositionStatus::Open {
                    entry.update_mark(mid);

                    // Coalesce position broadcasts to POSITION_UPDATE_HZ (default 5 Hz)
                    // Only broadcast if enough time has elapsed since last broadcast for this position
                    let position_id = entry.key().clone();
                    let should_broadcast = last_broadcast
                        .get(&position_id)
                        .map(|last| now.duration_since(*last) >= position_update_interval)
                        .unwrap_or(true); // First broadcast always goes through

                    if should_broadcast {
                        let msg = ServerMsg::Position {
                            seq: state.next_seq(),
                            position: entry.value().clone(),
                        };
                        let _ = state.tx.send(msg);
                        last_broadcast.insert(position_id, now);
                    }
                }
            }

            // Tick broadcast dropped: client no-ops tick messages (useWebSocket.ts line 96)
            // and the wire volume waste is significant (250 msg/s at 10 symbols).
            // If charts/tickers are added later, re-introduce a throttled tick broadcast
            // for those specific subscribers only.
        }
    }
}
