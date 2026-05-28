use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};
use std::path::Path;
use chrono::{DateTime, Duration, FixedOffset, Utc};

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
  seed_default_corporations(conn)?;
  Ok(())
}

fn stable_seed_corporation_id(name: &str) -> String {
  use std::collections::hash_map::DefaultHasher;
  let key = name.trim().to_lowercase();
  let mut h = DefaultHasher::new();
  key.hash(&mut h);
  format!("seed-corp-{:016x}", h.finish())
}

/// Inserts MVPTracker default corporation names when missing (case-insensitive name match).
pub fn seed_default_corporations(conn: &Connection) -> rusqlite::Result<()> {
  const NAMES: &[&str] = &[
    "MVP Condos",
    "WNCC 47",
    "WNCC 87",
    "WNCC 97",
    "AWST",
    "SSCC 168",
    "SSCC 148",
    "WNCC 127",
    "WNCC 134",
    "WNCC 149",
    "TALLPINES",
    "NCC 2",
    "PCC 7",
    "WSCC 449",
    "WNCC 63",
    "WCC 75",
    "WVLCC 678",
    "WSCC 179",
    "NSCC 42",
    "WNCC 112",
    "WSCC 6",
    "ECC 3",
    "WNCC 150",
    "WSCC 491",
    "WSCC 406",
    "HVLCC 21",
    "HSCC 17",
    "WNCC 147",
  ];
  let now = Utc::now().to_rfc3339();
  for &name in NAMES {
    let exists: bool = conn.query_row(
      "SELECT EXISTS(SELECT 1 FROM corporations WHERE lower(trim(name)) = lower(trim(?1)))",
      params![name],
      |r| r.get(0),
    )?;
    if exists {
      continue;
    }
    let id = stable_seed_corporation_id(name);
    upsert_corporation(
      conn,
      &CorporationRow {
        id,
        name: name.to_string(),
        created_at: now.clone(),
      },
    )?;
  }
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
  let _ = conn.execute("ALTER TABLE activities ADD COLUMN tracking_session_id TEXT", []);
  let _ = conn.execute(
    "UPDATE activities SET tracking_session_id = 'legacy' WHERE tracking_session_id IS NULL",
    [],
  );
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
  /// Groups automatic slices per app launch; used to ignore idle across downtime.
  pub tracking_session_id: Option<String>,
}

pub fn list_activities(conn: &Connection) -> rusqlite::Result<Vec<ActivityRow>> {
  let mut stmt = conn.prepare(
    r#"
    SELECT id, app_name, window_title, url, file_path, start_time, end_time, duration,
           project_id, category, productivity, activity_type, display_label,
           tracking_session_id
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
      tracking_session_id: r.get(13)?,
    })
  })?;
  rows.collect()
}

