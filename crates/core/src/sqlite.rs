use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub fn open_db(path: &Path) -> rusqlite::Result<Connection> {
  Connection::open_with_flags(
    path,
    OpenFlags::SQLITE_OPEN_READ_WRITE
      | OpenFlags::SQLITE_OPEN_CREATE
      | OpenFlags::SQLITE_OPEN_NO_MUTEX,
  )
}

pub fn migrate(conn: &Connection) -> rusqlite::Result<()> {
  conn.execute_batch(
    r#"
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      icon TEXT NOT NULL,
      productivity_score INTEGER NOT NULL,
      hourly_rate REAL,
      client TEXT,
      description TEXT,
      total_time INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS manual_entries (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      project_id TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      notes TEXT,
      entry_type TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY NOT NULL,
      app_name TEXT NOT NULL,
      window_title TEXT NOT NULL,
      url TEXT,
      file_path TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      project_id TEXT,
      category TEXT NOT NULL,
      productivity INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_activities_start ON activities(start_time);

    CREATE TABLE IF NOT EXISTS corporations (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS block_tags (
      id TEXT PRIMARY KEY NOT NULL,
      bucket_date TEXT NOT NULL,
      bucket_start TEXT NOT NULL,
      bucket_end TEXT NOT NULL,
      corporation_id TEXT,
      task_type TEXT,
      task_type_detail TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(corporation_id) REFERENCES corporations(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_block_tags_date ON block_tags(bucket_date);

    CREATE TABLE IF NOT EXISTS task_segments (
      id TEXT PRIMARY KEY NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      title TEXT,
      created_at TEXT NOT NULL,
      last_prompt_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_task_segments_start ON task_segments(start_time);
  "#,
  )?;
  add_schema_columns(conn)?;
  Ok(())
}

/// Idempotent column adds for existing DBs (CREATE TABLE IF NOT EXISTS skips new columns).
fn add_schema_columns(conn: &Connection) -> rusqlite::Result<()> {
  let _ = conn.execute(
    "ALTER TABLE projects ADD COLUMN scope TEXT NOT NULL DEFAULT 'private'",
    [],
  );
  let _ = conn.execute("ALTER TABLE projects ADD COLUMN team_label TEXT", []);
  let _ = conn.execute("ALTER TABLE activities ADD COLUMN display_label TEXT", []);
  let _ = conn.execute("ALTER TABLE block_tags ADD COLUMN segment_id TEXT", []);
  Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRow {
  pub id: String,
  pub name: String,
  pub color: String,
  pub icon: String,
  pub productivity_score: i64,
  pub hourly_rate: Option<f64>,
  pub client: Option<String>,
  pub description: Option<String>,
  pub total_time: i64,
  pub created_at: String,
  /// `private` | `team`
  pub scope: String,
  pub team_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManualEntryRow {
  pub id: String,
  pub title: String,
  pub project_id: Option<String>,
  pub start_time: String,
  pub end_time: String,
  pub duration: i64,
  pub notes: Option<String>,
  pub entry_type: String,
}

pub fn list_projects(conn: &Connection) -> rusqlite::Result<Vec<ProjectRow>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, name, color, icon, productivity_score, hourly_rate, client, description, total_time, created_at,
           COALESCE(scope, 'private'), team_label
    FROM projects
    ORDER BY created_at DESC
  "#,
  )?;
  let rows = stmt.query_map([], |r| {
    Ok(ProjectRow {
      id: r.get(0)?,
      name: r.get(1)?,
      color: r.get(2)?,
      icon: r.get(3)?,
      productivity_score: r.get(4)?,
      hourly_rate: r.get(5)?,
      client: r.get(6)?,
      description: r.get(7)?,
      total_time: r.get(8)?,
      created_at: r.get(9)?,
      scope: r.get(10)?,
      team_label: r.get(11)?,
    })
  })?;
  rows.collect()
}

pub fn upsert_project(conn: &Connection, p: &ProjectRow) -> rusqlite::Result<()> {
  conn.execute(
    r#"
    INSERT INTO projects (id, name, color, icon, productivity_score, hourly_rate, client, description, total_time, created_at, scope, team_label)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      color = excluded.color,
      icon = excluded.icon,
      productivity_score = excluded.productivity_score,
      hourly_rate = excluded.hourly_rate,
      client = excluded.client,
      description = excluded.description,
      total_time = excluded.total_time,
      scope = excluded.scope,
      team_label = excluded.team_label
  "#,
    params![
      p.id,
      p.name,
      p.color,
      p.icon,
      p.productivity_score,
      p.hourly_rate,
      p.client,
      p.description,
      p.total_time,
      p.created_at,
      p.scope,
      p.team_label
    ],
  )?;
  Ok(())
}

pub fn delete_project(conn: &Connection, id: &str) -> rusqlite::Result<()> {
  conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
  Ok(())
}

pub fn list_manual_entries(conn: &Connection) -> rusqlite::Result<Vec<ManualEntryRow>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, title, project_id, start_time, end_time, duration, notes, entry_type
    FROM manual_entries
    ORDER BY start_time DESC
  "#,
  )?;
  let rows = stmt.query_map([], |r| {
    Ok(ManualEntryRow {
      id: r.get(0)?,
      title: r.get(1)?,
      project_id: r.get(2)?,
      start_time: r.get(3)?,
      end_time: r.get(4)?,
      duration: r.get(5)?,
      notes: r.get(6)?,
      entry_type: r.get(7)?,
    })
  })?;
  rows.collect()
}

pub fn add_manual_entry(conn: &Connection, e: &ManualEntryRow) -> rusqlite::Result<()> {
  conn.execute(
    r#"
    INSERT INTO manual_entries (id, title, project_id, start_time, end_time, duration, notes, entry_type)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
  "#,
    params![
      e.id,
      e.title,
      e.project_id,
      e.start_time,
      e.end_time,
      e.duration,
      e.notes,
      e.entry_type
    ],
  )?;
  Ok(())
}

pub fn get_settings_json(conn: &Connection) -> rusqlite::Result<Option<String>> {
  let mut stmt = conn.prepare("SELECT json FROM settings WHERE id = 1")?;
  let mut rows = stmt.query([])?;
  if let Some(r) = rows.next()? {
    Ok(Some(r.get(0)?))
  } else {
    Ok(None)
  }
}

pub fn set_settings_json(conn: &Connection, json: &str) -> rusqlite::Result<()> {
  conn.execute(
    r#"
    INSERT INTO settings (id, json) VALUES (1, ?1)
    ON CONFLICT(id) DO UPDATE SET json = excluded.json
  "#,
    params![json],
  )?;
  Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityRow {
  pub id: String,
  pub app_name: String,
  pub window_title: String,
  pub url: Option<String>,
  pub file_path: Option<String>,
  pub start_time: String,
  pub end_time: String,
  pub duration: i64,
  pub project_id: Option<String>,
  pub category: String,
  pub productivity: i64,
  pub activity_type: String,
  pub display_label: Option<String>,
}

pub fn list_activities(conn: &Connection) -> rusqlite::Result<Vec<ActivityRow>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, app_name, window_title, url, file_path, start_time, end_time, duration,
           project_id, category, productivity, activity_type, display_label
    FROM activities
    ORDER BY start_time DESC
  "#,
  )?;
  let rows = stmt.query_map([], |r| {
    Ok(ActivityRow {
      id: r.get(0)?,
      app_name: r.get(1)?,
      window_title: r.get(2)?,
      url: r.get(3)?,
      file_path: r.get(4)?,
      start_time: r.get(5)?,
      end_time: r.get(6)?,
      duration: r.get(7)?,
      project_id: r.get(8)?,
      category: r.get(9)?,
      productivity: r.get(10)?,
      activity_type: r.get(11)?,
      display_label: r.get(12)?,
    })
  })?;
  rows.collect()
}

pub fn upsert_activity(conn: &Connection, a: &ActivityRow) -> rusqlite::Result<()> {
  conn.execute(
    r#"
    INSERT INTO activities (id, app_name, window_title, url, file_path, start_time, end_time, duration,
      project_id, category, productivity, activity_type, display_label)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    ON CONFLICT(id) DO UPDATE SET
      app_name = excluded.app_name,
      window_title = excluded.window_title,
      url = excluded.url,
      file_path = excluded.file_path,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      duration = excluded.duration,
      project_id = excluded.project_id,
      category = excluded.category,
      productivity = excluded.productivity,
      activity_type = excluded.activity_type,
      display_label = excluded.display_label
  "#,
    params![
      a.id,
      a.app_name,
      a.window_title,
      a.url,
      a.file_path,
      a.start_time,
      a.end_time,
      a.duration,
      a.project_id,
      a.category,
      a.productivity,
      a.activity_type,
      a.display_label
    ],
  )?;
  Ok(())
}

pub fn delete_activity(conn: &Connection, id: &str) -> rusqlite::Result<()> {
  conn.execute("DELETE FROM activities WHERE id = ?1", params![id])?;
  Ok(())
}

pub fn update_manual_entry(conn: &Connection, e: &ManualEntryRow) -> rusqlite::Result<()> {
  conn.execute(
    r#"
    UPDATE manual_entries SET
      title = ?2, project_id = ?3, start_time = ?4, end_time = ?5, duration = ?6, notes = ?7, entry_type = ?8
    WHERE id = ?1
  "#,
    params![
      e.id,
      e.title,
      e.project_id,
      e.start_time,
      e.end_time,
      e.duration,
      e.notes,
      e.entry_type
    ],
  )?;
  Ok(())
}

pub fn delete_manual_entry(conn: &Connection, id: &str) -> rusqlite::Result<()> {
  conn.execute("DELETE FROM manual_entries WHERE id = ?1", params![id])?;
  Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CorporationRow {
  pub id: String,
  pub name: String,
  /// Accepts `created_at` or `createdAt` from the webview payload.
  #[serde(alias = "createdAt")]
  pub created_at: String,
}

pub fn list_corporations(conn: &Connection) -> rusqlite::Result<Vec<CorporationRow>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, name, created_at
    FROM corporations
    ORDER BY name COLLATE NOCASE ASC
  "#,
  )?;
  let rows = stmt.query_map([], |r| {
    Ok(CorporationRow {
      id: r.get(0)?,
      name: r.get(1)?,
      created_at: r.get(2)?,
    })
  })?;
  rows.collect()
}

pub fn upsert_corporation(conn: &Connection, c: &CorporationRow) -> rusqlite::Result<()> {
  conn.execute(
    r#"
    INSERT INTO corporations (id, name, created_at)
    VALUES (?1, ?2, ?3)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name
  "#,
    params![c.id, c.name, c.created_at],
  )?;
  Ok(())
}

pub fn delete_corporation(conn: &Connection, id: &str) -> rusqlite::Result<()> {
  conn.execute("DELETE FROM corporations WHERE id = ?1", params![id])?;
  Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockTagRow {
  pub id: String,
  pub bucket_date: String,
  pub bucket_start: String,
  pub bucket_end: String,
  #[serde(default, alias = "corporationId")]
  pub corporation_id: Option<String>,
  #[serde(default, alias = "taskType")]
  pub task_type: Option<String>,
  #[serde(default, alias = "taskTypeDetail")]
  pub task_type_detail: Option<String>,
  pub updated_at: String,
  #[serde(default, alias = "segmentId")]
  pub segment_id: Option<String>,
}

pub fn list_block_tags(conn: &Connection) -> rusqlite::Result<Vec<BlockTagRow>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, bucket_date, bucket_start, bucket_end, corporation_id, task_type, task_type_detail, updated_at,
           segment_id
    FROM block_tags
    ORDER BY bucket_start ASC
  "#,
  )?;
  let rows = stmt.query_map([], |r| {
    Ok(BlockTagRow {
      id: r.get(0)?,
      bucket_date: r.get(1)?,
      bucket_start: r.get(2)?,
      bucket_end: r.get(3)?,
      corporation_id: r.get(4)?,
      task_type: r.get(5)?,
      task_type_detail: r.get(6)?,
      updated_at: r.get(7)?,
      segment_id: r.get::<_, Option<String>>(8)?,
    })
  })?;
  rows.collect()
}

