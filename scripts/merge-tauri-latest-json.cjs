/**
 * Scans directories for built artifacts and generated `.sig` files to construct `latest.json` manually.
 */
const fs = require('fs');
const path = require('path');

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

function processPlatform(dir, label) {
  const files = walkFiles(dir);
  if (files.length === 0) {
    console.warn(`[merge-tauri-latest-json] ${label}: directory empty or missing (${dir}) — skipping`);
    return null;
  }

  // Focus ONLY on the `.tar.gz.sig` (for mac) or `.msi.sig` / `.exe.sig` (for windows).
  // We prioritize `.tar.gz.sig` for mac because the updater mandates tar.gz.
  let validSig = null;
  if (dir.includes('macos')) {
    validSig = files.find(f => f.endsWith('.tar.gz.sig'));
  } else if (dir.includes('windows')) {
    validSig = files.find(f => f.endsWith('.msi.sig') || f.endsWith('.exe.sig'));
  }

  if (!validSig) {
    console.warn(`[merge-tauri-latest-json] ${label}: no signature file found in ${dir} — skipping`);
    return null;
  }

  // Preferred: installer path is the signature path minus the trailing `.sig`.
  let validInstaller = validSig.replace(/\.sig$/, '');

  // Fallback: if the rename step ever leaves the installer/signature names out of sync,
  // look for any `.tar.gz` / `.msi` / `.exe` next to the signature and pair them.
  if (!fs.existsSync(validInstaller)) {
    const sigDir = path.dirname(validSig);
    const installerExts = dir.includes('macos') ? ['.tar.gz'] : ['.msi', '.exe'];
    const sibling = files.find(f =>
      path.dirname(f) === sigDir &&
      !f.endsWith('.sig') &&
      installerExts.some(ext => f.endsWith(ext))
    );
    if (sibling) {
      console.warn(
        `[merge-tauri-latest-json] ${label}: derived installer path "${validInstaller}" missing; ` +
        `falling back to sibling "${sibling}"`
      );
      validInstaller = sibling;
    } else {
      console.warn(
        `[merge-tauri-latest-json] ${label}: signature "${validSig}" has no matching installer in ${sigDir} — skipping`
      );
      return null;
    }
  }

  const signature = fs.readFileSync(validSig, 'utf8').trim();
  const filename = path.basename(validInstaller);

  const repo = process.env.GITHUB_REPOSITORY;
  const version = process.env.GITHUB_REF_NAME ? process.env.GITHUB_REF_NAME : 'v0.1.2';
  const url = `https://github.com/${repo}/releases/download/${version}/${filename}`;

  console.log(`[merge-tauri-latest-json] ${label}: ${filename}`);
  return { signature, url };
}

function main() {
  const dirs = process.argv.slice(2).filter(Boolean);
  const platforms = {};

  const win = dirs.find(d => d.includes('windows'));
  if (win) {
    const data = processPlatform(win, 'windows-x86_64');
    if (data) Object.assign(platforms, { 'windows-x86_64': data });
  }

  const macIntel = dirs.find(d => d.includes('macos-x64'));
  if (macIntel) {
    const data = processPlatform(macIntel, 'darwin-x86_64');
    if (data) Object.assign(platforms, { 'darwin-x86_64': data });
  }

  const macArm = dirs.find(d => d.includes('macos-arm64'));
  if (macArm) {
    const data = processPlatform(macArm, 'darwin-aarch64');
    if (data) Object.assign(platforms, { 'darwin-aarch64': data });
  }

  const macUniversal = dirs.find(d => d.includes('macos-universal'));
  if (macUniversal) {
    const data = processPlatform(macUniversal, 'darwin-universal');
    if (data) {
      Object.assign(platforms, { 'darwin-universal': data });
    }
  }

  const out = {
    version: process.env.GITHUB_REF_NAME ? process.env.GITHUB_REF_NAME.replace(/^v/, '') : '0.1.1',
    notes: 'A new version of MVPTime is available!',
    pub_date: new Date().toISOString(),
    platforms,
  };

  fs.writeFileSync('latest.json', JSON.stringify(out, null, 2));
  console.log('Wrote latest.json directly from signatures:', Object.keys(out.platforms).join(', '));

  // Fail loudly if a platform that was supposed to be built is missing from latest.json.
  // Otherwise clients on that platform silently see "no update available" forever.
  // `darwin-universal` is best-effort (matches `macos-universal-optional` in CI).
  const required = [
    ['windows-x86_64', 'windows'],
    ['darwin-x86_64', 'macos-x64'],
    ['darwin-aarch64', 'macos-arm64'],
  ];
  const missing = required.filter(([key, dirHint]) =>
    dirs.some(d => d.includes(dirHint)) && !platforms[key]
  );
  if (missing.length > 0) {
    console.error(
      '[merge-tauri-latest-json] FATAL: expected platform(s) missing from latest.json: ' +
      missing.map(([k]) => k).join(', ') +
      '. Refusing to publish a partial updater manifest.'
    );
    process.exit(1);
  }
}

main();