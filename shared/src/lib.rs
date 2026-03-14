use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

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

/// ハッシュチェーンの入力エントリ（視線データ1件分）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GazeEntry {
    pub paragraph_id: String,
    pub dwell_time: f64,
    pub timestamp: String,
}

/// ハッシュチェーンを計算する
///
/// H0 = SHA-256(session_id || document_hash)
/// Hn = SHA-256(H_{n-1} || paragraph_id || dwell_time || timestamp)
///
/// gaze_entries はタイムスタンプ順にソートされていること
pub fn compute_hash_chain(
    session_id: &str,
    document_hash: &str,
    gaze_entries: &[GazeEntry],
) -> String {
    let mut hash = sha256(&format!("{}||{}", session_id, document_hash));

    for entry in gaze_entries {
        hash = sha256(&format!(
            "{}||{}||{}||{}",
            hash, entry.paragraph_id, entry.dwell_time, entry.timestamp
        ));
    }

    hash
}

/// 文書HTMLのSHA-256ハッシュを計算する
pub fn hash_document(html: &str) -> String {
    sha256(html)
}

fn sha256(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    format!("{:x}", hasher.finalize())
}
