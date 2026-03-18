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
            .map(|p| format!("- [{}] (閲覧時間: {:.1}秒) {}", p.id, p.dwell_time, p.text))
            .collect::<Vec<_>>()
            .join("\n");

        let prompt = format!(
            "あなたは医療同意書の閲覧データを整理する報告ツールです。\n\
            医療上・法的な重要度の判断や、患者への説明方法の助言は行わないでください。\n\n\
            以下は、患者が十分に閲覧しなかった可能性がある同意書の段落です。\n\
            各段落には閲覧時間（秒）が付記されています（基準値: 3.0秒）。\n\n\
            対象段落:\n{}\n\n\
            以下の形式で出力してください（マークダウン記法不可、プレーンテキストのみ）:\n\n\
            [閲覧状況の概要]\n\
            対象段落の数と閲覧傾向を1文で述べてください。\n\n\
            [各段落の内容要約]\n\
            見落としの可能性がある段落ごとに、1行1段落で以下の形式で列挙してください:\n\
            p-0 / 0.5秒 / この段落の内容を1文で要約\n\
            p-3 / 1.2秒 / この段落の内容を1文で要約\n\n\
            注意:\n\
            - 1段落につき必ず1行で出力すること（改行で区切る）\n\
            - マークダウン記法は使用しないこと\n\
            - 「見落とした」と断定せず「可能性がある」と表現すること\n\
            - 重要度の評価や説明方法の助言は行わないこと",
            paragraph_text
        );

        let body = json!({
            "contents": [{
                "role": "user",
                "parts": [{ "text": prompt }]
            }],
            "generationConfig": {
                "temperature": 0.3,
                "maxOutputTokens": 2048,
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
    pub dwell_time: f64,
}
