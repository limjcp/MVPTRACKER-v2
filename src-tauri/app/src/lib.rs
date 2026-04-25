mod active_window;

use std::path::PathBuf;
use tauri::Manager;

#[derive(Clone)]
struct DbPath(PathBuf);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      health,
      get_active_window,
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
