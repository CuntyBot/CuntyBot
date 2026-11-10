const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..', 'src');
let files = [];
function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith('.js')) files.push(full); } }
walk(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { failed = true; process.stderr.write(`${file}\n${result.stderr}\n`); }
}
if (failed) process.exit(1);
console.log(`Syntax-Check erfolgreich: ${files.length} JavaScript-Dateien geprüft.`);
