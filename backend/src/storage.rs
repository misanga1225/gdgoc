use gcp_auth::TokenProvider;
use reqwest::Client;
use std::sync::Arc;

/// Cloud Storage REST APIクライアント
#[derive(Clone)]
pub struct StorageClient {
    client: Client,
    auth: Arc<dyn TokenProvider>,
    bucket: String,
}

impl StorageClient {
    pub fn new(auth: Arc<dyn TokenProvider>, bucket: &str) -> Self {
        Self {
            client: Client::new(),
            auth,
            bucket: bucket.to_string(),
        }
    }

    async fn get_token(&self) -> Result<String, Box<dyn std::error::Error>> {
        let scopes = &["https://www.googleapis.com/auth/devstorage.read_write"];
        let token = self.auth.token(scopes).await?;
        Ok(token.as_str().to_string())
    }

    /// HTMLコンテンツをCloud Storageにアップロードする
    /// 戻り値: 公開URL
    pub async fn upload_html(
        &self,
        object_name: &str,
        html_content: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let token = self.get_token().await?;

        let url = format!(
            "https://storage.googleapis.com/upload/storage/v1/b/{}/o?uploadType=media&name={}",
            self.bucket, object_name
        );

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&token)
            .header("Content-Type", "text/html; charset=utf-8")
            .body(html_content.to_string())
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await?;
            return Err(format!("Storage upload failed: {}", err).into());
        }

        let public_url = format!(
            "https://storage.googleapis.com/{}/{}",
            self.bucket, object_name
        );
        Ok(public_url)
    }
}
