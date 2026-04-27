/**
 * Locates Microsoft rc.exe for Tauri / embed-resource on Windows.
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null} absolute path to rc.exe, or null
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RC_TARGET_KEYS = ['RC_x86_64_pc_windows_msvc', 'RC_x86_64-pc-windows-msvc'];

function findRcOnPath() {
  try {
    const out = execSync('where rc 2>nul', { encoding: 'utf8', shell: true, windowsHide: true }).trim();
    const first = out.split(/\r?\n/).find((l) => l && /\.exe$/i.test(l));
    if (first && fs.existsSync(first)) return first;
  } catch (_) {}
  return null;
}

function readKitsRootFromRegistry() {
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows Kits\\Installed Roots',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows Kits\\Installed Roots',
  ];
  for (const regKey of keys) {
    try {
      const out = execSync(`reg query "${regKey}" /v KitsRoot10`, {
        encoding: 'utf8',
        shell: true,
        windowsHide: true,
      });
      const m = out.match(/KitsRoot10\s+REG_(?:SZ|EXPAND_SZ)\s+(\S.*)/i);
      const dir = m?.[1]?.trim();
      if (dir && /^[A-Za-z]:\\/.test(dir) && fs.existsSync(dir)) return dir;
    } catch (_) {}
  }
  return null;
}

function findRcUnderKitRoot(kitRoot) {
  const binRoot = path.join(kitRoot, 'bin');
  if (!fs.existsSync(binRoot)) return null;
  const versionDirs = fs
    .readdirSync(binRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => /^\d/.test(name))
    .sort()
    .reverse();
  for (const name of versionDirs) {
    const candidate = path.join(binRoot, name, 'x64', 'rc.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findRcFilesystemGuess() {
  const bases = [
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    process.env.ProgramFiles || 'C:\\Program Files',
  ];
  for (const base of bases) {
    const rc = findRcUnderKitRoot(path.join(base, 'Windows Kits', '10'));
    if (rc) return rc;
  }
  return null;
}

function findRcViaVsWhere() {
  const vswhere = path.join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Microsoft Visual Studio',
    'Installer',
    'vswhere.exe'
  );
  if (!fs.existsSync(vswhere)) return null;
  try {
    const cmd = `"${vswhere}" -latest -products * -find "**\\Windows Kits\\10\\bin\\*\\x64\\rc.exe"`;
    const out = execSync(cmd, {
      encoding: 'utf8',
      shell: true,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    }).trim();
    const pick = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && fs.existsSync(l));
    if (pick) return pick;
  } catch (_) {}
  return null;
}

function resolveWindowsRc() {
  if (process.env.RC && fs.existsSync(process.env.RC)) return process.env.RC;
  for (const k of RC_TARGET_KEYS) {
    if (process.env[k] && fs.existsSync(process.env[k])) return process.env[k];
  }
  const kitsRoot = readKitsRootFromRegistry();
  const fromReg = kitsRoot ? findRcUnderKitRoot(kitsRoot) : null;
  return findRcOnPath() || fromReg || findRcFilesystemGuess() || findRcViaVsWhere();
}

/**
 * Mutates env: sets RC and RC_x86_64_* when rc.exe is found and not already set.
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null}
 */
function applyRcToEnv(env) {
  if (process.platform !== 'win32') return null;
  const already =
    (env.RC && fs.existsSync(env.RC)) || RC_TARGET_KEYS.some((k) => env[k] && fs.existsSync(env[k]));
  if (already) return env.RC || env.RC_x86_64_pc_windows_msvc || null;
  const rc = resolveWindowsRc();
  if (rc) {
    env.RC = rc;
    for (const k of RC_TARGET_KEYS) env[k] = rc;
  }
  return rc;
}

module.exports = { applyRcToEnv, resolveWindowsRc, RC_TARGET_KEYS };
