const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('legacy homepage and every bundled dependency remain available after upgrade', () => {
  const manifest = require('../manifest.json');
  const legacy = manifest.web_accessible_resources.find(entry => entry.resources.includes('study.html'));
  assert.ok(legacy.matches.includes('https://www.bilibili.com/*'));
  const html = fs.readFileSync(path.join(root, 'study.html'), 'utf8');
  const dependencies = [...html.matchAll(/(?:src|href)="([^"\s]+)"/g)].map(match => match[1]).filter(value => !value.includes('://'));
  assert.ok(dependencies.includes('src/upgrade/upgrade.js'));
  for (const file of dependencies) assert.ok(fs.existsSync(path.join(root, file)), file);
});

test('legacy entry does not automatically bounce back to the old redirecting content script', async () => {
  const opened = []; const handlers = {};
  const status = { textContent: '' };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/upgrade/upgrade.js'), 'utf8'), {
    document: { querySelector: selector => selector === '#manage' ? { addEventListener: (type, handler) => { handlers[type] = handler; } } : status },
    chrome: { runtime: { id: 'test-extension' }, tabs: { create: async data => opened.push(data.url) } },
    location: { replace: () => assert.fail('Must not redirect before the extension has been reloaded') }
  });
  assert.deepEqual(opened, []);
  await handlers.click();
  assert.deepEqual(opened, ['chrome://extensions/?id=test-extension']);
});

test('updated toolbar action opens the native homepage, not a retired extension URL', () => {
  let click; const opened = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/background/worker.js'), 'utf8'), {
    importScripts: () => {},
    chrome: { runtime: { onMessage: { addListener: () => {} } }, action: { onClicked: { addListener: handler => { click = handler; } } }, tabs: { create: data => opened.push(data.url) } }
  });
  click();
  assert.deepEqual(opened, ['https://www.bilibili.com/']);
});
