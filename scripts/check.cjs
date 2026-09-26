const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  }
}
walk(path.join(__dirname, '..', 'src'));
console.log('All source scripts passed syntax checks.');
