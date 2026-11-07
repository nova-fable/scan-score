use serde::{Deserialize, Serialize};

/// 曲库条目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    pub id: String,
    pub title: String,
    pub composer: Option<String>,
    /// piano | guitar | other
    pub instrument: String,
    /// pdf | png | jpg | musicxml | gp
    pub source_type: String,
    /// imported | processing | ready | failed
    pub status: String,
    pub original_path: Option<String>,
    pub musicxml_path: Option<String>,
    pub cover_path: Option<String>,
    pub page_count: i64,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 识别任务
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub score_id: String,
    /// 目前只有 omr
    pub kind: String,
    /// queued | running | done | failed | canceled
    pub state: String,
    pub progress: i64,
    pub message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub finished_at: Option<String>,
}

/// 曲库查询条件
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreQuery {
    pub query: Option<String>,
    pub instrument: Option<String>,
    pub status: Option<String>,
}

/// 应用设置键值对
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Setting {
    pub key: String,
    pub value: String,
}

/// 推送到前端的识别进度事件载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OmrProgressEvent {
    pub job_id: String,
    pub score_id: String,
    pub state: String,
    pub progress: i64,
    pub message: Option<String>,
}

/// 识别完成事件载荷
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OmrDoneEvent {
    pub job_id: String,
    pub score_id: String,
    pub ok: bool,
    pub score: Option<Score>,
    pub error: Option<String>,
}
