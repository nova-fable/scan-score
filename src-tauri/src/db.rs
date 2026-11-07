use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::model::{Job, Score, ScoreQuery};

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
            "#,
        )
    }
}

fn row_to_score(row: &Row) -> rusqlite::Result<Score> {
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
        page_count: row.get("page_count")?,
        error_message: row.get("error_message")?,
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
        conn.execute(
            "INSERT INTO scores (id, title, composer, instrument, source_type, status,
                 original_path, musicxml_path, cover_path, page_count, error_message,
                 created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
                    original_path, musicxml_path, cover_path, page_count, error_message,
                    created_at, updated_at
             FROM scores WHERE 1=1",
        );
        let mut binds: Vec<String> = Vec::new();
        if let Some(q) = query.query.as_deref().filter(|s| !s.is_empty()) {
            sql.push_str(" AND (title LIKE ?1 OR composer LIKE ?1)");
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
        sql.push_str(" ORDER BY created_at DESC");
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(binds.iter()), row_to_score)?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    pub fn get_score(&self, id: &str) -> Result<Option<Score>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
        conn.query_row(
            "SELECT id, title, composer, instrument, source_type, status,
                    original_path, musicxml_path, cover_path, page_count, error_message,
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

    // ---- settings ----

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, rusqlite::Error> {
        let conn = self.0.lock().unwrap();
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
            original_path: None,
            musicxml_path: None,
            cover_path: None,
            page_count: 0,
            error_message: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    #[test]
    fn test_migrate_and_crud() {
        let db = Db::open(Path::new("file::memtest_crud?cache=shared")).unwrap();
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
        let db = Db::open(Path::new("file::memtest_jobs?cache=shared")).unwrap();
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
