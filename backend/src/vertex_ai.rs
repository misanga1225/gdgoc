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
            医療上・法的な重要度の判断や、患者への説明方法の助言は行わないでください。\n\
            それらの判断は担当医師が行います。\n\n\
            以下は、患者が十分に閲覧しなかった可能性がある同意書の段落です。\n\
            各段落には閲覧時間（秒）が付記されています（基準値: 3.0秒）。\n\n\
            対象段落:\n{}\n\n\
            以下の形式でプレーンテキスト（マークダウン記法不可）で報告してください:\n\n\
            [閲覧状況の概要]\n\
            対象段落の数と閲覧傾向を1〜2文で述べてください。\n\
            「見落とした可能性がある」「十分に閲覧されなかった可能性がある」等の表現を使ってください。\n\n\
            [各段落の内容要約]\n\
            各段落について以下をセットで提示してください:\n\
              段落ID / 閲覧時間 / その段落が何について書かれているかの1文要約\n\
            関連する内容の段落がある場合はまとめてください。\n\n\
            注意:\n\
            - マークダウン記法（**太字**、# 見出し、箇条書きの - 等）は使用しないこと\n\
            - 重要度の評価、優先順位付け、説明方法の助言は一切行わないこと\n\
            - 「見落とした」と断定せず「可能性がある」と表現すること\n\
            - 医師の判断を代替・誘導する表現は避けること",
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
