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

function processPlatform(dir) {
  const files = walkFiles(dir);
  const sigFiles = files.filter(f => f.endsWith('.sig'));

  if (sigFiles.length === 0) return null;

  // Derive the target installer by stripping `.sig`
  const getInstallerOptions = (sigPath) => sigPath.replace(/\.sig$/, '');

  let validInstaller = null;
  let validSig = null;

  for (const sig of sigFiles) {
    const installer = getInstallerOptions(sig);
    if (fs.existsSync(installer)) {
      validInstaller = installer;
      validSig = sig;
      break;
    }
  }

  if (!validInstaller) return null;

  const signature = fs.readFileSync(validSig, 'utf8').trim();
  const filename = path.basename(validInstaller);

  const repo = process.env.GITHUB_REPOSITORY;
  const version = process.env.GITHUB_REF_NAME ? process.env.GITHUB_REF_NAME : 'v0.1.1';
  const url = `https://github.com/${repo}/releases/download/${version}/${filename}`;

  return { signature, url };
}

function main() {
  const dirs = process.argv.slice(2).filter(Boolean);
  const platforms = {};

  // For Windows
  const win = dirs.find(d => d.includes('windows'));
  if (win) {
    const data = processPlatform(win);
    if (data) Object.assign(platforms, { 'windows-x86_64': data });
  }

  // For Mac Intel
  const macIntel = dirs.find(d => d.includes('macos-x64'));
  if (macIntel) {
    const data = processPlatform(macIntel);
    if (data) Object.assign(platforms, { 'darwin-x86_64': data });
  }

  // For Mac Silicon
  const macArm = dirs.find(d => d.includes('macos-arm64'));
  if (macArm) {
    const data = processPlatform(macArm);
    if (data) Object.assign(platforms, { 'darwin-aarch64': data });
  }

  // For Mac Universal
  const macUniversal = dirs.find(d => d.includes('macos-universal'));
  if (macUniversal) {
    const data = processPlatform(macUniversal);
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
}

main();