/**
 * Starts `tauri dev` from src-tauri/app.
 * On Windows, sets RC for embed-resource / tauri-winres (see scripts/windows-rc.cjs).
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
  if (rc) console.log(`[tauri-dev] Using rc.exe: ${rc}`);
  else {
    console.warn(
      '[tauri-dev] Could not locate rc.exe.\n' +
        '  Fix (pick one):\n' +
        '  • Visual Studio Installer → Individual components → Windows 11 SDK (or 10 SDK)\n' +
        '  • Or workload: "Desktop development with C++"\n' +
        '  • Or: setx RC "C:\\full\\path\\to\\rc.exe"\n' +
        '  • Or one session: set RC=C:\\full\\path\\to\\rc.exe && npm run tauri:dev'
    );
  }
}

// IMPORTANT: run the repo-local @tauri-apps/cli binary directly.
// `npx` / `npm exec` may attempt network resolution depending on npm version/config.
const tauriBin =
  process.platform === 'win32'
    ? path.join(root, 'node_modules', '.bin', 'tauri.cmd')
    : path.join(root, 'node_modules', '.bin', 'tauri');

if (!fs.existsSync(tauriBin)) {
  console.error('[tauri-dev] Missing local tauri CLI. Run `npm ci` at repo root first.');
  process.exit(1);
}

try {
  const isWindowsCmdShim = process.platform === 'win32' && tauriBin.toLowerCase().endsWith('.cmd');

  const command = isWindowsCmdShim ? 'cmd.exe' : tauriBin;
  // Pass the .cmd shim as a distinct argument to avoid nested-quote parsing issues.
  const args = isWindowsCmdShim ? ['/d', '/c', tauriBin, 'dev'] : ['dev'];

  const result = spawnSync(command, args, {
    cwd: appDir,
    stdio: 'inherit',
    shell: false,
    env,
  });

  if (result.error) {
    console.error('[tauri-dev] Failed to spawn tauri CLI.');
    console.error(`[tauri-dev] tauriBin: ${tauriBin}`);
    console.error(result.error);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
} catch (err) {
  console.error('[tauri-dev] Unexpected error running tauri CLI.');
  console.error(`[tauri-dev] tauriBin: ${tauriBin}`);
  console.error(err);
  process.exit(1);
}
