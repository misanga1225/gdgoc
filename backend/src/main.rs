mod auth;
mod firestore;
mod kms;
mod storage;
mod vertex_ai;

use auth::{AuthenticatedDoctor, CertsCache};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch, post},
    Json, Router,
};
use chrono::Utc;
use firestore::FirestoreClient;
use kms::KmsClient;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use shared::{
    compute_hash_chain, hash_document, CreateSessionRequest, GazeEntry, Session, SessionStatus,
    UpdateStatusRequest,
};
use std::{net::SocketAddr, sync::Arc};
use storage::StorageClient;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;
use vertex_ai::{MissedParagraph, VertexAiClient};

#[derive(Clone)]
struct AppState {
    db: FirestoreClient,
    storage: StorageClient,
    ai: VertexAiClient,
    kms: KmsClient,
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

/// POST /sessions — セッション作成
async fn create_session(
    _doctor: AuthenticatedDoctor,
    State(state): State<AppState>,
    Json(req): Json<CreateSessionRequest>,
) -> impl IntoResponse {
    let session_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let expires_at = (Utc::now() + chrono::Duration::hours(24)).to_rfc3339();

    let session = Session {
        session_id: session_id.clone(),
        name: req.name,
        patient_id: req.patient_id,
        status: SessionStatus::Waiting,
        current_scroll_pos: 0.0,
        document_url: String::new(),
        created_at: now,
        expires_at,
    };

    let fields = session_to_fields(&session);

    match state.db.create_document("Patients", &session_id, fields).await {
        Ok(()) => {
            let patient_url = format!("/patient?session={}", session_id);
            (
                StatusCode::CREATED,
                Json(json!({
                    "session_id": session_id,
                    "patient_url": patient_url,
                })),
            )
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        ),
    }
}

/// GET /sessions/:id — セッション取得（document_urlを署名付きURLに変換して返す）
async fn get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> (StatusCode, Json<Value>) {
    let mut fields = match state.db.get_document("Patients", &session_id).await {
        Ok(f) => f,
        Err(e) if e.to_string() == "not_found" => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "session not found" })),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            );
        }
    };

    // document_url（オブジェクト名）から署名付きURLを生成
    let obj_name = fields
        .get("document_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if !obj_name.is_empty() {
        // 旧形式（完全URL）の場合はオブジェクト名を抽出
        let bucket = state.storage.bucket_name().to_string();
        let object_name = if obj_name.starts_with("https://") {
            let prefix = format!("{}/", bucket);
            obj_name
                .rsplit_once(&prefix)
                .map(|(_, name)| name.to_string())
                .unwrap_or(obj_name)
        } else {
            obj_name
        };

        match state.storage.generate_signed_url(&object_name, 3600).await {
            Ok(signed_url) => {
                fields.insert("document_url".to_string(), json!(signed_url));
            }
            Err(e) => {
                eprintln!("Failed to generate signed URL: {}", e);
            }
        }
    }

    (StatusCode::OK, Json(Value::Object(fields)))
}

/// PATCH /sessions/:id/status — ステータス更新
async fn update_session_status(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(req): Json<UpdateStatusRequest>,
) -> impl IntoResponse {
    let fields = match state.db.get_document("Patients", &session_id).await {
        Ok(f) => f,
        Err(e) if e.to_string() == "not_found" => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "session not found" })),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            );
        }
    };

    let current_status_str = fields
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("waiting");

    let current_status: SessionStatus =
        serde_json::from_value(json!(current_status_str)).unwrap_or(SessionStatus::Waiting);

    if !current_status.can_transition_to(&req.status) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": format!(
                    "invalid status transition: {:?} → {:?}",
                    current_status, req.status
                )
            })),
        );
    }

    let new_status_str =
        serde_json::to_value(&req.status).unwrap_or(json!("waiting"));

    let mut update_fields = Map::new();
    update_fields.insert("status".to_string(), new_status_str);

    match state
        .db
        .update_document("Patients", &session_id, update_fields, &["status"])
        .await
    {
        Ok(()) => (
            StatusCode::OK,
            Json(json!({ "session_id": session_id, "status": req.status })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        ),
    }
}

