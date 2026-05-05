/**
 * Runs `tauri build` from src-tauri/app with the same Windows rc.exe discovery as tauri:dev.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
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

// IMPORTANT: run the repo-local @tauri-apps/cli binary directly.
// `npx` / `npm exec` may attempt network resolution depending on npm version/config.
const tauriBin =
  process.platform === 'win32'
    ? path.join(root, 'node_modules', '.bin', 'tauri.cmd')
    : path.join(root, 'node_modules', '.bin', 'tauri');

if (!fs.existsSync(tauriBin)) {
  console.error('[tauri-build] Missing local tauri CLI. Run `npm ci` at repo root first.');
  process.exit(1);
}

const isWindowsCmdShim = process.platform === 'win32' && tauriBin.toLowerCase().endsWith('.cmd');

const command = isWindowsCmdShim ? 'cmd.exe' : tauriBin;
const args = isWindowsCmdShim ? ['/d', '/c', tauriBin, 'build'] : ['build'];

const result = spawnSync(command, args, {
  cwd: appDir,
  stdio: 'inherit',
  shell: false,
  env,
});
process.exit(result.status ?? 1);
