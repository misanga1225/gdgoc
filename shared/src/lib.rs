use serde::{Deserialize, Serialize};

/// セッションのステータス
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Waiting,
    Watching,
    Reviewed,
    Authorized,
    Completed,
}

impl SessionStatus {
    /// 許可されたステータス遷移かどうかを検証
    /// waiting → watching → reviewed → authorized → completed
    pub fn can_transition_to(&self, next: &SessionStatus) -> bool {
        matches!(
            (self, next),
            (SessionStatus::Waiting, SessionStatus::Watching)
                | (SessionStatus::Watching, SessionStatus::Reviewed)
                | (SessionStatus::Reviewed, SessionStatus::Authorized)
                | (SessionStatus::Authorized, SessionStatus::Completed)
        )
    }
}

/// Firestoreに保存されるセッション
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub session_id: String,
    pub name: String,
    pub patient_id: String,
    pub status: SessionStatus,
    pub current_scroll_pos: f64,
    pub document_url: String,
    pub created_at: String,
    pub expires_at: String,
}

/// セッション作成リクエスト
#[derive(Debug, Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    pub patient_id: String,
}

/// ステータス更新リクエスト
#[derive(Debug, Deserialize)]
pub struct UpdateStatusRequest {
    pub status: SessionStatus,
}
