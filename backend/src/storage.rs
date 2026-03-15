use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use gcp_auth::TokenProvider;
use reqwest::Client;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::sync::Arc;

/// Cloud Storage REST APIクライアント
#[derive(Clone)]
pub struct StorageClient {
    client: Client,
    auth: Arc<dyn TokenProvider>,
    bucket: String,
    service_account_email: String,
}

impl StorageClient {
    pub fn new(auth: Arc<dyn TokenProvider>, bucket: &str, service_account_email: &str) -> Self {
        Self {
            client: Client::new(),
            auth,
            bucket: bucket.to_string(),
            service_account_email: service_account_email.to_string(),
        }
    }

    pub fn bucket_name(&self) -> &str {
        &self.bucket
    }

    async fn get_token(&self) -> Result<String, Box<dyn std::error::Error>> {
        let scopes = &["https://www.googleapis.com/auth/devstorage.read_write"];
        let token = self.auth.token(scopes).await?;
        Ok(token.as_str().to_string())
    }

    /// HTMLコンテンツをCloud Storageにアップロードする
    /// 戻り値: オブジェクト名（パス）
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

        Ok(object_name.to_string())
    }

    /// Cloud Storageからオブジェクトをダウンロードする（サーバー間通信用）
    pub async fn download_object(
        &self,
        object_name: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let token = self.get_token().await?;
        let encoded_name = object_name.replace('/', "%2F");
        let url = format!(
            "https://storage.googleapis.com/storage/v1/b/{}/o/{}?alt=media",
            self.bucket, encoded_name
        );

        let resp = self
            .client
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await?;
            return Err(format!("Storage download failed: {}", err).into());
        }

        Ok(resp.text().await?)
    }

    /// V4署名付きURLを生成する（ブラウザからの直接アクセス用）
    pub async fn generate_signed_url(
        &self,
        object_name: &str,
        ttl_secs: u64,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let now = Utc::now();
        let datetime = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date = now.format("%Y%m%d").to_string();

        let credential_scope = format!("{}/auto/storage/goog4_request", date);
        let credential = format!("{}/{}", self.service_account_email, credential_scope);

        // 正規クエリ文字列（アルファベット順）
        let canonical_query = format!(
            "X-Goog-Algorithm=GOOG4-RSA-SHA256\
             &X-Goog-Credential={}\
             &X-Goog-Date={}\
             &X-Goog-Expires={}\
             &X-Goog-SignedHeaders=host",
            urlencoding::encode(&credential),
            datetime,
            ttl_secs
        );

        // 正規リクエスト
        // パスの各セグメントをURLエンコード
        let canonical_uri = format!(
            "/{}/{}",
            self.bucket,
            object_name
                .split('/')
                .map(|s| urlencoding::encode(s).into_owned())
                .collect::<Vec<_>>()
                .join("/")
        );

        let canonical_request = format!(
            "GET\n{}\n{}\nhost:storage.googleapis.com\n\nhost\nUNSIGNED-PAYLOAD",
            canonical_uri, canonical_query
        );

        // 正規リクエストのハッシュ
        let mut hasher = Sha256::new();
        hasher.update(canonical_request.as_bytes());
        let hashed_request = hex_encode(&hasher.finalize());

        // 署名対象文字列
        let string_to_sign = format!(
            "GOOG4-RSA-SHA256\n{}\n{}\n{}",
            datetime, credential_scope, hashed_request
        );

        // IAM signBlob APIで署名
        let signature = self.sign_blob(string_to_sign.as_bytes()).await?;
        let hex_signature = hex_encode(&signature);

        Ok(format!(
            "https://storage.googleapis.com{}?{}&X-Goog-Signature={}",
            canonical_uri, canonical_query, hex_signature
        ))
    }

    /// IAM signBlob APIを使ってデータに署名する
    async fn sign_blob(&self, data: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        let scopes = &["https://www.googleapis.com/auth/cloud-platform"];
        let token = self.auth.token(scopes).await?;

        let url = format!(
            "https://iam.googleapis.com/v1/projects/-/serviceAccounts/{}:signBlob",
            self.service_account_email
        );

        let body = json!({
            "bytesToSign": STANDARD.encode(data)
        });

        let resp = self
            .client
            .post(&url)
            .bearer_auth(token.as_str())
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await?;
            return Err(format!("IAM signBlob failed: {}", err).into());
        }

        let result: serde_json::Value = resp.json().await?;
        eprintln!("IAM signBlob response: {}", result);
        let signed_blob = result
            .get("signedBytes")
            .or_else(|| result.get("signedBlob"))
            .or_else(|| result.get("signature"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Unexpected IAM response: {}", result))?;

        Ok(STANDARD.decode(signed_blob)?)
    }
}

/// バイト列を16進文字列に変換
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