/// 文書アップロードリクエスト
#[derive(Deserialize)]
struct UploadDocumentRequest {
    session_id: String,
    html: String,
}

/// POST /documents/upload — HTML文書をCloud Storageにアップロード
async fn upload_document(
    _doctor: AuthenticatedDoctor,
    State(state): State<AppState>,
    Json(req): Json<UploadDocumentRequest>,
) -> impl IntoResponse {
    // セッションの存在確認
    if let Err(e) = state.db.get_document("Patients", &req.session_id).await {
        if e.to_string() == "not_found" {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "session not found" })),
            );
        }
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        );
    }

    // Cloud Storageにアップロード
    let object_name = format!("documents/{}.html", req.session_id);
    let document_url = match state.storage.upload_html(&object_name, &req.html).await {
        Ok(url) => url,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Upload failed: {}", e) })),
            );
        }
    };

    // セッションのdocument_urlを更新
    let mut update_fields = Map::new();
    update_fields.insert("document_url".to_string(), json!(document_url));

    if let Err(e) = state
        .db
        .update_document("Patients", &req.session_id, update_fields, &["document_url"])
        .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Failed to update session: {}", e) })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({
            "session_id": req.session_id,
            "document_url": document_url,
        })),
    )
}

/// 見落とし要約リクエスト
#[derive(Deserialize)]
struct SummarizeMissedRequest {
    paragraphs: Vec<MissedParagraph>,
}

/// POST /sessions/:id/summarize-missed — 見落とし段落をAIで要約
async fn summarize_missed(
    _doctor: AuthenticatedDoctor,
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(req): Json<SummarizeMissedRequest>,
) -> impl IntoResponse {
    // セッションの存在確認
    if let Err(e) = state.db.get_document("Patients", &session_id).await {
        if e.to_string() == "not_found" {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "session not found" })),
            );
        }
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        );
    }

    match state.ai.summarize_missed(&req.paragraphs).await {
        Ok(summary) => (StatusCode::OK, Json(json!({ "summary": summary }))),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("AI summarization failed: {}", e) })),
        ),
    }
}

/// POST /sessions/:id/finalize — 最終同意：ハッシュチェーン計算 + KMS署名 + Evidence保存
async fn finalize_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    // セッション取得 + ステータス検証
    let fields = match state.db.get_document("Patients", &session_id).await {
        Ok(f) => f,
        Err(e) if e.to_string() == "not_found" => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "session not found" })),
            );
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": e.to_string() })),
            );
        }
    };

    let current_status_str = fields
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if current_status_str != "authorized" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "session must be in 'authorized' status to finalize" })),
        );
    }

    let document_url = fields
        .get("document_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // document_urlからオブジェクト名を取得（旧形式の完全URL対応）
    let object_name = if document_url.starts_with("https://") {
        let bucket = state.storage.bucket_name().to_string();
        let prefix = format!("{}/", bucket);
        document_url
            .rsplit_once(&prefix)
            .map(|(_, name)| name.to_string())
            .unwrap_or(document_url)
    } else {
        document_url
    };

    // 文書HTMLをCloud Storageから取得してハッシュ化（サーバー間通信）
    let doc_hash = if !object_name.is_empty() {
        match state.storage.download_object(&object_name).await {
            Ok(html) => hash_document(&html),
            Err(_) => hash_document(""),
        }
    } else {
        hash_document("")
    };

    // LiveGaze全件取得
    let gaze_docs = match state
        .db
        .list_documents("Patients", &session_id, "LiveGaze")
        .await
    {
        Ok(docs) => docs,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("Failed to read gaze data: {}", e) })),
            );
        }
    };

    // GazeEntry に変換
    let mut gaze_entries: Vec<GazeEntry> = gaze_docs
        .iter()
        .map(|doc| GazeEntry {
            paragraph_id: doc
                .get("paragraph_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            dwell_time: doc
                .get("dwell_time")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0),
            timestamp: doc
                .get("last_updated")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        })
        .collect();

    // タイムスタンプ順にソート
    gaze_entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    // ハッシュチェーン計算
    let root_hash = compute_hash_chain(&session_id, &doc_hash, &gaze_entries);

    // KMS署名
    let kms_signature = match state.kms.sign(root_hash.as_bytes()).await {
        Ok(sig) => sig,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": format!("KMS signing failed: {}", e) })),
            );
        }
    };

    let now = Utc::now().to_rfc3339();

    // Evidence に保存
    let mut evidence_fields = Map::new();
    evidence_fields.insert("session_id".to_string(), json!(session_id));
    evidence_fields.insert("root_hash".to_string(), json!(root_hash));
    evidence_fields.insert("kms_signature".to_string(), json!(kms_signature));
    evidence_fields.insert("blockchain_tx_hash".to_string(), json!(""));
    evidence_fields.insert("timestamp".to_string(), json!(now));

    if let Err(e) = state
        .db
        .create_document("Evidence", &session_id, evidence_fields)
        .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Failed to save evidence: {}", e) })),
        );
    }

    // セッションステータスを completed に更新
    let mut status_fields = Map::new();
    status_fields.insert("status".to_string(), json!("completed"));

    if let Err(e) = state
        .db
        .update_document("Patients", &session_id, status_fields, &["status"])
        .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Failed to update status: {}", e) })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({
            "evidence_id": session_id,
            "root_hash": root_hash,
            "timestamp": now,
        })),
    )
}

