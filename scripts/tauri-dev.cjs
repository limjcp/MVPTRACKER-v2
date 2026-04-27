/**
 * Starts `tauri dev` from src-tauri/app.
 * On Windows, sets RC for embed-resource / tauri-winres (see scripts/windows-rc.cjs).
 */
const { spawnSync } = require('child_process');
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

const result = spawnSync('npx', ['tauri', 'dev'], {
  cwd: appDir,
  stdio: 'inherit',
  shell: true,
  env,
});
process.exit(result.status ?? 1);