pub fn set_block_tag(conn: &Connection, t: &BlockTagRow) -> rusqlite::Result<()> {
  conn.execute(
    r#"
    INSERT INTO block_tags (id, bucket_date, bucket_start, bucket_end, corporation_id, task_type, task_type_detail, updated_at, segment_id)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT(id) DO UPDATE SET
      bucket_date = excluded.bucket_date,
      bucket_start = excluded.bucket_start,
      bucket_end = excluded.bucket_end,
      corporation_id = excluded.corporation_id,
      task_type = excluded.task_type,
      task_type_detail = excluded.task_type_detail,
      updated_at = excluded.updated_at,
      segment_id = excluded.segment_id
  "#,
    params![
      t.id,
      t.bucket_date,
      t.bucket_start,
      t.bucket_end,
      t.corporation_id,
      t.task_type,
      t.task_type_detail,
      t.updated_at,
      t.segment_id
    ],
  )?;
  Ok(())
}

pub fn clear_block_tag(conn: &Connection, id: &str) -> rusqlite::Result<()> {
  conn.execute("DELETE FROM block_tags WHERE id = ?1", params![id])?;
  Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskSegmentRow {
  pub id: String,
  pub start_time: String,
  pub end_time: Option<String>,
  pub title: Option<String>,
  pub created_at: String,
  pub last_prompt_at: Option<String>,
}

pub fn list_task_segments(conn: &Connection) -> rusqlite::Result<Vec<TaskSegmentRow>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, start_time, end_time, title, created_at, last_prompt_at
    FROM task_segments
    ORDER BY start_time ASC
  "#,
  )?;
  let rows = stmt.query_map([], |r| {
    Ok(TaskSegmentRow {
      id: r.get(0)?,
      start_time: r.get(1)?,
      end_time: r.get(2)?,
      title: r.get(3)?,
      created_at: r.get(4)?,
      last_prompt_at: r.get(5)?,
    })
  })?;
  rows.collect()
}

