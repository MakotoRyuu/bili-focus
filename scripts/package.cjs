const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) throw new Error(`版本号不一致：manifest ${manifest.version} / package ${pkg.version}`);
const files = [
  'manifest.json', 'study.html', 'README.md', 'CHANGELOG.md', 'src/background',
  'src/content', 'src/core', 'src/rules', 'src/styles', 'src/upgrade'
];
for (const relative of files) if (!fs.existsSync(path.join(root, relative))) throw new Error(`发行文件缺失：${relative}`);
const bundledFiles = new Set();
function collect(relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw new Error(`manifest 引用缺失：${relative}`);
  const stat = fs.statSync(full);
  if (stat.isDirectory()) for (const child of fs.readdirSync(full)) collect(path.posix.join(relative, child));
  else bundledFiles.add(relative);
}
for (const file of [manifest.background.service_worker, ...manifest.content_scripts.flatMap(script => [...script.js, ...script.css]), ...manifest.web_accessible_resources.flatMap(group => group.resources), ...manifest.declarative_net_request.rule_resources.map(rule => rule.path)]) collect(file);
const required = new Set(files.flatMap(relative => {
  const full = path.join(root, relative);
  return fs.statSync(full).isDirectory()
    ? walkFiles(full).map(file => path.relative(root, file).split(path.sep).join('/'))
    : [relative];
}));
for (const file of bundledFiles) if (!required.has(file)) throw new Error(`发行包遗漏 manifest 依赖：${file}`);
function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}
const outputDir = path.join(root, 'releases');
fs.mkdirSync(outputDir, { recursive: true });
const archive = `bili-focus-${manifest.version}.zip`;
const archivePath = path.join(outputDir, archive);
fs.rmSync(archivePath, { force: true });
execFileSync('zip', ['-X', '-r', archivePath, ...files], { cwd: root, stdio: 'inherit' });
execFileSync('unzip', ['-t', archivePath], { stdio: 'inherit' });
const digest = crypto.createHash('sha256').update(fs.readFileSync(archivePath)).digest('hex');
fs.writeFileSync(`${archivePath}.sha256`, `${digest}  ${archive}
`);
console.log(`发行包已生成：${path.relative(root, archivePath)}（版本 ${manifest.version}）`);
console.log(`SHA-256: ${digest}`);
