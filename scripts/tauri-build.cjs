/**
 * Runs `tauri build` from src-tauri/app with the same Windows rc.exe discovery as tauri:dev.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const { applyRcToEnv } = require('./windows-rc.cjs');

const root = path.join(__dirname, '..');
const appDir = path.join(root, 'src-tauri', 'app');

const env = { ...process.env };
if (process.platform === 'win32') {
  const rc = applyRcToEnv(env);
  if (rc) console.log(`[tauri-build] Using rc.exe: ${rc}`);
  else {
    console.warn('[tauri-build] Could not locate rc.exe — install Windows SDK or set RC (see npm run tauri:dev help).');
  }
}

const result = spawnSync('npx', ['tauri', 'build'], {
  cwd: appDir,
  stdio: 'inherit',
  shell: true,
  env,
});
process.exit(result.status ?? 1);
