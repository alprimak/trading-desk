use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::debug;

const ANTHROPIC_API_URL: &str = "https://api.anthropic.com/v1/messages";
const MODEL: &str = "claude-haiku-4-5-20251001";
const MAX_TOKENS: usize = 200;

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: usize,
    messages: Vec<Message>,
    stream: bool,
}

#[derive(Debug, Serialize)]
struct Message {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
struct ContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    text: Option<String>,
}

pub struct AnthropicClient {
    client: Client,
    api_key: String,
}

impl AnthropicClient {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
        }
    }

    pub async fn generate(&self, prompt: &str, stream: bool) -> Result<String, String> {
        let request = AnthropicRequest {
            model: MODEL.to_string(),
            max_tokens: MAX_TOKENS,
            messages: vec![Message {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            stream,
        };

        debug!("Calling Anthropic API with prompt: {}...", &prompt[..100.min(prompt.len())]);

        let response = self
            .client
            .post(ANTHROPIC_API_URL)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("HTTP request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read error body".to_string());
            return Err(format!("API error {}: {}", status, body));
        }

        let api_response: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        let text = api_response
            .content
            .into_iter()
            .filter_map(|block| {
                if block.block_type == "text" {
                    block.text
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("");

        debug!("Received response: {}", text);

        Ok(text)
    }
}