/// Session構造体をFirestore用のフィールドMapに変換
fn session_to_fields(session: &Session) -> Map<String, Value> {
    let value = serde_json::to_value(session).unwrap_or(json!({}));
    value.as_object().cloned().unwrap_or_default()
}

#[tokio::main]
async fn main() {
    // プロジェクトルートの .env を読み込む
    let env_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env");
    dotenvy::from_path(&env_path).ok();

    let project_id =
        std::env::var("GCP_PROJECT_ID").unwrap_or_else(|_| "gdgoc-490204".to_string());
    let bucket =
        std::env::var("STORAGE_BUCKET").unwrap_or_else(|_| "gdgoc-docs".to_string());
    let region =
        std::env::var("GCP_REGION").unwrap_or_else(|_| "asia-northeast1".to_string());
    let gemini_model =
        std::env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-1.5-flash".to_string());

    let db = FirestoreClient::new(&project_id).await.expect(
        "Failed to initialize Firestore client. Ensure GCP credentials are available.",
    );

    let kms_key_ring =
        std::env::var("KMS_KEY_RING").unwrap_or_else(|_| "gdgoc-doctor-secret-key".to_string());
    let kms_key_name =
        std::env::var("KMS_KEY_NAME").unwrap_or_else(|_| "doctor-secret-key".to_string());

    let service_account_email = std::env::var("SERVICE_ACCOUNT_EMAIL")
        .expect("SERVICE_ACCOUNT_EMAIL must be set (e.g. your-sa@project.iam.gserviceaccount.com)");

    let auth = db.auth();
    let storage = StorageClient::new(auth.clone(), &bucket, &service_account_email);
    let ai = VertexAiClient::new(auth.clone(), &project_id, &region, &gemini_model);
    let kms = KmsClient::new(auth, &project_id, &region, &kms_key_ring, &kms_key_name);

    let state = AppState { db, storage, ai, kms };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let project_id_ext = Arc::new(project_id.clone());
    let certs_cache = CertsCache::new();

    let app = Router::new()
        .route("/health", get(health))
        .route("/sessions", post(create_session))
        .route("/sessions/{id}", get(get_session))
        .route("/sessions/{id}/status", patch(update_session_status))
        .route("/documents/upload", post(upload_document))
        .route(
            "/sessions/{id}/summarize-missed",
            post(summarize_missed),
        )
        .route("/sessions/{id}/finalize", post(finalize_session))
        .with_state(state)
        .layer(axum::Extension(project_id_ext))
        .layer(axum::Extension(certs_cache))
        .layer(cors);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8081".to_string())
        .parse()
        .expect("PORT must be a valid u16");

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind");

    axum::serve(listener, app)
        .await
        .expect("Server error");
}
