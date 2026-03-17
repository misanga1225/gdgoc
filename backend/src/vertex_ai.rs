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
            以下は患者が十分に閲覧しなかった（見落とした）同意書の段落です。\n\
            医師向けに以下の形式で分析結果を提示してください：\n\n\
            1. 【重要度評価】各見落とし段落の医療・法的重要度を「高/中/低」で評価\n\
            2. 【補足説明の必要性】患者に口頭で補足説明すべき項目を優先順位付きで提示\n\
            3. 【説明のポイント】具体的にどのように説明すべきかのアドバイス\n\n\
            見落とし段落:\n{}\n\n\
            分析結果:",
            paragraph_text
        );

        let body = json!({
            "contents": [{
                "role": "user",
                "parts": [{ "text": prompt }]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 4096,
                "thinkingConfig": {
                    "thinkingBudget": 0
                }
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
            .and_then(|v| v.as_str());

        match summary {
            Some(text) => Ok(text.to_string()),
            None => {
                let body = serde_json::to_string(&result).unwrap_or_default();
                Err(format!("Vertex AI unexpected response: {}", body).into())
            }
        }
    }
}

#[derive(serde::Deserialize)]
pub struct MissedParagraph {
    pub id: String,
    pub text: String,
}
