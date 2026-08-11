use crate::state::AppState;
use axum::{
    extract::State,
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    Json,
};
use futures::stream::{self, Stream, StreamExt};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::pin::Pin;
use std::time::Duration;
use tokio::time::timeout;
use tracing::{error, info};

mod anthropic;
mod prompt;

use anthropic::AnthropicClient;

const SUMMARY_CACHE_DURATION: Duration = Duration::from_secs(5);
const LLM_TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Debug, Serialize)]
pub struct SummaryResponse {
    pub summary: String,
    pub cached: bool,
}

#[derive(Debug, Serialize)]
pub struct SummaryError {
    pub error: String,
}

static LAST_SUMMARY: std::sync::OnceLock<tokio::sync::RwLock<(String, std::time::Instant)>> =
    std::sync::OnceLock::new();

fn get_cache() -> &'static tokio::sync::RwLock<(String, std::time::Instant)> {
    LAST_SUMMARY.get_or_init(|| {
        tokio::sync::RwLock::new((String::new(), std::time::Instant::now() - Duration::from_secs(10)))
    })
}

/// POST /api/agent/summary - Non-streaming JSON endpoint
pub async fn summary_json(State(state): State<AppState>) -> Response {
    info!("Received summary request (JSON)");

    // Check cache
    let cache = get_cache().read().await;
    if !cache.0.is_empty() && cache.1.elapsed() < SUMMARY_CACHE_DURATION {
        info!("Returning cached summary");
        return Json(SummaryResponse {
            summary: cache.0.clone(),
            cached: true,
        })
        .into_response();
    }
    drop(cache);

    // Generate new summary
    match generate_summary(&state).await {
        Ok(summary) => {
            // Update cache
            let mut cache = get_cache().write().await;
            *cache = (summary.clone(), std::time::Instant::now());
            drop(cache);

            Json(SummaryResponse {
                summary,
                cached: false,
            })
            .into_response()
        }
        Err(e) => {
            error!("Summary generation failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(SummaryError { error: e }),
            )
                .into_response()
        }
    }
}

/// GET /api/agent/summary/stream - SSE streaming endpoint
pub async fn summary_stream(
    State(state): State<AppState>,
) -> Sse<Pin<Box<dyn Stream<Item = Result<Event, Infallible>> + Send>>> {
    info!("Received summary request (SSE)");

    // Check cache first
    let cache = get_cache().read().await;
    if !cache.0.is_empty() && cache.1.elapsed() < SUMMARY_CACHE_DURATION {
        info!("Returning cached summary via SSE");
        let cached_summary = cache.0.clone();
        drop(cache);

        let stream = stream::once(async move {
            Ok(Event::default()
                .event("summary")
                .data(cached_summary))
        })
        .boxed();

        return Sse::new(stream).keep_alive(KeepAlive::default());
    }
    drop(cache);

    // Stream new summary (wrapped in Option to terminate after one summary)
    let stream = stream::unfold(Some(state), |state_opt| async move {
        match state_opt {
            None => None, // Stream terminated
            Some(state) => {
                match stream_summary(&state).await {
                    Ok(tokens) => {
                        // Cache the complete summary
                        let complete = tokens.join("");
                        let mut cache = get_cache().write().await;
                        *cache = (complete, std::time::Instant::now());
                        drop(cache);

                        // Emit tokens as SSE events
                        let events: Vec<_> = tokens
                            .into_iter()
                            .map(|token| Ok(Event::default().event("token").data(token)))
                            .collect();

                        // Emit final "done" event
                        let mut all_events = events;
                        all_events.push(Ok(Event::default().event("done").data("")));

                        // Return None as new state to terminate stream after this
                        Some((stream::iter(all_events).boxed(), None))
                    }
                    Err(e) => {
                        error!("Summary streaming failed: {}", e);
                        let error_event = Ok(Event::default()
                            .event("error")
                            .data(format!("Summary unavailable: {}", e)));
                        // Return None as new state to terminate stream after error
                        Some((stream::once(async move { error_event }).boxed(), None))
                    }
                }
            }
        }
    })
    .flatten()
    .boxed();

    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn generate_summary(state: &AppState) -> Result<String, String> {
    let api_key = std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| "ANTHROPIC_API_KEY not configured".to_string())?;

    let client = AnthropicClient::new(api_key);

    // Collect position snapshot
    let positions: Vec<_> = state
        .positions
        .iter()
        .filter(|entry| entry.status == crate::state::PositionStatus::Open)
        .map(|entry| entry.value().clone())
        .collect();

    if positions.is_empty() {
        return Ok("No open positions.".to_string());
    }

    // Build prompt
    let prompt_text = prompt::build_prompt(&positions);

    // Call LLM with timeout
    let result = timeout(
        LLM_TIMEOUT,
        client.generate(&prompt_text, false), // non-streaming
    )
    .await
    .map_err(|_| "Summary timed out after 4s".to_string())?
    .map_err(|e| format!("LLM error: {}", e))?;

    Ok(result)
}

async fn stream_summary(state: &AppState) -> Result<Vec<String>, String> {
    let api_key = std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| "ANTHROPIC_API_KEY not configured".to_string())?;

    let client = AnthropicClient::new(api_key);

    // Collect position snapshot
    let positions: Vec<_> = state
        .positions
        .iter()
        .filter(|entry| entry.status == crate::state::PositionStatus::Open)
        .map(|entry| entry.value().clone())
        .collect();

    if positions.is_empty() {
        return Ok(vec!["No open positions.".to_string()]);
    }

    // Build prompt
    let prompt_text = prompt::build_prompt(&positions);

    // Call LLM with timeout and streaming
    let result = timeout(
        LLM_TIMEOUT,
        client.generate(&prompt_text, true), // streaming
    )
    .await
    .map_err(|_| "Summary timed out after 4s".to_string())?
    .map_err(|e| format!("LLM error: {}", e))?;

    // For now, streaming returns the full text as one token
    // A real streaming implementation would collect SSE events from Anthropic
    Ok(vec![result])
}
