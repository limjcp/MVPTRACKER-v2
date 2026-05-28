mod active_window;

use std::path::PathBuf;
use chrono::Utc;
use serde::Serialize;
use tauri::Manager;
use tauri::WindowEvent;
use tauri_plugin_dialog::DialogExt;

#[derive(Clone)]
struct DbPath(PathBuf);

const TRAY_MENU_TOGGLE: &str = "toggle_main";
const TRAY_MENU_QUIT: &str = "quit";
const TRAY_ICON: tauri::image::Image<'_> = tauri::include_image!("icons/32x32.png");

fn close_open_task_segment_best_effort(app: &tauri::AppHandle) {
  let now_iso = Utc::now().to_rfc3339();
  let db = match app.try_state::<DbPath>() {
    Some(s) => s,
    None => return,
  };
  let conn = match mvptime_core::sqlite::open_db(&db.0) {
    Ok(c) => c,
    Err(_) => return,
  };
  if mvptime_core::sqlite::migrate(&conn).is_err() {
    return;
  }
  let open = match mvptime_core::sqlite::get_open_task_segment(&conn) {
    Ok(s) => s,
    Err(_) => return,
  };
  if let Some(s) = open {
    let _ = mvptime_core::sqlite::close_task_segment(&conn, &s.id, &now_iso);
  }
}

fn hide_main_window(window: &tauri::WebviewWindow) {
  let _ = window.hide();
  // On macOS, hiding + skip-taskbar can make re-activating the app unreliable.
  // Prefer to only hide and let Dock activation bring the window back.
  #[cfg(not(target_os = "macos"))]
  let _ = window.set_skip_taskbar(true);
}

fn show_main_window(window: &tauri::WebviewWindow) {
  let _ = window.set_skip_taskbar(false);
  let _ = window.show();
  let _ = window.set_focus();
}

fn toggle_main_window(app: &tauri::AppHandle) {
  let Some(window) = app.get_webview_window("main") else {
    return;
  };
  match window.is_visible() {
    Ok(true) => hide_main_window(&window),
    Ok(false) => show_main_window(&window),
    Err(_) => show_main_window(&window),
  }
}

