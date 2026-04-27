mod active_window;

use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Clone)]
struct DbPath(PathBuf);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      health,
      get_active_window,
      save_report_file,
      db_init,
      db_list_projects,
      db_upsert_project,
      db_delete_project,
      db_list_manual_entries,
      db_add_manual_entry,
      db_update_manual_entry,
      db_delete_manual_entry,
      db_list_activities,
      db_upsert_activity,
      db_delete_activity,
      db_get_settings,
      db_set_settings,
      db_list_corporations,
      db_upsert_corporation,
      db_delete_corporation,
      db_list_block_tags,
      db_set_block_tag,
      db_clear_block_tag,
      db_list_task_segments,
      db_ensure_open_task_segment,
      db_task_checkin_yes,
      db_task_checkin_no,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let shared = mvptracker_core::paths::shared_database_path();
      if let Some(parent) = shared.parent() {
        std::fs::create_dir_all(parent)?;
      }
      let legacy = mvptracker_core::paths::legacy_staff_database_path(&app.path().app_data_dir()?);
      if !shared.exists() && legacy.exists() {
        let _ = std::fs::copy(&legacy, &shared);
      }
      app.manage(DbPath(shared));

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[tauri::command]
fn health() -> mvptracker_core::Health {
  mvptracker_core::Health { ok: true }
}

#[tauri::command]
fn get_active_window() -> active_window::ActiveWindowInfo {
  active_window::snapshot()
}

/// Opens a native save dialog and writes `contents` to the chosen path.
/// Runs the blocking dialog on a worker thread so the WebView does not hang.
#[tauri::command]
async fn save_report_file(app: tauri::AppHandle, default_name: String, contents: Vec<u8>) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || {
    let path = app.dialog().file().set_file_name(default_name).blocking_save_file();
    let Some(file_path) = path else {
      return Err("Save cancelled.".to_string());
    };
    let pb = file_path.into_path().map_err(|e| format!("{e:?}"))?;
    std::fs::write(&pb, contents).map_err(|e| e.to_string())
  })
  .await
  .map_err(|e| e.to_string())?
}

#[tauri::command]
fn db_init(db: tauri::State<'_, DbPath>) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn db_list_projects(db: tauri::State<'_, DbPath>) -> Result<Vec<mvptracker_core::sqlite::ProjectRow>, String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_upsert_project(db: tauri::State<'_, DbPath>, project: mvptracker_core::sqlite::ProjectRow) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::upsert_project(&conn, &project).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_project(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::delete_project(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_manual_entries(db: tauri::State<'_, DbPath>) -> Result<Vec<mvptracker_core::sqlite::ManualEntryRow>, String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::list_manual_entries(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_add_manual_entry(db: tauri::State<'_, DbPath>, entry: mvptracker_core::sqlite::ManualEntryRow) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::add_manual_entry(&conn, &entry).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_get_settings(db: tauri::State<'_, DbPath>) -> Result<Option<String>, String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::get_settings_json(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_set_settings(db: tauri::State<'_, DbPath>, json: String) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::set_settings_json(&conn, &json).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_update_manual_entry(
  db: tauri::State<'_, DbPath>,
  entry: mvptracker_core::sqlite::ManualEntryRow,
) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::update_manual_entry(&conn, &entry).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_manual_entry(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::delete_manual_entry(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_activities(db: tauri::State<'_, DbPath>) -> Result<Vec<mvptracker_core::sqlite::ActivityRow>, String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::list_activities(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_upsert_activity(
  db: tauri::State<'_, DbPath>,
  activity: mvptracker_core::sqlite::ActivityRow,
) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::upsert_activity(&conn, &activity).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_activity(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::delete_activity(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_corporations(
  db: tauri::State<'_, DbPath>,
) -> Result<Vec<mvptracker_core::sqlite::CorporationRow>, String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::list_corporations(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_upsert_corporation(
  db: tauri::State<'_, DbPath>,
  corporation: mvptracker_core::sqlite::CorporationRow,
) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::upsert_corporation(&conn, &corporation).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_corporation(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::delete_corporation(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_block_tags(
  db: tauri::State<'_, DbPath>,
) -> Result<Vec<mvptracker_core::sqlite::BlockTagRow>, String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::list_block_tags(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_set_block_tag(
  db: tauri::State<'_, DbPath>,
  tag: mvptracker_core::sqlite::BlockTagRow,
) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::set_block_tag(&conn, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_clear_block_tag(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::clear_block_tag(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_task_segments(
  db: tauri::State<'_, DbPath>,
) -> Result<Vec<mvptracker_core::sqlite::TaskSegmentRow>, String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::list_task_segments(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_ensure_open_task_segment(
  db: tauri::State<'_, DbPath>,
  new_id: String,
  now_iso: String,
) -> Result<mvptracker_core::sqlite::TaskSegmentRow, String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::ensure_open_task_segment(&conn, &new_id, &now_iso).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_task_checkin_yes(db: tauri::State<'_, DbPath>, now_iso: String) -> Result<(), String> {
  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  let open = mvptracker_core::sqlite::get_open_task_segment(&conn).map_err(|e| e.to_string())?;
  if let Some(s) = open {
    mvptracker_core::sqlite::update_task_segment_prompt(&conn, &s.id, &now_iso).map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn db_task_checkin_no(
  db: tauri::State<'_, DbPath>,
  new_segment_id: String,
  new_title: Option<String>,
  now_iso: String,
  tag_corporation_id: Option<String>,
  tag_task_type: Option<String>,
  tag_task_type_detail: Option<String>,
) -> Result<(), String> {
  fn non_empty(s: Option<String>) -> Option<String> {
    s.and_then(|v| {
      let t = v.trim();
      if t.is_empty() {
        None
      } else {
        Some(t.to_string())
      }
    })
  }

  let conn = mvptracker_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptracker_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  let open = mvptracker_core::sqlite::get_open_task_segment(&conn).map_err(|e| e.to_string())?;
  if let Some(s) = open {
    mvptracker_core::sqlite::close_task_segment(&conn, &s.id, &now_iso).map_err(|e| e.to_string())?;
  }
  let row = mvptracker_core::sqlite::TaskSegmentRow {
    id: new_segment_id.clone(),
    start_time: now_iso.clone(),
    end_time: None,
    title: new_title,
    created_at: now_iso.clone(),
    last_prompt_at: None,
  };
  mvptracker_core::sqlite::upsert_task_segment(&conn, &row).map_err(|e| e.to_string())?;

  let corp = non_empty(tag_corporation_id);
  let tt = non_empty(tag_task_type);
  let ttd = non_empty(tag_task_type_detail);
  if corp.is_some() || tt.is_some() || ttd.is_some() {
    let bucket_date = now_iso
      .get(..10)
      .map(str::to_string)
      .unwrap_or_else(|| "1970-01-01".to_string());
    let tag = mvptracker_core::sqlite::BlockTagRow {
      id: format!("segmentTag:{}", new_segment_id),
      bucket_date,
      bucket_start: now_iso.clone(),
      bucket_end: now_iso.clone(),
      corporation_id: corp,
      task_type: tt,
      task_type_detail: ttd,
      updated_at: now_iso.clone(),
      segment_id: Some(new_segment_id),
    };
    mvptracker_core::sqlite::set_block_tag(&conn, &tag).map_err(|e| e.to_string())?;
  }

  Ok(())
}
