use std::path::{Path, PathBuf};

/// Cross-app SQLite file (Staff + Admin). Under OS-local data dir, e.g. `%LOCALAPPDATA%\MVPTime\` on Windows.
pub fn shared_database_path() -> PathBuf {
  let base = dirs::data_local_dir().unwrap_or_else(|| {
    std::env::var_os("HOME")
      .or_else(|| std::env::var_os("USERPROFILE"))
      .map(PathBuf::from)
      .unwrap_or_else(std::env::temp_dir)
  });
  // Prefer the new MVPTime path, but keep backward compatibility by using the legacy
  // MVPTracker path when it exists (so upgrades preserve existing local data).
  let legacy = base.join("MVPTracker").join("mvptracker.sqlite3");
  if legacy.exists() {
    return legacy;
  }
  base.join("MVPTime").join("mvptime.sqlite3")
}

/// Previous default (per-app data dir). Used only to migrate existing installs.
pub fn legacy_staff_database_path(app_data_dir: &Path) -> PathBuf {
  // Legacy per-app location.
  let legacy = app_data_dir.join("mvptracker.sqlite3");
  if legacy.exists() {
    return legacy;
  }
  app_data_dir.join("mvptime.sqlite3")
}
