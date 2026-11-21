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
    /// 多页合并曲谱的原图页列表（绝对路径）
    #[serde(default)]
    pub pages: Vec<String>,
    /// 自定义标签(风格/难度等,JSON 数组存储)
    #[serde(default)]
    pub tags: Vec<String>,
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
    /// 精确匹配一个标签
    #[serde(default)]
    pub tag: Option<String>,
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

/// 每首曲子的练习状态（跨会话恢复：速度/音量/循环/布局/缩放/A-B 区间/节拍器/预备拍）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeState {
    pub speed: f64,
    pub volume: f64,
    pub loop_enabled: bool,
    /// page | horizontal
    pub layout: String,
    pub scale: f64,
    pub ab_start: Option<i64>,
    pub ab_end: Option<i64>,
    #[serde(default)]
    pub metronome_enabled: bool,
    /// alphaTab 量程 0.0-3.0
    #[serde(default = "default_metronome_volume")]
    pub metronome_volume: f64,
    #[serde(default)]
    pub count_in_enabled: bool,
}

fn default_metronome_volume() -> f64 {
    1.5
}

/// A-B 循环段落(命名保存,一键切换)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbSegment {
    pub id: String,
    pub score_id: String,
    pub name: String,
    pub start_tick: i64,
    pub end_tick: i64,
}

/// 练习统计:每曲合计
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeStatRow {
    pub score_id: String,
    pub title: String,
    pub instrument: String,
    pub total_seconds: i64,
    pub sessions: i64,
    pub last_played_at: String,
}

/// 练习统计:按日合计(近 N 天)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPractice {
    /// YYYY-MM-DD
    pub day: String,
    pub seconds: i64,
}

/// 歌单
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub item_count: i64,
}

/// 歌单曲目(带顺序)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItem {
    pub id: String,
    pub position: i64,
    pub score: Score,
}
