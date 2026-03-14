use base64::{engine::general_purpose::STANDARD, Engine};
use gcp_auth::TokenProvider;
use reqwest::Client;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::sync::Arc;

/// Cloud KMS 署名クライアント
#[derive(Clone)]
pub struct KmsClient {
    client: Client,
    auth: Arc<dyn TokenProvider>,
    key_path: String,
}

impl KmsClient {
    pub fn new(
        auth: Arc<dyn TokenProvider>,
        project_id: &str,
        location: &str,
        key_ring: &str,
        key_name: &str,
    ) -> Self {
        let key_path = format!(
            "projects/{}/locations/{}/keyRings/{}/cryptoKeys/{}/cryptoKeyVersions/1",
            project_id, location, key_ring, key_name
        );
        Self {
            client: Client::new(),
            auth,
            key_path,
        }
    }

    async fn get_token(&self) -> Result<String, Box<dyn std::error::Error>> {
        let scopes = &["https://www.googleapis.com/auth/cloudkms"];
        let token = self.auth.token(scopes).await?;
        Ok(token.as_str().to_string())
    }

    /// データのSHA-256ダイジェストをCloud KMSで非対称署名する
    /// 戻り値: Base64エンコードされた署名
    pub async fn sign(&self, data: &[u8]) -> Result<String, Box<dyn std::error::Error>> {
        let token = self.get_token().await?;

        // データのSHA-256ダイジェストを計算
        let mut hasher = Sha256::new();
        hasher.update(data);
        let digest = hasher.finalize();
        let digest_b64 = STANDARD.encode(digest);

        let url = format!(
            "https://cloudkms.googleapis.com/v1/{}:asymmetricSign",
            self.key_path
        );

        let body = json!({
            "digest": {
                "sha256": digest_b64
            }
        });

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await?;
            return Err(format!("KMS sign failed: {}", err).into());
        }

        let result: serde_json::Value = resp.json().await?;
        let signature = result
            .get("signature")
            .and_then(|v| v.as_str())
            .ok_or("No signature in KMS response")?
            .to_string();

        Ok(signature)
    }
}
