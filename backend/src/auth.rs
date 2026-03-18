use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json, RequestPartsExt,
};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
    time::{Duration, Instant},
};

const GOOGLE_CERTS_URL: &str =
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

#[derive(Debug, Serialize, Deserialize)]
pub struct FirebaseClaims {
    pub sub: String,
    pub email: Option<String>,
    pub iss: String,
    pub aud: String,
    pub exp: u64,
    pub iat: u64,
}

/// 公開鍵のキャッシュ（1時間有効）
#[derive(Clone)]
pub struct CertsCache {
    inner: Arc<RwLock<CertsCacheInner>>,
}

struct CertsCacheInner {
    certs: HashMap<String, String>,
    fetched_at: Option<Instant>,
}

impl CertsCache {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(CertsCacheInner {
                certs: HashMap::new(),
                fetched_at: None,
            })),
        }
    }

    fn is_expired(&self) -> bool {
        let inner = self.inner.read().unwrap();
        match inner.fetched_at {
            None => true,
            Some(t) => t.elapsed() > Duration::from_secs(3600),
        }
    }

    fn get_certs(&self) -> HashMap<String, String> {
        self.inner.read().unwrap().certs.clone()
    }

    fn set_certs(&self, certs: HashMap<String, String>) {
        let mut inner = self.inner.write().unwrap();
        inner.certs = certs;
        inner.fetched_at = Some(Instant::now());
    }
}

pub async fn fetch_google_certs(cache: &CertsCache) -> Result<HashMap<String, String>, String> {
    if !cache.is_expired() {
        return Ok(cache.get_certs());
    }
    let client = Client::new();
    let resp = client
        .get(GOOGLE_CERTS_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let certs: HashMap<String, String> = resp.json().await.map_err(|e| e.to_string())?;
    cache.set_certs(certs.clone());
    Ok(certs)
}

pub async fn verify_firebase_token(
    token: &str,
    project_id: &str,
    cache: &CertsCache,
) -> Result<FirebaseClaims, String> {
    let header = decode_header(token).map_err(|e| e.to_string())?;
    let kid = header.kid.ok_or("missing kid in token header")?;

    let certs = fetch_google_certs(cache).await?;
    let cert_pem = certs.get(&kid).ok_or("unknown kid")?;

    let decoding_key =
        DecodingKey::from_rsa_pem(cert_pem.as_bytes()).map_err(|e| e.to_string())?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&[project_id]);
    let expected_iss = format!("https://securetoken.google.com/{}", project_id);
    validation.set_issuer(&[&expected_iss]);

    let token_data =
        decode::<FirebaseClaims>(token, &decoding_key, &validation).map_err(|e| e.to_string())?;

    Ok(token_data.claims)
}

/// Axum extractor: AuthorizationヘッダーからFirebase IDトークンを取得・検証する
#[allow(dead_code)]
pub struct AuthenticatedDoctor(pub FirebaseClaims);

pub enum AuthError {
    MissingToken,
    #[allow(dead_code)]
    InvalidToken(String),
}

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        let (status, message): (StatusCode, &str) = match self {
            AuthError::MissingToken => (StatusCode::UNAUTHORIZED, "missing authorization token"),
            AuthError::InvalidToken(_) => (StatusCode::UNAUTHORIZED, "invalid or expired token"),
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

impl<S> FromRequestParts<S> for AuthenticatedDoctor
where
    S: Send + Sync,
{
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // DEV_SKIP_AUTH=true の場合は認証をスキップ（開発環境専用）
        if std::env::var("DEV_SKIP_AUTH").unwrap_or_default() == "true" {
            return Ok(AuthenticatedDoctor(FirebaseClaims {
                sub: "dev-doctor".to_string(),
                email: Some("dev@localhost".to_string()),
                iss: "dev".to_string(),
                aud: "dev".to_string(),
                exp: u64::MAX,
                iat: 0,
            }));
        }

        // ヘッダーからトークンを String にコピーして借用を終わらせる
        let token: String = {
            let auth_header = parts
                .headers
                .get("Authorization")
                .and_then(|v| v.to_str().ok())
                .ok_or(AuthError::MissingToken)?;
            auth_header
                .strip_prefix("Bearer ")
                .ok_or(AuthError::MissingToken)?
                .to_string()
        };

        let axum::Extension(project_id): axum::Extension<Arc<String>> = parts
            .extract::<axum::Extension<Arc<String>>>()
            .await
            .map_err(|_| AuthError::InvalidToken("missing project_id extension".to_string()))?;

        let axum::Extension(cache): axum::Extension<CertsCache> = parts
            .extract::<axum::Extension<CertsCache>>()
            .await
            .map_err(|_| AuthError::InvalidToken("missing certs cache extension".to_string()))?;

        let claims = verify_firebase_token(&token, &project_id, &cache)
            .await
            .map_err(AuthError::InvalidToken)?;

        Ok(AuthenticatedDoctor(claims))
    }
}