pub fn upsert_task_segment(conn: &Connection, s: &TaskSegmentRow) -> rusqlite::Result<()> {
  conn.execute(
    r#"
    INSERT INTO task_segments (id, start_time, end_time, title, created_at, last_prompt_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(id) DO UPDATE SET
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      title = excluded.title,
      last_prompt_at = excluded.last_prompt_at
  "#,
    params![
      s.id,
      s.start_time,
      s.end_time,
      s.title,
      s.created_at,
      s.last_prompt_at
    ],
  )?;
  Ok(())
}

pub fn get_open_task_segment(conn: &Connection) -> rusqlite::Result<Option<TaskSegmentRow>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, start_time, end_time, title, created_at, last_prompt_at
    FROM task_segments
    WHERE end_time IS NULL
    ORDER BY start_time DESC
    LIMIT 1
  "#,
  )?;
  let mut rows = stmt.query([])?;
  if let Some(r) = rows.next()? {
    Ok(Some(TaskSegmentRow {
      id: r.get(0)?,
      start_time: r.get(1)?,
      end_time: r.get(2)?,
      title: r.get(3)?,
      created_at: r.get(4)?,
      last_prompt_at: r.get(5)?,
    }))
  } else {
    Ok(None)
  }
}

/// Sets end_time on the open segment (must be exactly one open row for predictable behavior).
pub fn close_task_segment(conn: &Connection, id: &str, end_time: &str) -> rusqlite::Result<()> {
  conn.execute(
    "UPDATE task_segments SET end_time = ?2 WHERE id = ?1 AND end_time IS NULL",
    params![id, end_time],
  )?;
  Ok(())
}

pub fn update_task_segment_prompt(conn: &Connection, id: &str, last_prompt_at: &str) -> rusqlite::Result<()> {
  conn.execute(
    "UPDATE task_segments SET last_prompt_at = ?2 WHERE id = ?1 AND end_time IS NULL",
    params![id, last_prompt_at],
  )?;
  Ok(())
}

/// Creates an open segment when none exists; returns the current open segment.
pub fn ensure_open_task_segment(conn: &Connection, new_id: &str, now_iso: &str) -> rusqlite::Result<TaskSegmentRow> {
  if let Some(s) = get_open_task_segment(conn)? {
    return Ok(s);
  }
  conn.execute(
    r#"
    INSERT INTO task_segments (id, start_time, end_time, title, created_at, last_prompt_at)
    VALUES (?1, ?2, NULL, NULL, ?2, NULL)
  "#,
    params![new_id, now_iso],
  )?;
  get_open_task_segment(conn)?.ok_or_else(|| {
    rusqlite::Error::ToSqlConversionFailure("task_segments insert did not leave an open row".into())
  })
}

