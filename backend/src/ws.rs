use crate::positions::handle_action;
use crate::state::{AppState, ClientMsg, ServerMsg};
use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::Response,
};
use futures::{SinkExt, StreamExt};
use tracing::{debug, error, info, warn};

/// WebSocket upgrade handler
pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

/// Handle individual WebSocket connection
async fn handle_socket(socket: WebSocket, state: AppState) {
    info!("New WebSocket connection");

    let (mut sender, mut receiver) = socket.split();

    // Subscribe to broadcast channel
    let mut rx = state.tx.subscribe();

    // Send initial hello
    send_hello_to_client(&mut sender, &state).await;

    // Spawn task to forward broadcast messages to this client
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            match serde_json::to_string(&msg) {
                Ok(json) => {
                    if sender.send(Message::Text(json)).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    error!("Failed to serialize message: {}", e);
                }
            }
        }
    });

    // Spawn task to handle incoming client messages
    let state_clone = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            if let Message::Text(text) = msg {
                match serde_json::from_str::<ClientMsg>(&text) {
                    Ok(client_msg) => {
                        handle_action(&state_clone, client_msg).await;
                    }
                    Err(e) => {
                        warn!("Failed to parse client message: {} - {}", e, text);
                    }
                }
            } else if let Message::Close(_) = msg {
                debug!("Client sent close message");
                break;
            }
        }
    });

    // Wait for either task to complete (connection closed)
    tokio::select! {
        _ = (&mut send_task) => {
            recv_task.abort();
            debug!("Send task completed, aborting recv task");
        }
        _ = (&mut recv_task) => {
            send_task.abort();
            debug!("Recv task completed, aborting send task");
        }
    }

    info!("WebSocket connection closed");
}

async fn send_hello_to_client(sender: &mut futures::stream::SplitSink<WebSocket, Message>, state: &AppState) {
    let positions: Vec<crate::state::Position> = state
        .positions
        .iter()
        .map(|entry| entry.value().clone())
        .collect();

    let hello = ServerMsg::Hello {
        seq: state.next_seq(),
        server_time: chrono::Utc::now().to_rfc3339(),
        positions,
    };

    if let Ok(json) = serde_json::to_string(&hello) {
        let _ = sender.send(Message::Text(json)).await;
    }
}

/// Heartbeat task - sends periodic heartbeat messages
pub async fn heartbeat_task(state: AppState) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(5));

    loop {
        interval.tick().await;

        let msg = ServerMsg::Heartbeat {
            seq: state.next_seq(),
            server_time: chrono::Utc::now().to_rfc3339(),
        };

        if let Err(e) = state.tx.send(msg) {
            debug!("Heartbeat send failed (no subscribers): {}", e);
        }
    }
}
