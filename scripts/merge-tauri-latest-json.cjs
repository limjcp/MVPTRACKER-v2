/**
 * Merges Tauri updater `latest.json` files from multiple bundle directories (one `platforms` map).
 * Usage: node scripts/merge-tauri-latest-json.cjs <dir1> [dir2] [...]
 * Writes `latest.json` in the current working directory.
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

function findLatestJson(dirs) {
  const out = [];
  for (const d of dirs) {
    for (const f of walkFiles(d)) {
      if (path.basename(f) === 'latest.json') out.push(f);
    }
  }
  return out;
}

function semverKey(v) {
  const s = String(v || '0.0.0').replace(/^v/i, '');
  const parts = s.split('.').map((x) => parseInt(x, 10));
  return (parts[0] || 0) * 1e6 + (parts[1] || 0) * 1e3 + (parts[2] || 0);
}

function main() {
  const dirs = process.argv.slice(2).filter(Boolean);
  if (dirs.length === 0) {
    console.error('Usage: node scripts/merge-tauri-latest-json.cjs <artifactDir> [...]');
    process.exit(1);
  }
  const files = findLatestJson(dirs);
  if (files.length === 0) {
    console.error('No latest.json found under:', dirs.join(', '));
    process.exit(1);
  }

  let bestVersion = '0.0.0';
  let bestKey = 0;
  const platforms = {};
  let notes = '';

  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const vk = semverKey(j.version);
    if (vk >= bestKey) {
      bestKey = vk;
      bestVersion = String(j.version || '0.0.0').replace(/^v/i, '');
      if (j.notes) notes = j.notes;
    }
    Object.assign(platforms, j.platforms || {});
  }

  const out = {
    version: bestVersion,
    notes,
    platforms,
  };
  fs.writeFileSync('latest.json', JSON.stringify(out, null, 2));
  console.log('Wrote latest.json version=%s platforms=%s', out.version, Object.keys(out.platforms).join(', '));
}

main();
