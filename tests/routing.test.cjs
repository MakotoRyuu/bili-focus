const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/shared.js');
test('only genuine teacher URLs or numeric UIDs can be saved', () => {
  assert.equal(Study.teacherId('https://space.bilibili.com/123/upload/video'), '123');
  assert.equal(Study.teacherId(' 123 '), '123');
  for (const value of ['https://space.bilibili.com.evil.test/123', 'javascript:alert(1)', 'https://evil.test/123', 'https://space.bilibili.com/123abc', '0', '']) assert.equal(Study.teacherId(value), null);
});
test('only course, teacher and account search routes survive', () => {
  assert.equal(Study.route('https://www.bilibili.com/video/BV1test?p=2'), 'video');
  assert.equal(Study.route('https://space.bilibili.com/123'), 'teacher');
  assert.equal(Study.route('https://search.bilibili.com/all?keyword=math'), 'search');
  assert.equal(Study.route('https://www.bilibili.com/cheese/play/ep172445'), 'cheese');
  assert.equal(Study.route('https://www.bilibili.com/cheese/play/ss4372'), 'cheese');
  assert.equal(Study.route('https://www.bilibili.com/cheese/'), 'cheese');
  for (const path of ['/', '/v/popular/all', '/v/dynamic', '/bangumi/play/ep123']) assert.equal(Study.route(`https://www.bilibili.com${path}`), 'home');
});
test('search preserves input as a query parameter, in video search', () => {
  const url = new URL(Study.searchUrl(' 数学 & 物理#老师 '));
  assert.equal(url.pathname, '/video');
  assert.equal(url.searchParams.get('keyword'), '数学 & 物理#老师');
  assert.equal(url.hash, '');
});
test('manifest resources exist and permissions stay minimal', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const manifest = require('../manifest.json');
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'declarativeNetRequestWithHostAccess']);
  for (const file of [manifest.background.service_worker, ...manifest.content_scripts.flatMap(script => [...script.js, ...script.css])]) assert.ok(fs.existsSync(path.join(__dirname, '..', file)), file);
});
