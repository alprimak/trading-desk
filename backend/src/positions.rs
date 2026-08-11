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
            let current_mid = state
                .latest_ticks
                .get(&symbol)
                .map(|t| t.mid())
                .unwrap_or_else(|| {
                    warn!("No tick available for {}, using default price", symbol);
                    100.0
                });

            // Scan for existing open position with same (symbol, side)
            let existing = state
                .positions
                .iter()
                .find(|entry| {
                    let pos = entry.value();
                    pos.symbol == symbol
                        && pos.side == side
                        && pos.status == crate::state::PositionStatus::Open
                })
                .map(|entry| entry.key().clone());

            if let Some(position_id) = existing {
                // Merge into existing position via apply_delta
                debug!(
                    "Merging Enter into existing position {}: delta=+{}",
                    position_id, qty
                );

                match state.positions.get_mut(&position_id) {
                    Some(mut pos) => {
                        match pos.apply_delta(qty, current_mid) {
                            Ok(_) => {
                                let updated_position = pos.clone();
                                drop(pos);

                                // Send ack with updated position
                                let ack = ServerMsg::ActionAck {
                                    seq: state.next_seq(),
                                    client_id,
                                    position: Some(updated_position.clone()),
                                };
                                let _ = state.tx.send(ack);

                                // Broadcast updated position
                                let broadcast = ServerMsg::Position {
                                    seq: state.next_seq(),
                                    position: updated_position,
                                };
                                let _ = state.tx.send(broadcast);
                            }
                            Err(err_msg) => {
                                let err = ServerMsg::ActionErr {
                                    seq: state.next_seq(),
                                    client_id,
                                    error: format!("Enter merge failed: {}", err_msg),
                                };
                                let _ = state.tx.send(err);
                            }
                        }
                    }
                    None => {
                        // Position disappeared between scan and lock - fall back to create new
                        warn!("Position {} disappeared during Enter merge", position_id);
                        let position = Position::new(symbol, side, qty, current_mid);
                        let new_id = position.id.clone();
                        state.positions.insert(new_id, position.clone());

                        let ack = ServerMsg::ActionAck {
                            seq: state.next_seq(),
                            client_id,
                            position: Some(position.clone()),
                        };
                        let _ = state.tx.send(ack);

                        let broadcast = ServerMsg::Position {
                            seq: state.next_seq(),
                            position,
                        };
                        let _ = state.tx.send(broadcast);
                    }
                }
            } else {
                // No existing position - create new
                let position = Position::new(symbol, side, qty, current_mid);
                let position_id = position.id.clone();
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

        ClientMsg::Adjust {
            client_id,
            position_id,
            delta,
        } => {
            debug!(
                "Adjust position: client={}, position_id={}, delta={}",
                client_id, position_id, delta
            );

            match state.positions.get_mut(&position_id) {
                Some(mut pos) => {
                    // Get current market price
                    let current_mid = state
                        .latest_ticks
                        .get(&pos.symbol)
                        .map(|t| t.mid())
                        .unwrap_or(pos.mark_price);

                    match pos.apply_delta(delta, current_mid) {
                        Ok(_closed) => {
                            let updated_position = pos.clone();
                            drop(pos); // Release the lock

                            // Send ack
                            let ack = ServerMsg::ActionAck {
                                seq: state.next_seq(),
                                client_id,
                                position: Some(updated_position.clone()),
                            };
                            let _ = state.tx.send(ack);

                            // Broadcast updated position immediately (bypass coalescing)
                            let broadcast = ServerMsg::Position {
                                seq: state.next_seq(),
                                position: updated_position,
                            };
                            let _ = state.tx.send(broadcast);
                        }
                        Err(err_msg) => {
                            let err = ServerMsg::ActionErr {
                                seq: state.next_seq(),
                                client_id,
                                error: err_msg,
                            };
                            let _ = state.tx.send(err);
                        }
                    }
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
