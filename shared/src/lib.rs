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
