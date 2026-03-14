mod firestore;
mod storage;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, patch, post},
    Json, Router,
};
use chrono::Utc;
use firestore::FirestoreClient;
use serde::Deserialize;
use serde_json::{json, Map, Value};
use shared::{CreateSessionRequest, Session, SessionStatus, UpdateStatusRequest};
use std::net::SocketAddr;
use storage::StorageClient;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    db: FirestoreClient,
    storage: StorageClient,
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

/// POST /sessions — セッション作成
async fn create_session(
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

/// GET /sessions/:id — セッション取得
async fn get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> impl IntoResponse {
    match state.db.get_document("Patients", &session_id).await {
        Ok(fields) => (StatusCode::OK, Json(Value::Object(fields))),
        Err(e) if e.to_string() == "not_found" => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "session not found" })),
        ),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": e.to_string() })),
        ),
    }
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

/// Session構造体をFirestore用のフィールドMapに変換
fn session_to_fields(session: &Session) -> Map<String, Value> {
    let value = serde_json::to_value(session).unwrap_or(json!({}));
    value.as_object().cloned().unwrap_or_default()
}

#[tokio::main]
async fn main() {
    let project_id =
        std::env::var("GCP_PROJECT_ID").unwrap_or_else(|_| "gdgoc-490204".to_string());
    let bucket =
        std::env::var("STORAGE_BUCKET").unwrap_or_else(|_| "gdgoc-docs".to_string());

    let db = FirestoreClient::new(&project_id).await.expect(
        "Failed to initialize Firestore client. Ensure GCP credentials are available.",
    );

    let storage = StorageClient::new(db.auth(), &bucket);

    let state = AppState { db, storage };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/sessions", post(create_session))
        .route("/sessions/{id}", get(get_session))
        .route("/sessions/{id}/status", patch(update_session_status))
        .route("/documents/upload", post(upload_document))
        .with_state(state)
        .layer(cors);

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "8080".to_string())
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
