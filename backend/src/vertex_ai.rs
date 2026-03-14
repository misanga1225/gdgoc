use gcp_auth::TokenProvider;
use reqwest::Client;
use serde_json::json;
use std::sync::Arc;

/// Vertex AI Gemini クライアント
#[derive(Clone)]
pub struct VertexAiClient {
    client: Client,
    auth: Arc<dyn TokenProvider>,
    endpoint: String,
}

impl VertexAiClient {
    pub fn new(auth: Arc<dyn TokenProvider>, project_id: &str, region: &str, model: &str) -> Self {
        let endpoint = format!(
            "https://{}-aiplatform.googleapis.com/v1/projects/{}/locations/{}/publishers/google/models/{}:generateContent",
            region, project_id, region, model
        );
        Self {
            client: Client::new(),
            auth,
            endpoint,
        }
    }

    async fn get_token(&self) -> Result<String, Box<dyn std::error::Error>> {
        let scopes = &["https://www.googleapis.com/auth/cloud-platform"];
        let token = self.auth.token(scopes).await?;
        Ok(token.as_str().to_string())
    }

    /// 見落とし段落を要約する
    pub async fn summarize_missed(
        &self,
        paragraphs: &[MissedParagraph],
    ) -> Result<String, Box<dyn std::error::Error>> {
        let token = self.get_token().await?;

        let paragraph_text = paragraphs
            .iter()
            .map(|p| format!("- [{}] {}", p.id, p.text))
            .collect::<Vec<_>>()
            .join("\n");

        let prompt = format!(
            "あなたは医療同意書の閲覧補助AIです。\n\
            以下は患者が十分に読まなかった（見落とした）同意書の段落です。\n\
            これらの内容を医師向けに簡潔に要約し、\n\
            患者に特に説明すべきポイントを箇条書きで提示してください。\n\n\
            見落とし段落:\n{}\n\n\
            要約と説明ポイント:",
            paragraph_text
        );

        let body = json!({
            "contents": [{
                "role": "user",
                "parts": [{ "text": prompt }]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 512
            }
        });

        let resp = self
            .client
            .post(&self.endpoint)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await?;
            return Err(format!("Vertex AI request failed: {}", err).into());
        }

        let result: serde_json::Value = resp.json().await?;

        let summary = result
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(|v| v.as_str())
            .unwrap_or("要約を生成できませんでした。")
            .to_string();

        Ok(summary)
    }
}

#[derive(serde::Deserialize)]
pub struct MissedParagraph {
    pub id: String,
    pub text: String,
}
