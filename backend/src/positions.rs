use crate::state::{AppState, ClientMsg, Position, ServerMsg, Side};
use tracing::{debug, warn};

/// Handle client position actions
pub async fn handle_action(state: &AppState, msg: ClientMsg) {
    match msg {
        ClientMsg::Enter {
            client_id,
            symbol,
            side,
            qty,
        } => {
            debug!(
                "Enter position: client={}, symbol={}, side={:?}, qty={}",
                client_id, symbol, side, qty
            );

            // Get current market price from latest tick
            let entry_price = state
                .latest_ticks
                .get(&symbol)
                .map(|t| t.mid())
                .unwrap_or_else(|| {
                    warn!("No tick available for {}, using default price", symbol);
                    100.0
                });

            let position = Position::new(symbol, side, qty, entry_price);
            let position_id = position.id.clone();

            // Store position
            state.positions.insert(position_id, position.clone());

            // Send ack with new position
            let ack = ServerMsg::ActionAck {
                seq: state.next_seq(),
                client_id,
                position: Some(position.clone()),
            };
            let _ = state.tx.send(ack);

            // Broadcast position to all clients
            let broadcast = ServerMsg::Position {
                seq: state.next_seq(),
                position,
            };
            let _ = state.tx.send(broadcast);
        }

        ClientMsg::Exit {
            client_id,
            position_id,
        } => {
            debug!(
                "Exit position: client={}, position_id={}",
                client_id, position_id
            );

            match state.positions.get_mut(&position_id) {
                Some(mut pos) => {
                    // Get current market price
                    let exit_price = state
                        .latest_ticks
                        .get(&pos.symbol)
                        .map(|t| t.mid())
                        .unwrap_or(pos.mark_price);

                    pos.close(exit_price);
                    let closed_position = pos.clone();
                    drop(pos); // Release the lock

                    // Send ack
                    let ack = ServerMsg::ActionAck {
                        seq: state.next_seq(),
                        client_id,
                        position: Some(closed_position.clone()),
                    };
                    let _ = state.tx.send(ack);

                    // Broadcast updated position
                    let broadcast = ServerMsg::Position {
                        seq: state.next_seq(),
                        position: closed_position,
                    };
                    let _ = state.tx.send(broadcast);
                }
                None => {
                    let err = ServerMsg::ActionErr {
                        seq: state.next_seq(),
                        client_id,
                        error: format!("Position {} not found", position_id),
                    };
                    let _ = state.tx.send(err);
                }
            }
        }

        ClientMsg::Resume { client_id, last_seq } => {
            debug!("Resume: client={}, last_seq={}", client_id, last_seq);
            // For now, just send a hello with current state
            // A production system would replay from last_seq if within buffer window
            send_hello(state, client_id).await;
        }

        ClientMsg::Ping { client_id: _ } => {
            // Pong via heartbeat is already sent by heartbeat task
        }
    }
}

/// Send initial hello message with current positions snapshot
pub async fn send_hello(state: &AppState, _client_id: String) {
    let positions: Vec<Position> = state
        .positions
        .iter()
        .map(|entry| entry.value().clone())
        .collect();

    let hello = ServerMsg::Hello {
        seq: state.next_seq(),
        server_time: chrono::Utc::now().to_rfc3339(),
        positions,
    };

    let _ = state.tx.send(hello);
}
