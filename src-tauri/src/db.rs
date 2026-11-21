use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::model::{
    AbSegment, DailyPractice, Job, Playlist, PlaylistItem, PracticeState, PracticeStatRow, Score,
    ScoreQuery,
};

/// 线程安全的数据库连接包装
pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Self::migrate(&conn)?;
        Ok(Self(Mutex::new(conn)))
    }

    fn migrate(conn: &Connection) -> Result<(), rusqlite::Error> {
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS scores (
                id            TEXT PRIMARY KEY,
                title         TEXT NOT NULL,
                composer      TEXT,
                instrument    TEXT NOT NULL DEFAULT 'other',
                source_type   TEXT NOT NULL,
                status        TEXT NOT NULL DEFAULT 'imported',
                original_path TEXT,
                musicxml_path TEXT,
                cover_path    TEXT,
                page_count    INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                created_at    TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_scores_status ON scores(status);
            CREATE TABLE IF NOT EXISTS jobs (
                id          TEXT PRIMARY KEY,
                score_id    TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
                kind        TEXT NOT NULL,
                state       TEXT NOT NULL DEFAULT 'queued',
                progress    INTEGER NOT NULL DEFAULT 0,
                message     TEXT,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL,
                finished_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_score ON jobs(score_id);
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS practice_state (
                score_id     TEXT PRIMARY KEY REFERENCES scores(id) ON DELETE CASCADE,
                speed        REAL NOT NULL DEFAULT 1.0,
                volume       REAL NOT NULL DEFAULT 1.0,
                loop_enabled INTEGER NOT NULL DEFAULT 0,
                layout       TEXT NOT NULL DEFAULT 'page',
                scale        REAL NOT NULL DEFAULT 1.0,
                ab_start     INTEGER,
                ab_end       INTEGER,
                updated_at   TEXT NOT NULL
            );
            "#,
        )?;
        // 增量迁移：多页合并曲谱的原图页列表
        let has_pages_json = Self::column_exists(conn, "scores", "pages_json")?;
        if !has_pages_json {
            conn.execute_batch("ALTER TABLE scores ADD COLUMN pages_json TEXT;")?;
        }
        // 增量迁移：练习状态补节拍器/预备拍列（老库无痛加列，新建表已含这些列时跳过）
        if !Self::column_exists(conn, "practice_state", "metronome_enabled")? {
            conn.execute_batch(
                "ALTER TABLE practice_state ADD COLUMN metronome_enabled INTEGER NOT NULL DEFAULT 0;
                 ALTER TABLE practice_state ADD COLUMN metronome_volume REAL NOT NULL DEFAULT 1.5;
                 ALTER TABLE practice_state ADD COLUMN count_in_enabled INTEGER NOT NULL DEFAULT 0;",
            )?;
        }
        // 增量迁移:曲谱标签列
        if !Self::column_exists(conn, "scores", "tags_json")? {
            conn.execute_batch("ALTER TABLE scores ADD COLUMN tags_json TEXT;")?;
        }
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS ab_segments (
                id         TEXT PRIMARY KEY,
                score_id   TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
                name       TEXT NOT NULL,
                start_tick INTEGER NOT NULL,
                end_tick   INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ab_segments_score ON ab_segments(score_id);
            CREATE TABLE IF NOT EXISTS practice_log (
                id        TEXT PRIMARY KEY,
                score_id  TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
                played_at TEXT NOT NULL,
                seconds   INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_practice_log_score ON practice_log(score_id);
            CREATE INDEX IF NOT EXISTS idx_practice_log_time ON practice_log(played_at);
            CREATE TABLE IF NOT EXISTS playlists (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS playlist_items (
                id          TEXT PRIMARY KEY,
                playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                score_id    TEXT NOT NULL REFERENCES scores(id) ON DELETE CASCADE,
                position    INTEGER NOT NULL,
                added_at    TEXT NOT NULL,
                UNIQUE(playlist_id, score_id)
            );
            "#,
        )?;
        Ok(())
    }

    fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, rusqlite::Error> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let mut rows = stmt.query([])?;
        while let Some(row) = rows.next()? {
            let name: String = row.get(1)?;
            if name == column {
                return Ok(true);
            }
        }
        Ok(false)
    }
}

fn row_to_score(row: &Row) -> rusqlite::Result<Score> {
    let pages_json: Option<String> = row.get("pages_json").unwrap_or(None);
    let pages: Vec<String> = pages_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let tags_json: Option<String> = row.get("tags_json").unwrap_or(None);
    let tags: Vec<String> = tags_json
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    Ok(Score {
        id: row.get("id")?,
        title: row.get("title")?,
        composer: row.get("composer")?,
        instrument: row.get("instrument")?,
        source_type: row.get("source_type")?,
        status: row.get("status")?,
        original_path: row.get("original_path")?,
        musicxml_path: row.get("musicxml_path")?,
        cover_path: row.get("cover_path")?,
        pages,
        page_count: row.get("page_count")?,
        error_message: row.get("error_message")?,
        tags,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn row_to_job(row: &Row) -> rusqlite::Result<Job> {
    Ok(Job {
        id: row.get("id")?,
        score_id: row.get("score_id")?,
        kind: row.get("kind")?,
        state: row.get("state")?,
        progress: row.get("progress")?,
        message: row.get("message")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        finished_at: row.get("finished_at")?,
    })
}

impl Db {
    pub fn insert_score(&self, score: &Score) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        let pages_json = if score.pages.is_empty() {
            None
        } else {
            Some(serde_json::to_string(&score.pages).unwrap_or_default())
        };
        let tags_json = serde_json::to_string(&score.tags).unwrap_or_default();
        conn.execute(
            "INSERT INTO scores (id, title, composer, instrument, source_type, status,
                 original_path, musicxml_path, cover_path, pages_json, tags_json, page_count, error_message,
                 created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                score.id,
                score.title,
                score.composer,
                score.instrument,
                score.source_type,
                score.status,
                score.original_path,
                score.musicxml_path,
                score.cover_path,
                pages_json,
                tags_json,
                score.page_count,
                score.error_message,
                score.created_at,
                score.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_scores(&self, query: &ScoreQuery) -> Result<Vec<Score>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        let mut sql = String::from(
            "SELECT id, title, composer, instrument, source_type, status,
                    original_path, musicxml_path, cover_path, pages_json, tags_json, page_count, error_message,
                    created_at, updated_at
             FROM scores WHERE 1=1",
        );
        let mut binds: Vec<String> = Vec::new();
        if let Some(q) = query.query.as_deref().filter(|s| !s.is_empty()) {
            sql.push_str(" AND (title LIKE ?1 OR composer LIKE ?1 OR tags_json LIKE ?1)");
            binds.push(format!("%{q}%"));
        }
        if let Some(instrument) = query.instrument.as_deref().filter(|s| !s.is_empty()) {
            sql.push_str(&format!(" AND instrument = ?{}", binds.len() + 1));
            binds.push(instrument.to_string());
        }
        if let Some(status) = query.status.as_deref().filter(|s| !s.is_empty()) {
            sql.push_str(&format!(" AND status = ?{}", binds.len() + 1));
            binds.push(status.to_string());
        }
        if let Some(tag) = query.tag.as_deref().filter(|s| !s.is_empty()) {
            sql.push_str(&format!(
                " AND EXISTS (SELECT 1 FROM json_each(scores.tags_json) WHERE value = ?{})",
                binds.len() + 1
            ));
            binds.push(tag.to_string());
        }
        sql.push_str(" ORDER BY created_at DESC");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(binds.iter()), row_to_score)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn get_score(&self, id: &str) -> Result<Option<Score>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, title, composer, instrument, source_type, status,
                    original_path, musicxml_path, cover_path, pages_json, tags_json, page_count, error_message,
                    created_at, updated_at
             FROM scores WHERE id = ?1",
            params![id],
            row_to_score,
        )
        .optional()
    }

    pub fn update_score_meta(
        &self,
        id: &str,
        title: &str,
        composer: Option<&str>,
        instrument: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE scores SET title = ?2, composer = ?3, instrument = ?4,
                    updated_at = ?5 WHERE id = ?1",
            params![id, title, composer, instrument, now()],
        )?;
        Ok(())
    }

    pub fn update_score_status(
        &self,
        id: &str,
        status: &str,
        error_message: Option<&str>,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE scores SET status = ?2, error_message = ?3, updated_at = ?4
             WHERE id = ?1",
            params![id, status, error_message, now()],
        )?;
        Ok(())
    }

    pub fn update_score_recognition(
        &self,
        id: &str,
        musicxml_path: &str,
        instrument: &str,
        title: Option<&str>,
        composer: Option<&str>,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        // 识别成功：更新识别产物路径与解析出的元数据
        conn.execute(
            "UPDATE scores SET musicxml_path = ?2, instrument = ?3, status = 'ready',
                    error_message = NULL, updated_at = ?4
             WHERE id = ?1",
            params![id, musicxml_path, instrument, now()],
        )?;
        // 仅当标题仍是导入时的源文件名时，才用识别出的标题替换（保留用户编辑）
        if let Some(t) = title.filter(|t| !t.trim().is_empty()) {
            let (current, original_path): (Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT title, original_path FROM scores WHERE id = ?1",
                    params![id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?
                .unwrap_or((None, None));
            let is_placeholder = match (current, original_path) {
                (Some(cur), Some(orig)) => {
                    let stem = Path::new(&orig)
                        .file_stem()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    cur == stem
                }
                _ => false,
            };
            if is_placeholder {
                conn.execute(
                    "UPDATE scores SET title = ?2 WHERE id = ?1",
                    params![id, t],
                )?;
            }
        }
        if let Some(c) = composer.filter(|c| !c.trim().is_empty()) {
            conn.execute(
                "UPDATE scores SET composer = COALESCE(composer, ?2) WHERE id = ?1",
                params![id, c],
            )?;
        }
        Ok(())
    }

    pub fn delete_score(&self, id: &str) -> Result<usize, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM jobs WHERE score_id = ?1", params![id])?;
        conn.execute("DELETE FROM scores WHERE id = ?1", params![id])
    }

    // ---- jobs ----

    pub fn insert_job(&self, job: &Job) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO jobs (id, score_id, kind, state, progress, message,
                 created_at, updated_at, finished_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                job.id,
                job.score_id,
                job.kind,
                job.state,
                job.progress,
                job.message,
                job.created_at,
                job.updated_at,
                job.finished_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_job(&self, id: &str, state: &str, progress: i64, message: Option<&str>) -> Result<(), rusqlite::Error> {
        let finished = if matches!(state, "done" | "failed" | "canceled") {
            Some(now())
        } else {
            None
        };
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE jobs SET state = ?2, progress = ?3, message = ?4, updated_at = ?5,
                    finished_at = COALESCE(?6, finished_at)
             WHERE id = ?1",
            params![id, state, progress, message, now(), finished],
        )?;
        Ok(())
    }

    pub fn get_job(&self, id: &str) -> Result<Option<Job>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, score_id, kind, state, progress, message,
                    created_at, updated_at, finished_at
             FROM jobs WHERE id = ?1",
            params![id],
            row_to_job,
        )
        .optional()
    }

    pub fn list_jobs(&self, score_id: Option<&str>) -> Result<Vec<Job>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        let sql = "SELECT id, score_id, kind, state, progress, message,
                          created_at, updated_at, finished_at
                   FROM jobs
                   WHERE (?1 IS NULL OR score_id = ?1)
                   ORDER BY created_at DESC LIMIT 200";
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![score_id], row_to_job)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// 取队首待处理任务（按创建时间）
    pub fn next_queued_job(&self) -> Result<Option<Job>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, score_id, kind, state, progress, message,
                    created_at, updated_at, finished_at
             FROM jobs WHERE state = 'queued'
             ORDER BY created_at ASC LIMIT 1",
            [],
            row_to_job,
        )
        .optional()
    }

    // ---- 标签 ----

    pub fn set_score_tags(&self, id: &str, tags: &[String]) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE scores SET tags_json = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, serde_json::to_string(tags).unwrap_or_default(), now()],
        )?;
        Ok(())
    }

    // ---- A-B 段落 ----

    pub fn list_ab_segments(&self, score_id: &str) -> Result<Vec<AbSegment>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, score_id, name, start_tick, end_tick FROM ab_segments
             WHERE score_id = ?1 ORDER BY start_tick",
        )?;
        let rows = stmt.query_map(params![score_id], |row| {
            Ok(AbSegment {
                id: row.get(0)?,
                score_id: row.get(1)?,
                name: row.get(2)?,
                start_tick: row.get(3)?,
                end_tick: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn insert_ab_segment(&self, seg: &AbSegment) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO ab_segments (id, score_id, name, start_tick, end_tick, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![seg.id, seg.score_id, seg.name, seg.start_tick, seg.end_tick, now(), now()],
        )?;
        Ok(())
    }

    pub fn delete_ab_segment(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM ab_segments WHERE id = ?1", params![id])?;
        Ok(())
    }

    // ---- 练习统计 ----

    pub fn add_practice_log(&self, score_id: &str, seconds: i64) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO practice_log (id, score_id, played_at, seconds) VALUES (?1, ?2, ?3, ?4)",
            params![uuid::Uuid::new_v4().to_string(), score_id, now(), seconds.max(0)],
        )?;
        Ok(())
    }

    pub fn list_practice_stats(&self) -> Result<Vec<PracticeStatRow>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.score_id, s.title, s.instrument, SUM(p.seconds), COUNT(*), MAX(p.played_at)
             FROM practice_log p JOIN scores s ON s.id = p.score_id
             GROUP BY p.score_id ORDER BY SUM(p.seconds) DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PracticeStatRow {
                score_id: row.get(0)?,
                title: row.get(1)?,
                instrument: row.get(2)?,
                total_seconds: row.get(3)?,
                sessions: row.get(4)?,
                last_played_at: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    /// 近 N 天每日练习秒数(date() 把 rfc3339 归一到 YYYY-MM-DD,字符串比较安全)
    pub fn practice_daily(&self, days: i64) -> Result<Vec<DailyPractice>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT date(played_at) AS day, SUM(seconds) FROM practice_log
             WHERE date(played_at) >= date('now', ?1)
             GROUP BY day ORDER BY day",
        )?;
        let rows = stmt.query_map(params![format!("-{days} days")], |row| {
            Ok(DailyPractice {
                day: row.get(0)?,
                seconds: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    // ---- 歌单 ----

    pub fn create_playlist(&self, name: &str) -> Result<Playlist, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO playlists (id, name, created_at) VALUES (?1, ?2, ?3)",
            params![id, name, now()],
        )?;
        Ok(Playlist {
            id,
            name: name.to_string(),
            item_count: 0,
        })
    }

    pub fn delete_playlist(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn list_playlists(&self) -> Result<Vec<Playlist>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT p.id, p.name, COUNT(pi.id) FROM playlists p
             LEFT JOIN playlist_items pi ON pi.playlist_id = p.id
             GROUP BY p.id ORDER BY p.created_at",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                item_count: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn add_to_playlist(&self, playlist_id: &str, score_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO playlist_items (id, playlist_id, score_id, position, added_at)
             VALUES (?1, ?2, ?3,
                     COALESCE((SELECT MAX(position) + 1 FROM playlist_items WHERE playlist_id = ?2), 1),
                     ?4)",
            params![uuid::Uuid::new_v4().to_string(), playlist_id, score_id, now()],
        )?;
        Ok(())
    }

    pub fn remove_from_playlist(&self, item_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM playlist_items WHERE id = ?1", params![item_id])?;
        Ok(())
    }

    pub fn list_playlist_items(&self, playlist_id: &str) -> Result<Vec<PlaylistItem>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT pi.id AS item_id, pi.position, s.id, s.title, s.composer, s.instrument,
                    s.source_type, s.status, s.original_path, s.musicxml_path, s.cover_path,
                    s.pages_json, s.tags_json, s.page_count, s.error_message, s.created_at, s.updated_at
             FROM playlist_items pi JOIN scores s ON s.id = pi.score_id
             WHERE pi.playlist_id = ?1 ORDER BY pi.position",
        )?;
        let rows = stmt.query_map(params![playlist_id], |row| {
            Ok(PlaylistItem {
                id: row.get("item_id")?,
                position: row.get("position")?,
                score: row_to_score(row)?,
            })
        })?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    // ---- settings ----

    /// 练习状态：跨会话按曲子恢复（速度/音量/循环/布局/缩放/A-B/节拍器/预备拍）
    pub fn get_practice_state(
        &self,
        score_id: &str,
    ) -> Result<Option<PracticeState>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT speed, volume, loop_enabled, layout, scale, ab_start, ab_end,
                    metronome_enabled, metronome_volume, count_in_enabled
             FROM practice_state WHERE score_id = ?1",
            params![score_id],
            |row| {
                Ok(PracticeState {
                    speed: row.get(0)?,
                    volume: row.get(1)?,
                    loop_enabled: row.get::<_, i64>(2)? != 0,
                    layout: row.get(3)?,
                    scale: row.get(4)?,
                    ab_start: row.get(5)?,
                    ab_end: row.get(6)?,
                    metronome_enabled: row.get::<_, i64>(7)? != 0,
                    metronome_volume: row.get(8)?,
                    count_in_enabled: row.get::<_, i64>(9)? != 0,
                })
            },
        )
        .optional()
    }

    pub fn set_practice_state(
        &self,
        score_id: &str,
        p: &PracticeState,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO practice_state
                (score_id, speed, volume, loop_enabled, layout, scale, ab_start, ab_end,
                 metronome_enabled, metronome_volume, count_in_enabled, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(score_id) DO UPDATE SET
                speed = ?2, volume = ?3, loop_enabled = ?4, layout = ?5,
                scale = ?6, ab_start = ?7, ab_end = ?8,
                metronome_enabled = ?9, metronome_volume = ?10, count_in_enabled = ?11,
                updated_at = ?12",
            params![
                score_id,
                p.speed,
                p.volume,
                p.loop_enabled as i64,
                p.layout,
                p.scale,
                p.ab_start,
                p.ab_end,
                p.metronome_enabled as i64,
                p.metronome_volume,
                p.count_in_enabled as i64,
                now()
            ],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |r| r.get(0),
        )
        .optional()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ScoreQuery;

    fn score(id: &str, title: &str, status: &str) -> Score {
        Score {
            id: id.to_string(),
            title: title.to_string(),
            composer: None,
            instrument: "piano".into(),
            source_type: "pdf".into(),
            status: status.into(),
            tags: Vec::new(),
            original_path: None,
            musicxml_path: None,
            cover_path: None,
            pages: Vec::new(),
            page_count: 0,
            error_message: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    /// 每个测试线程一个独立的命名内存库，避免共享缓存互踩
    fn test_db(tag: &str) -> Db {
        let name = format!(
            "file:memdb_{tag}_{:?}?mode=memory&cache=shared",
            std::thread::current().id()
        );
        Db::open(Path::new(&name)).unwrap()
    }

    #[test]
    fn test_migrate_and_crud() {
        let db = test_db("crud");
        db.insert_score(&score("s1", "Test", "imported")).unwrap();
        let all = db.list_scores(&ScoreQuery::default()).unwrap();
        assert_eq!(all.len(), 1);

        db.update_score_status("s1", "ready", None).unwrap();
        let got = db.get_score("s1").unwrap().unwrap();
        assert_eq!(got.status, "ready");

        let found = db
            .list_scores(&ScoreQuery {
                query: Some("tes".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(found.len(), 1);

        db.delete_score("s1").unwrap();
        assert!(db.get_score("s1").unwrap().is_none());
    }

    #[test]
    fn test_jobs_and_settings() {
        let db = test_db("jobs");
        db.insert_score(&score("s1", "Test", "imported")).unwrap();
        let job = Job {
            id: "j1".into(),
            score_id: "s1".into(),
            kind: "omr".into(),
            state: "queued".into(),
            progress: 0,
            message: None,
            created_at: now(),
            updated_at: now(),
            finished_at: None,
        };
        db.insert_job(&job).unwrap();
        let next = db.next_queued_job().unwrap().unwrap();
        assert_eq!(next.id, "j1");

        db.update_job("j1", "running", 10, Some("开始")).unwrap();
        let j = db.get_job("j1").unwrap().unwrap();
        assert_eq!(j.state, "running");
        assert_eq!(j.progress, 10);
        assert!(j.finished_at.is_none());

        db.update_job("j1", "done", 100, None).unwrap();
        let j = db.get_job("j1").unwrap().unwrap();
        assert!(j.finished_at.is_some());

        db.set_setting("engine_path", "/tmp/x").unwrap();
        assert_eq!(db.get_setting("engine_path").unwrap().unwrap(), "/tmp/x");
    }
}
