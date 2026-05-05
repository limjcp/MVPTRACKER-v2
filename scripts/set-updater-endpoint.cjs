/**
 * Replaces __UPDATER_GITHUB_REPO__ in src-tauri/app/tauri.conf.json with $GITHUB_REPOSITORY (owner/repo).
 * CI sets GITHUB_REPOSITORY; local release builds can run: `GITHUB_REPOSITORY=o/r node scripts/set-updater-endpoint.cjs`
 */
const fs = require('fs');
const path = require('path');

const repo = process.env.GITHUB_REPOSITORY?.trim();
if (!repo) {
  process.exit(0);
}

const confPath = path.join(__dirname, '..', 'src-tauri', 'app', 'tauri.conf.json');
let raw = fs.readFileSync(confPath, 'utf8');
if (!raw.includes('__UPDATER_GITHUB_REPO__')) {
  process.exit(0);
}
raw = raw.split('__UPDATER_GITHUB_REPO__').join(repo);
fs.writeFileSync(confPath, raw);
console.log(`[set-updater-endpoint] Patched tauri.conf.json updater endpoint → github.com/${repo}`);