pub fn upsert_activity(conn: &Connection, a: &ActivityRow) -> rusqlite::Result<()> {
  conn.execute(
    r#"
    INSERT INTO activities (id, app_name, window_title, url, file_path, start_time, end_time, duration,
      project_id, category, productivity, activity_type, display_label, tracking_session_id)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
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
      display_label = excluded.display_label,
      tracking_session_id = excluded.tracking_session_id
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
      a.display_label,
      a.tracking_session_id
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

/// Stable `block_tags` row id for a task segment (`segmentTag:<uuid>` — matches frontend).
pub fn segment_block_tag_id(segment_id: &str) -> String {
  format!("segmentTag:{segment_id}")
}

pub fn get_block_tag_for_segment(
  conn: &Connection,
  segment_id: &str,
) -> rusqlite::Result<Option<BlockTagRow>> {
  let stable_id = segment_block_tag_id(segment_id);
  let mut stmt = conn.prepare(
    r#"
    SELECT id, bucket_date, bucket_start, bucket_end, corporation_id, task_type, task_type_detail, updated_at,
           segment_id
    FROM block_tags
    WHERE segment_id = ?1 OR id = ?2
    LIMIT 1
  "#,
  )?;
  let mut rows = stmt.query(params![segment_id, stable_id])?;
  let Some(row) = rows.next()? else {
    return Ok(None);
  };
  Ok(Some(BlockTagRow {
    id: row.get(0)?,
    bucket_date: row.get(1)?,
    bucket_start: row.get(2)?,
    bucket_end: row.get(3)?,
    corporation_id: row.get(4)?,
    task_type: row.get(5)?,
    task_type_detail: row.get(6)?,
    updated_at: row.get(7)?,
    segment_id: row.get::<_, Option<String>>(8)?,
  }))
}

fn block_tag_has_content(t: &BlockTagRow) -> bool {
  let corp_ok = t
    .corporation_id
    .as_ref()
    .map(|s| !s.trim().is_empty())
    .unwrap_or(false);
  let task_ok = t
    .task_type
    .as_ref()
    .map(|s| !s.trim().is_empty())
    .unwrap_or(false);
  let detail_ok = t
    .task_type_detail
    .as_ref()
    .map(|s| !s.trim().is_empty())
    .unwrap_or(false);
  corp_ok || task_ok || detail_ok
}

/// Writes corp/task onto `new_segment_id` from an existing tag row (same stable id scheme as frontend).
fn clone_block_tag_to_new_segment(
  conn: &Connection,
  src: &BlockTagRow,
  new_segment_id: &str,
  now_iso: &str,
) -> rusqlite::Result<()> {
  if !block_tag_has_content(src) {
    return Ok(());
  }
  let bucket_date = now_iso
    .get(..10)
    .map(str::to_string)
    .unwrap_or_else(|| "1970-01-01".to_string());
  let new_row = BlockTagRow {
    id: segment_block_tag_id(new_segment_id),
    bucket_date,
    bucket_start: now_iso.to_string(),
    bucket_end: now_iso.to_string(),
    corporation_id: src.corporation_id.clone(),
    task_type: src.task_type.clone(),
    task_type_detail: src.task_type_detail.clone(),
    updated_at: now_iso.to_string(),
    segment_id: Some(new_segment_id.to_string()),
  };
  set_block_tag(conn, &new_row)?;
  Ok(())
}

fn copy_closed_segment_tags_to_new_open_segment(
  conn: &Connection,
  closed_segment_id: &str,
  new_segment_id: &str,
  now_iso: &str,
) -> rusqlite::Result<()> {
  let Some(src) = get_block_tag_for_segment(conn, closed_segment_id)? else {
    return Ok(());
  };
  clone_block_tag_to_new_segment(conn, &src, new_segment_id, now_iso)
}

/// When the segment we closed had no tags, copy from the latest closed segment that does (user expectation: “last block”).
fn copy_tag_from_most_recent_closed_segment_with_content(
  conn: &Connection,
  new_segment_id: &str,
  now_iso: &str,
) -> rusqlite::Result<()> {
  if get_block_tag_for_segment(conn, new_segment_id)?
    .map(|t| block_tag_has_content(&t))
    .unwrap_or(false)
  {
    return Ok(());
  }

  let mut stmt = conn.prepare(
    r#"
    SELECT id FROM task_segments
    WHERE end_time IS NOT NULL AND id != ?1
    ORDER BY end_time DESC
    LIMIT 80
  "#,
  )?;
  let ids: Vec<String> = stmt
    .query_map(params![new_segment_id], |r| r.get::<_, String>(0))?
    .collect::<rusqlite::Result<_>>()?;

  for sid in ids {
    if let Some(src) = get_block_tag_for_segment(conn, &sid)? {
      if block_tag_has_content(&src) {
        return clone_block_tag_to_new_segment(conn, &src, new_segment_id, now_iso);
      }
    }
  }

  // Legacy tags saved only with bucket id (no segment_id): use most recently updated row with corp/task.
  let mut stmt = conn.prepare(
    r#"
    SELECT corporation_id, task_type, task_type_detail
    FROM block_tags
    ORDER BY updated_at DESC
    LIMIT 40
  "#,
  )?;
  let mut rows = stmt.query([])?;
  while let Some(r) = rows.next()? {
    let synthetic = BlockTagRow {
      id: String::new(),
      bucket_date: String::new(),
      bucket_start: String::new(),
      bucket_end: String::new(),
      corporation_id: r.get(0)?,
      task_type: r.get(1)?,
      task_type_detail: r.get(2)?,
      updated_at: String::new(),
      segment_id: None,
    };
    if block_tag_has_content(&synthetic) {
      return clone_block_tag_to_new_segment(conn, &synthetic, new_segment_id, now_iso);
    }
  }

  Ok(())
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
pub fn ensure_open_task_segment(
  conn: &Connection,
  new_id: &str,
  now_iso: &str,
  max_gap_seconds: u64,
) -> rusqlite::Result<TaskSegmentRow> {
  /// RFC3339 plus common SQLite / JS variants (space vs `T`) so stale-open splits still run.
  fn parse_iso_flexible(iso: &str) -> Option<DateTime<FixedOffset>> {
    let t = iso.trim();
    if t.is_empty() {
      return None;
    }
    DateTime::parse_from_rfc3339(t).ok().or_else(|| {
      let normalized = t.replacen(' ', "T", 1);
      DateTime::parse_from_rfc3339(normalized.trim()).ok()
    })
  }

  if let Some(open) = get_open_task_segment(conn)? {
    // Guard against “bridging” app downtime: if the app wasn’t active recently,
    // close the old open segment and start a new one at now.
    let now_dt = parse_iso_flexible(now_iso);
    let anchor_iso = open
      .last_prompt_at
      .as_deref()
      .unwrap_or(open.start_time.as_str());
    let anchor_dt = parse_iso_flexible(anchor_iso);
    if let (Some(now_dt), Some(anchor_dt)) = (now_dt, anchor_dt) {
      let gap = now_dt.signed_duration_since(anchor_dt);
      if gap > Duration::seconds(max_gap_seconds as i64) {
        // If the app was away longer than `max_gap_seconds`, do NOT bridge downtime.
        // Close the previous open segment at the last known active time (+ grace),
        // but never later than `now`.
        let grace_end = anchor_dt + Duration::seconds(max_gap_seconds as i64);
        let close_dt = if grace_end > now_dt { now_dt } else { grace_end };
        close_task_segment(conn, &open.id, &close_dt.to_rfc3339())?;

        let row = TaskSegmentRow {
          id: new_id.to_string(),
          start_time: now_iso.to_string(),
          end_time: None,
          title: None,
          created_at: now_iso.to_string(),
          last_prompt_at: None,
        };
        upsert_task_segment(conn, &row)?;
        copy_closed_segment_tags_to_new_open_segment(conn, &open.id, new_id, now_iso)?;
        copy_tag_from_most_recent_closed_segment_with_content(conn, new_id, now_iso)?;
        return Ok(row);
      }
    }

    return Ok(open);
  }

  conn.execute(
    r#"
    INSERT INTO task_segments (id, start_time, end_time, title, created_at, last_prompt_at)
    VALUES (?1, ?2, NULL, NULL, ?2, NULL)
  "#,
    params![new_id, now_iso],
  )?;
  let row = get_open_task_segment(conn)?.ok_or_else(|| {
    rusqlite::Error::ToSqlConversionFailure("task_segments insert did not leave an open row".into())
  })?;
  copy_tag_from_most_recent_closed_segment_with_content(conn, &row.id, now_iso)?;
  Ok(row)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ensure_open_task_segment_splits_stale_open_segment() {
    let conn = Connection::open_in_memory().unwrap();
    migrate(&conn).unwrap();

    let old = TaskSegmentRow {
      id: "old".to_string(),
      start_time: "2026-04-27T10:00:00+00:00".to_string(),
      end_time: None,
      title: None,
      created_at: "2026-04-27T10:00:00+00:00".to_string(),
      last_prompt_at: Some("2026-04-27T10:05:00+00:00".to_string()),
    };
    upsert_task_segment(&conn, &old).unwrap();

    let now = "2026-04-28T10:00:00+00:00";
    let created = ensure_open_task_segment(&conn, "new", now, 15 * 60).unwrap();
    assert_eq!(created.id, "new");
    assert_eq!(created.start_time, now);
    assert!(created.end_time.is_none());

    // Old should be closed and no longer returned as open.
    let open = get_open_task_segment(&conn).unwrap().unwrap();
    assert_eq!(open.id, "new");

    // Verify old row end_time was capped at lastPromptAt + maxGap (not at `now`).
    let mut stmt = conn
      .prepare("SELECT end_time FROM task_segments WHERE id = ?1")
      .unwrap();
    let end_time: Option<String> = stmt.query_row(params!["old"], |r| r.get(0)).unwrap();
    assert_eq!(
      end_time.as_deref(),
      Some("2026-04-27T10:20:00+00:00"),
      "expected old segment end_time to be capped at last_prompt_at + 15 minutes"
    );
  }

  #[test]
  fn ensure_open_task_segment_keeps_recent_open_segment() {
    let conn = Connection::open_in_memory().unwrap();
    migrate(&conn).unwrap();

    let open = TaskSegmentRow {
      id: "old".to_string(),
      start_time: "2026-04-28T10:00:00+00:00".to_string(),
      end_time: None,
      title: None,
      created_at: "2026-04-28T10:00:00+00:00".to_string(),
      last_prompt_at: Some("2026-04-28T10:04:30+00:00".to_string()),
    };
    upsert_task_segment(&conn, &open).unwrap();

    let now = "2026-04-28T10:14:30+00:00";
    let kept = ensure_open_task_segment(&conn, "new", now, 15 * 60).unwrap();
    assert_eq!(kept.id, "old");
    assert!(kept.end_time.is_none());
  }

  #[test]
  fn ensure_open_task_segment_copies_segment_tag_when_splitting() {
    let conn = Connection::open_in_memory().unwrap();
    migrate(&conn).unwrap();

    upsert_corporation(
      &conn,
      &CorporationRow {
        id: "corp-split-test".to_string(),
        name: "Split Corp".to_string(),
        created_at: "2026-04-27T10:00:00+00:00".to_string(),
      },
    )
    .unwrap();

    let old = TaskSegmentRow {
      id: "old-split".to_string(),
      start_time: "2026-04-27T10:00:00+00:00".to_string(),
      end_time: None,
      title: None,
      created_at: "2026-04-27T10:00:00+00:00".to_string(),
      last_prompt_at: Some("2026-04-27T10:05:00+00:00".to_string()),
    };
    upsert_task_segment(&conn, &old).unwrap();

    set_block_tag(
      &conn,
      &BlockTagRow {
        id: segment_block_tag_id("old-split"),
        bucket_date: "2026-04-27".to_string(),
        bucket_start: "2026-04-27T10:00:00+00:00".to_string(),
        bucket_end: "2026-04-27T10:00:00+00:00".to_string(),
        corporation_id: Some("corp-split-test".to_string()),
        task_type: Some("meeting".to_string()),
        task_type_detail: Some("standup".to_string()),
        updated_at: "2026-04-27T10:00:00+00:00".to_string(),
        segment_id: Some("old-split".to_string()),
      },
    )
    .unwrap();

    let now = "2026-04-28T10:00:00+00:00";
    ensure_open_task_segment(&conn, "new-split", now, 15 * 60).unwrap();

    let new_tag = get_block_tag_for_segment(&conn, "new-split")
      .unwrap()
      .expect("tag should be copied to new open segment");
    assert_eq!(new_tag.corporation_id.as_deref(), Some("corp-split-test"));
    assert_eq!(new_tag.task_type.as_deref(), Some("meeting"));
    assert_eq!(new_tag.task_type_detail.as_deref(), Some("standup"));
    assert_eq!(new_tag.segment_id.as_deref(), Some("new-split"));
    assert_eq!(new_tag.id, segment_block_tag_id("new-split"));
  }

  #[test]
  fn ensure_open_fallback_when_stale_open_has_no_tag() {
    let conn = Connection::open_in_memory().unwrap();
    migrate(&conn).unwrap();

    upsert_corporation(
      &conn,
      &CorporationRow {
        id: "corp-fb".to_string(),
        name: "FB Corp".to_string(),
        created_at: "2026-04-26T10:00:00+00:00".to_string(),
      },
    )
    .unwrap();

    let older_closed = TaskSegmentRow {
      id: "older".to_string(),
      start_time: "2026-04-26T09:00:00+00:00".to_string(),
      end_time: Some("2026-04-26T17:00:00+00:00".to_string()),
      title: None,
      created_at: "2026-04-26T09:00:00+00:00".to_string(),
      last_prompt_at: None,
    };
    upsert_task_segment(&conn, &older_closed).unwrap();
    set_block_tag(
      &conn,
      &BlockTagRow {
        id: segment_block_tag_id("older"),
        bucket_date: "2026-04-26".to_string(),
        bucket_start: "2026-04-26T09:00:00+00:00".to_string(),
        bucket_end: "2026-04-26T17:00:00+00:00".to_string(),
        corporation_id: Some("corp-fb".to_string()),
        task_type: Some("email".to_string()),
        task_type_detail: None,
        updated_at: "2026-04-26T17:00:00+00:00".to_string(),
        segment_id: Some("older".to_string()),
      },
    )
    .unwrap();

    let stale_open = TaskSegmentRow {
      id: "stale-open".to_string(),
      start_time: "2026-04-27T10:00:00+00:00".to_string(),
      end_time: None,
      title: None,
      created_at: "2026-04-27T10:00:00+00:00".to_string(),
      last_prompt_at: Some("2026-04-27T10:05:00+00:00".to_string()),
    };
    upsert_task_segment(&conn, &stale_open).unwrap();
    // Deliberately no block_tags row for stale-open

    let now = "2026-04-28T10:00:00+00:00";
    ensure_open_task_segment(&conn, "after-reopen", now, 15 * 60).unwrap();

    let tag = get_block_tag_for_segment(&conn, "after-reopen")
      .unwrap()
      .expect("should inherit from older closed segment");
    assert_eq!(tag.corporation_id.as_deref(), Some("corp-fb"));
    assert_eq!(tag.task_type.as_deref(), Some("email"));
  }
}

