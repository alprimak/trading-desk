use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    /// All positions indexed by ID
    pub positions: Arc<DashMap<String, Position>>,
    /// Latest tick prices per symbol
    pub latest_ticks: Arc<DashMap<String, Tick>>,
    /// Broadcast channel for server messages
    pub tx: broadcast::Sender<ServerMsg>,
    /// Monotonic sequence counter for all server messages
    pub seq: Arc<AtomicU64>,
}

impl AppState {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(1000);
        Self {
            positions: Arc::new(DashMap::new()),
            latest_ticks: Arc::new(DashMap::new()),
            tx,
            seq: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn next_seq(&self) -> u64 {
        self.seq.fetch_add(1, Ordering::SeqCst)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg {
    Hello {
        seq: u64,
        server_time: String,
        positions: Vec<Position>,
    },
    Tick {
        seq: u64,
        symbol: String,
        bid: f64,
        ask: f64,
        last: f64,
        ts: String,
    },
    Position {
        seq: u64,
        position: Position,
    },
    ActionAck {
        seq: u64,
        client_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        position: Option<Position>,
    },
    ActionErr {
        seq: u64,
        client_id: String,
        error: String,
    },
    Heartbeat {
        seq: u64,
        server_time: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub id: String,
    pub symbol: String,
    pub side: Side,
    pub qty: f64,
    pub entry_price: f64,
    pub mark_price: f64,
    pub unrealized_pnl: f64,
    pub opened_at: String,
    pub status: PositionStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub closed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub realized_pnl: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Long,
    Short,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PositionStatus {
    Open,
    Closed,
}

impl Position {
    pub fn new(symbol: String, side: Side, qty: f64, entry_price: f64) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            symbol,
            side,
            qty,
            entry_price,
            mark_price: entry_price,
            unrealized_pnl: 0.0,
            opened_at: now,
            status: PositionStatus::Open,
            closed_at: None,
            exit_price: None,
            realized_pnl: None,
        }
    }

    /// Update mark price and recompute unrealized PnL
    pub fn update_mark(&mut self, mark_price: f64) {
        self.mark_price = mark_price;
        self.unrealized_pnl = match self.side {
            Side::Long => (mark_price - self.entry_price) * self.qty,
            Side::Short => (self.entry_price - mark_price) * self.qty,
        };
    }

    /// Close position at given price
    pub fn close(&mut self, exit_price: f64) {
        let realized = match self.side {
            Side::Long => (exit_price - self.entry_price) * self.qty,
            Side::Short => (self.entry_price - exit_price) * self.qty,
        };
        self.status = PositionStatus::Closed;
        self.exit_price = Some(exit_price);
        // Add any accumulated partial realized PnL from prior adjustments
        let total_realized = realized + self.realized_pnl.unwrap_or(0.0);
        self.realized_pnl = Some(total_realized);
        self.closed_at = Some(chrono::Utc::now().to_rfc3339());
    }

    /// Apply a qty delta (+ to increase, - to decrease/close)
    /// Returns Ok(true) if position closed, Ok(false) if still open, Err on validation failure
    pub fn apply_delta(&mut self, delta: f64, current_market_mid: f64) -> Result<bool, String> {
        // Validation
        if delta == 0.0 {
            return Err("delta cannot be zero".to_string());
        }
        if delta.is_nan() || delta.is_infinite() {
            return Err("delta must be a valid number".to_string());
        }
        if self.status != PositionStatus::Open {
            return Err("cannot adjust a closed position".to_string());
        }

        let new_qty = self.qty + delta;

        // Reject cross-side flip
        if new_qty < 0.0 {
            return Err(format!(
                "delta {} would make qty negative (current: {})",
                delta, self.qty
            ));
        }

        if delta > 0.0 {
            // Increase: compute weighted average entry price
            let old_cost = self.qty * self.entry_price;
            let new_cost = delta * current_market_mid;
            self.entry_price = (old_cost + new_cost) / new_qty;
            self.qty = new_qty;
            Ok(false)
        } else {
            // Decrease (delta < 0)
            let abs_delta = delta.abs();

            if new_qty > 0.0 {
                // Partial close: entry_price unchanged, book partial realized PnL
                let partial_realized = match self.side {
                    Side::Long => (current_market_mid - self.entry_price) * abs_delta,
                    Side::Short => (self.entry_price - current_market_mid) * abs_delta,
                };
                self.realized_pnl = Some(self.realized_pnl.unwrap_or(0.0) + partial_realized);
                self.qty = new_qty;
                Ok(false)
            } else {
                // Full close (new_qty == 0): use existing close() method
                self.close(current_market_mid);
                Ok(true)
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tick {
    pub symbol: String,
    pub bid: f64,
    pub ask: f64,
    pub last: f64,
    pub ts: String,
}

impl Tick {
    pub fn mid(&self) -> f64 {
        (self.bid + self.ask) / 2.0
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMsg {
    Enter {
        client_id: String,
        symbol: String,
        side: Side,
        qty: f64,
    },
    Exit {
        client_id: String,
        position_id: String,
    },
    Adjust {
        client_id: String,
        position_id: String,
        delta: f64,
    },
    Resume {
        client_id: String,
        last_seq: u64,
    },
    Ping {
        client_id: String,
    },
}
