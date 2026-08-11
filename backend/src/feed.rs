use crate::state::{AppState, ServerMsg, Tick};
use rand::Rng;
use std::time::Duration;
use tokio::time;
use tracing::debug;

/// Mock market data feed - emits ticks at TICK_RATE_HZ per symbol
pub async fn run_feed(state: AppState, symbols: Vec<String>, tick_rate_hz: u64) {
    let interval_ms = 1000 / tick_rate_hz;
    let mut interval = time::interval(Duration::from_millis(interval_ms));

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

        // Pick a random symbol to update
        let symbol = &symbols[rand::thread_rng().gen_range(0..symbols.len())];
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
        for mut entry in state.positions.iter_mut() {
            if entry.symbol == *symbol && entry.status == crate::state::PositionStatus::Open {
                entry.update_mark(mid);

                // Broadcast position update
                let msg = ServerMsg::Position {
                    seq: state.next_seq(),
                    position: entry.value().clone(),
                };
                let _ = state.tx.send(msg);
            }
        }

        // Broadcast tick
        let msg = ServerMsg::Tick {
            seq: state.next_seq(),
            symbol: tick.symbol.clone(),
            bid: tick.bid,
            ask: tick.ask,
            last: tick.last,
            ts: tick.ts,
        };

        if let Err(e) = state.tx.send(msg) {
            debug!("No active subscribers: {}", e);
        }
    }
}