fn build_tray(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
  use tauri::menu::{Menu, MenuItem};
  use tauri::tray::TrayIconBuilder;

  let toggle = MenuItem::with_id(app, TRAY_MENU_TOGGLE, "Show/Hide", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, TRAY_MENU_QUIT, "Quit", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&toggle, &quit])?;

  TrayIconBuilder::new()
    .icon(TRAY_ICON.clone())
    .menu(&menu)
    .on_menu_event(|app, event| match event.id().as_ref() {
      TRAY_MENU_TOGGLE => toggle_main_window(app),
      TRAY_MENU_QUIT => {
        close_open_task_segment_best_effort(app);
        app.exit(0)
      }
      _ => {}
    })
    .build(app)?;

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
      }
      let handle = app.clone();
      std::thread::spawn(move || {
        let _ = handle
          .dialog()
          .message("MVPTime is already running.")
          .title("MVPTime")
          .blocking_show();
      });
    }));
  }

  builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .on_window_event(|window, event| {
      if window.label() != "main" {
        return;
      }
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        if let Some(w) = window.app_handle().get_webview_window("main") {
          hide_main_window(&w);
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      health,
      get_active_window,
      macos_ensure_accessibility,
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
      db_close_open_task_segment,
      db_resume_task_segment_after_pause,
      db_task_checkin_yes,
      db_task_checkin_no,
    ])
    .setup(|app| {
      build_tray(app.handle())?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let shared = mvptime_core::paths::shared_database_path();
      if let Some(parent) = shared.parent() {
        std::fs::create_dir_all(parent)?;
      }
      let legacy = mvptime_core::paths::legacy_staff_database_path(&app.path().app_data_dir()?);
      if !shared.exists() && legacy.exists() {
        let _ = std::fs::copy(&legacy, &shared);
      }
      app.manage(DbPath(shared));

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, _event| {
      // macOS: clicking the Dock icon / re-activating the app should restore the hidden window.
      #[cfg(target_os = "macos")]
      {
        if let tauri::RunEvent::Resumed = _event {
          if let Some(w) = app.get_webview_window("main") {
            show_main_window(&w);
          }
        }
      }

      let _ = app; // keep closure signature uniform for cfg blocks
    });
}

#[tauri::command]
fn health() -> mvptime_core::Health {
  mvptime_core::Health { ok: true }
}

#[tauri::command]
fn get_active_window() -> active_window::ActiveWindowInfo {
  active_window::snapshot()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AccessibilityTrust {
  trusted: bool,
}

/// On macOS, prompts for Accessibility permission (needed for window titles).
/// On other OS, this is a no-op that returns trusted=true.
#[tauri::command]
fn macos_ensure_accessibility(prompt: bool) -> AccessibilityTrust {
  AccessibilityTrust {
    trusted: active_window::ensure_accessibility(prompt),
  }
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
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  Ok(())
}

#[tauri::command]
fn db_list_projects(db: tauri::State<'_, DbPath>) -> Result<Vec<mvptime_core::sqlite::ProjectRow>, String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_upsert_project(db: tauri::State<'_, DbPath>, project: mvptime_core::sqlite::ProjectRow) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::upsert_project(&conn, &project).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_project(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::delete_project(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_manual_entries(db: tauri::State<'_, DbPath>) -> Result<Vec<mvptime_core::sqlite::ManualEntryRow>, String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::list_manual_entries(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_add_manual_entry(db: tauri::State<'_, DbPath>, entry: mvptime_core::sqlite::ManualEntryRow) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::add_manual_entry(&conn, &entry).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_get_settings(db: tauri::State<'_, DbPath>) -> Result<Option<String>, String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::get_settings_json(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_set_settings(db: tauri::State<'_, DbPath>, json: String) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::set_settings_json(&conn, &json).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_update_manual_entry(
  db: tauri::State<'_, DbPath>,
  entry: mvptime_core::sqlite::ManualEntryRow,
) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::update_manual_entry(&conn, &entry).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_manual_entry(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::delete_manual_entry(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_activities(db: tauri::State<'_, DbPath>) -> Result<Vec<mvptime_core::sqlite::ActivityRow>, String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::list_activities(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_upsert_activity(
  db: tauri::State<'_, DbPath>,
  activity: mvptime_core::sqlite::ActivityRow,
) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::upsert_activity(&conn, &activity).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_activity(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::delete_activity(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_corporations(
  db: tauri::State<'_, DbPath>,
) -> Result<Vec<mvptime_core::sqlite::CorporationRow>, String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::list_corporations(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_upsert_corporation(
  db: tauri::State<'_, DbPath>,
  corporation: mvptime_core::sqlite::CorporationRow,
) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::upsert_corporation(&conn, &corporation).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_corporation(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::delete_corporation(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_block_tags(
  db: tauri::State<'_, DbPath>,
) -> Result<Vec<mvptime_core::sqlite::BlockTagRow>, String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::list_block_tags(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_set_block_tag(
  db: tauri::State<'_, DbPath>,
  tag: mvptime_core::sqlite::BlockTagRow,
) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::set_block_tag(&conn, &tag).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_clear_block_tag(db: tauri::State<'_, DbPath>, id: String) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::clear_block_tag(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_list_task_segments(
  db: tauri::State<'_, DbPath>,
) -> Result<Vec<mvptime_core::sqlite::TaskSegmentRow>, String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::list_task_segments(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_ensure_open_task_segment(
  db: tauri::State<'_, DbPath>,
  new_id: String,
  now_iso: String,
  max_gap_seconds: Option<u64>,
) -> Result<mvptime_core::sqlite::TaskSegmentRow, String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  let max_gap_seconds = max_gap_seconds.unwrap_or(15 * 60);
  mvptime_core::sqlite::ensure_open_task_segment(&conn, &new_id, &now_iso, max_gap_seconds)
    .map_err(|e| e.to_string())
}

/// Closes the currently-open task segment at `now_iso` (best-effort; no-op if none).
#[tauri::command]
fn db_close_open_task_segment(db: tauri::State<'_, DbPath>, now_iso: String) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  let open = mvptime_core::sqlite::get_open_task_segment(&conn).map_err(|e| e.to_string())?;
  if let Some(s) = open {
    mvptime_core::sqlite::close_task_segment(&conn, &s.id, &now_iso).map_err(|e| e.to_string())?;
  }
  Ok(())
}

/// Ends any open segment at `now_iso` and starts a new one at `now_iso`, inheriting tags.
#[tauri::command]
fn db_resume_task_segment_after_pause(
  db: tauri::State<'_, DbPath>,
  new_id: String,
  now_iso: String,
) -> Result<mvptime_core::sqlite::TaskSegmentRow, String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;

  let open = mvptime_core::sqlite::get_open_task_segment(&conn).map_err(|e| e.to_string())?;
  if let Some(s) = open {
    mvptime_core::sqlite::close_task_segment(&conn, &s.id, &now_iso).map_err(|e| e.to_string())?;
  }

  // Create a new open segment at `now_iso`. Tags are inherited from the most recent closed segment.
  mvptime_core::sqlite::ensure_open_task_segment(&conn, &new_id, &now_iso, 0).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_task_checkin_yes(db: tauri::State<'_, DbPath>, now_iso: String) -> Result<(), String> {
  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  let open = mvptime_core::sqlite::get_open_task_segment(&conn).map_err(|e| e.to_string())?;
  if let Some(s) = open {
    mvptime_core::sqlite::update_task_segment_prompt(&conn, &s.id, &now_iso).map_err(|e| e.to_string())?;
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

  let conn = mvptime_core::sqlite::open_db(&db.0).map_err(|e| e.to_string())?;
  mvptime_core::sqlite::migrate(&conn).map_err(|e| e.to_string())?;
  let open = mvptime_core::sqlite::get_open_task_segment(&conn).map_err(|e| e.to_string())?;
  if let Some(s) = open {
    mvptime_core::sqlite::close_task_segment(&conn, &s.id, &now_iso).map_err(|e| e.to_string())?;
  }
  let row = mvptime_core::sqlite::TaskSegmentRow {
    id: new_segment_id.clone(),
    start_time: now_iso.clone(),
    end_time: None,
    title: new_title,
    created_at: now_iso.clone(),
    last_prompt_at: None,
  };
  mvptime_core::sqlite::upsert_task_segment(&conn, &row).map_err(|e| e.to_string())?;

  let corp = non_empty(tag_corporation_id);
  let tt = non_empty(tag_task_type);
  let ttd = non_empty(tag_task_type_detail);
  if corp.is_some() || tt.is_some() || ttd.is_some() {
    let bucket_date = now_iso
      .get(..10)
      .map(str::to_string)
      .unwrap_or_else(|| "1970-01-01".to_string());
    let tag = mvptime_core::sqlite::BlockTagRow {
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
    mvptime_core::sqlite::set_block_tag(&conn, &tag).map_err(|e| e.to_string())?;
  }

  Ok(())
}
