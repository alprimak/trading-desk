use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::env;
use tower_http::{
    cors::CorsLayer,
    services::ServeDir,
    trace::{DefaultMakeSpan, DefaultOnResponse, TraceLayer},
    LatencyUnit,
};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod agent;
mod feed;
mod positions;
mod state;
mod ws;

use state::AppState;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "trading_desk=debug,info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Parse environment variables
    let port = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let tick_rate_hz = env::var("TICK_RATE_HZ")
        .ok()
        .and_then(|r| r.parse().ok())
        .unwrap_or(25);

    let symbol_universe: Vec<String> = env::var("SYMBOL_UNIVERSE")
        .unwrap_or_else(|_| {
            "BTC-USD,ETH-USD,SOL-USD,AAPL,TSLA,NVDA,SPY,QQQ,MSFT,GOOG".to_string()
        })
        .split(',')
        .map(|s| s.trim().to_string())
        .collect();

    info!(
        "Starting trading desk server on port {} with {} symbols at {} Hz",
        port,
        symbol_universe.len(),
        tick_rate_hz
    );

    // Initialize shared state
    let state = AppState::new();

    // Spawn market data feed
    let feed_state = state.clone();
    let feed_symbols = symbol_universe.clone();
    tokio::spawn(async move {
        feed::run_feed(feed_state, feed_symbols, tick_rate_hz).await;
    });

    // Spawn heartbeat task
    let heartbeat_state = state.clone();
    tokio::spawn(async move {
        ws::heartbeat_task(heartbeat_state).await;
    });

    // Build router
    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/config", get(config))
        .route("/api/agent/summary", post(agent::summary_json))
        .route("/api/agent/summary/stream", get(agent::summary_stream))
        .route("/ws", get(ws::ws_handler))
        .fallback_service(
            ServeDir::new("dist")
                .not_found_service(ServeDir::new("dist").fallback(
                    tower::util::service_fn(|_| async {
                        Ok::<_, std::convert::Infallible>(
                            axum::http::Response::builder()
                                .status(axum::http::StatusCode::OK)
                                .header("content-type", "text/html")
                                .body(axum::body::Body::from(
                                    std::fs::read_to_string("dist/index.html")
                                        .unwrap_or_else(|_| "Frontend not built".to_string()),
                                ))
                                .unwrap(),
                        )
                    }),
                )),
        )
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::new().include_headers(true))
                .on_response(
                    DefaultOnResponse::new()
                        .include_headers(true)
                        .latency_unit(LatencyUnit::Micros),
                ),
        )
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind");

    info!("Listening on {}", addr);

    axum::serve(listener, app)
        .await
        .expect("Server failed");
}

async fn health() -> &'static str {
    "OK"
}

async fn config(State(_state): State<AppState>) -> Json<Value> {
    let llm_enabled = env::var("ANTHROPIC_API_KEY").is_ok();

    Json(json!({
        "llm_enabled": llm_enabled,
        "version": "0.1.0",
    }))
}
