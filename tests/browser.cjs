/* Deterministic browser integration using the real worker and UI, with storage/API fixtures. */
const { chromium } = require('playwright');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm'); const assert = require('node:assert/strict'); const { webcrypto } = require('node:crypto');
const root = path.join(__dirname, '..'); const manifest = require('../manifest.json');
let data = { teachers: [{ id: '7', name: '原有昵称' }], palette: 'blue', theme: 'light' }, messageHandler, browser, context, networkFails = false;
const clone = value => structuredClone(value);
async function get(keys) {
  if (Array.isArray(keys)) return Object.fromEntries(keys.filter(key => key in data).map(key => [key, clone(data[key])]));
  if (typeof keys === 'string') return { [keys]: clone(data[keys]) };
  return { ...keys, ...clone(data) };
}
async function set(update) {
  const changes = {};
  for (const [key, value] of Object.entries(update)) { changes[key] = { oldValue: data[key], newValue: clone(value) }; data[key] = clone(value); }
  if (context) await Promise.all(context.pages().map(page => page.evaluate(changes => window.__notify?.(changes), changes).catch(() => {})));
}
const worker = vm.createContext({ console, structuredClone, URL, AbortSignal, crypto: webcrypto,
  chrome: { runtime: { id: 'test', onMessage: { addListener: fn => { messageHandler = fn; } } }, action: { onClicked: { addListener() {} } }, tabs: { create() {} }, storage: { local: { get, set } } },
  fetch: async url => {
    if (networkFails) throw new Error('offline');
    return { ok: true, json: async () => ({ code: 0, data: url.includes('/card?') ? { card: { name: '真实账号名', face: 'https://i0.hdslb.com/avatar.png' } } : { bvid: 'BV1GJ411x7h7', aid: 1234, title: '测试多 P 课程', pic: 'https://i0.hdslb.com/cover.png', pages: Array(5).fill({}) } }) };
  }
});
worker.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.resolve(root, 'src/background', file), 'utf8'), worker));
vm.runInContext(fs.readFileSync(path.join(root, manifest.background.service_worker), 'utf8'), worker);
const send = message => new Promise(resolve => messageHandler(message, { id: 'test' }, resolve));
const header = `<div class="bili-header"><div class="bili-header__bar"><div class="left-entry"><div class="left-entry-main"><a class="home-page-entry" href="https://www.bilibili.com/">首页</a></div></div><div class="center-search-container"><form id="nav-searchform"><input class="nav-search-input"><button class="nav-search-btn">搜索</button></form></div><div class="right-entry"><div class="right-entry__main"><div class="header-avatar-wrap"><a class="avatar-trigger" href="https://space.bilibili.com/999">头像</a><div class="v-popover-content"><div class="avatar-panel" style="width:320px;padding:40px;transform:translateX(60px);background:red"><a class="nickname" href="https://space.bilibili.com/999">我的昵称</a><div class="stats">数据与硬币</div><div class="recommend-services">推荐服务</div><button class="logout" onclick="window.logoutClicked=true">退出登录</button></div></div></div></div></div></div></div>`;
function fixture(url) {
  const teacher = url.includes('space.bilibili.com'); const video = url.includes('/video/');
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:14px sans-serif}.bili-header__bar{height:64px;padding:0 32px;box-sizing:border-box;display:flex;justify-content:space-between}#nav-searchform{display:flex}input{min-width:0;flex:1}.header-avatar-wrap{position:relative}.avatar-trigger{display:block;width:36px;height:36px}.header-avatar-wrap:hover .avatar-trigger{transform:scale(2) translateY(18px)}.v-popover-content{display:none;position:absolute;top:100%;right:0;width:240px;background:white;box-shadow:0 3px 15px #ccc}.header-avatar-wrap:hover .v-popover-content{display:block}.upinfo{margin:24px}.upinfo-avatar img{width:64px;height:64px}.nickname{display:block}.bili-feed4-layout{height:400px}</style></head><body>${header}${teacher ? '<div class="upinfo header-upinfo"><div class="upinfo-avatar"><img src="https://i0.hdslb.com/avatar.png"></div><div class="upinfo-detail"><div class="nickname">页面老师名</div></div><div class="operations">关注 / 举报 / 加入黑名单</div></div>' : video ? '<video></video>' : '<div class="bili-feed4-layout">推荐流</div>'}</body></html>`;
}
async function open(url) {
  const page = await context.newPage(); await page.goto(url);
  for (const file of manifest.content_scripts[0].css) await page.addStyleTag({ path: path.join(root, file) });
  return page;
}
async function main() {
  browser = await chromium.launch({ channel: 'chrome', headless: true }); context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.exposeFunction('__send', send); await context.exposeFunction('__get', get); await context.exposeFunction('__set', set);
  await context.addInitScript(() => {
    const listeners = []; window.__notify = changes => listeners.forEach(fn => fn(changes, 'local'));
    window.chrome = { runtime: { sendMessage: request => window.__send(request) }, storage: { local: { get: keys => window.__get(keys), set: update => window.__set(update) }, onChanged: { addListener: fn => listeners.push(fn) } } };
  });
  for (const file of manifest.content_scripts[0].js) await context.addInitScript({ path: path.join(root, file) });
  await context.route('https://**.bilibili.com/**', route => route.fulfill({ contentType: 'text/html', body: fixture(route.request().url()) }));
  await context.route('https://i0.hdslb.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#00aeec"/></svg>' }));
  const page = await open('https://www.bilibili.com/'); await page.locator('.study-home').waitFor();
  assert.equal(await page.locator('.study-teacher .study-card-name').innerText(), '原有昵称');
  assert.equal(await page.locator('#study-status').count(), 0);
  const selects = await page.locator('.study-settings select').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width)); assert.equal(selects[0], selects[1]);
  const search = await page.locator('.center-search-container').boundingBox(), avatar = await page.locator('.right-entry').boundingBox(); assert.ok(avatar.x - search.x - search.width < 30);
  await page.locator('.avatar-trigger').click(); assert.equal(page.url(), 'https://www.bilibili.com/');
  await page.locator('.avatar-trigger').hover(); assert.equal((await page.locator('.avatar-trigger').boundingBox()).width,36); await page.waitForFunction(() => document.querySelector('.study-account-menu[data-study-ready=true]'));
  assert.equal(await page.locator('.avatar-panel').evaluate(e=>getComputedStyle(e).display),'contents');
  assert.equal(await page.locator('.stats').isVisible(), false); assert.equal(await page.locator('.recommend-services').isVisible(), false);
  assert.equal(await page.locator('.nickname').isVisible(), true); if (process.env.BILI_FOCUS_SCREENSHOT) await page.screenshot({path:process.env.BILI_FOCUS_SCREENSHOT}); await page.locator('.logout').click(); assert.equal(await page.evaluate(() => window.logoutClicked), true);
  const teachers = page.locator('[data-collection=teacher]'), courses = page.locator('[data-collection=course]');
  assert.equal(await teachers.getByRole('button', { name: '删除分类', exact: true }).isDisabled(), true);
  await teachers.getByRole('button', { name: '添加分类', exact: true }).click(); await page.getByLabel('分类名称', { exact: true }).fill('数学'); await page.locator('dialog').getByRole('button', { name: '添加分类', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-collection=teacher] .study-category').length === 2);
  const teacherPage = await open('https://space.bilibili.com/123/upload/video'); await teacherPage.locator('#study-save-teacher').click();
  assert.equal(await teacherPage.getByLabel('分类', { exact: true }).inputValue(), '');
  await teacherPage.getByLabel('昵称', { exact: true }).fill('我的数学老师'); await teacherPage.getByLabel('分类', { exact: true }).selectOption({ label: '数学' });
  await teacherPage.getByRole('button', { name: '确认收藏', exact: true }).click();
  await teacherPage.waitForFunction(() => document.querySelector('#study-save-teacher')?.getAttribute('aria-pressed') === 'true');
  assert.equal(await page.locator('.study-teacher').filter({hasText:'我的数学老师'}).locator('img').count(), 1);
  await teacherPage.locator('#study-save-teacher').click(); await teacherPage.waitForFunction(() => document.querySelector('#study-save-teacher')?.getAttribute('aria-pressed') === 'false'); assert.equal(await teacherPage.locator('dialog').count(), 0);
  // Manual teacher input uses public account artwork and still requires a category.
  await page.getByRole('button', { name: '添加收藏', exact: true }).click(); await page.getByLabel('主页链接或 UID', { exact: true }).fill('123'); await page.getByLabel('昵称', { exact: true }).fill('手动老师'); await page.getByLabel('分类', { exact: true }).selectOption({ label: '数学' }); await page.getByRole('button', { name: '确认收藏', exact: true }).click(); await page.locator('.study-teacher').filter({hasText:'手动老师'}).locator('img').waitFor();
  await page.getByRole('button', { name: '添加收藏', exact: true }).click(); await page.getByLabel('收藏类型', {exact:true}).selectOption('course'); await page.getByLabel('课程链接', { exact: true }).fill('https://www.bilibili.com/video/BV1GJ411x7h7/?p=2'); await page.getByLabel('分类', { exact: true }).selectOption('default'); await page.getByRole('button', { name: '确认收藏', exact: true }).click(); await page.locator('.study-course img').waitFor();
  assert.match(await page.locator('.study-course .study-card-detail').innerText(), /尚未开始/);
  const videoPage = await open('https://www.bilibili.com/video/BV1GJ411x7h7/?p=3');
  await videoPage.waitForFunction(() => document.querySelector('.study-home-entry'));
  await videoPage.evaluate(() => { const video = document.querySelector('video'); Object.defineProperties(video, { paused: { value: false }, currentTime: { value: 3 } }); video.dispatchEvent(new Event('timeupdate')); });
  await page.waitForFunction(() => document.querySelector('.study-course .study-card-detail')?.textContent.includes('第 3 P'));
  assert.ok((await page.locator('.study-course>a').getAttribute('href')).endsWith('?p=3'));
  assert.equal(await page.getByRole('button', {name:'添加收藏',exact:true}).count(),1);
  await page.locator('.study-teacher').filter({hasText:'手动老师'}).locator('.study-edit').click();
  await page.getByLabel('昵称',{exact:true}).fill('修改后的昵称'); await page.getByLabel('分类',{exact:true}).selectOption('default');
  await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await page.locator('[data-collection=teacher] [data-category=default]').getByText('修改后的昵称',{exact:true}).waitFor();
  await page.locator('.study-course .study-edit').click(); await page.getByLabel('课程名称',{exact:true}).fill('新课程名');
  await page.getByRole('button',{name:'保存修改',exact:true}).click();
  await page.getByText('新课程名',{exact:true}).waitFor(); assert.match(await page.locator('.study-course .study-card-detail').innerText(), /第 3 P/);
  assert.equal(await page.locator('.study-course img').count(),1);
  // Move the teacher back so category cascade below continues exercising deletion.
  await page.locator('.study-teacher').filter({hasText:'修改后的昵称'}).locator('.study-edit').click();
  await page.getByLabel('分类',{exact:true}).selectOption({label:'数学'}); await page.getByRole('button',{name:'保存修改',exact:true}).click();

  const math = teachers.locator('.study-category').filter({ has: page.getByRole('heading', { name: '数学', exact: true }) });
  await math.getByRole('button', { name: '删除分类', exact: true }).click(); await page.getByRole('button', { name: '删除分类及收藏', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-collection=teacher] .study-category').length === 1);
  assert.equal(await page.locator('.study-teacher').count(), 1); assert.equal(await page.locator('.study-course').count(), 1);
  networkFails = true;
  await page.getByRole('button', { name: '添加收藏', exact: true }).click(); await page.getByLabel('收藏类型', {exact:true}).selectOption('course'); await page.getByLabel('课程链接', { exact: true }).fill('https://www.bilibili.com/video/BV1GJ411x7h7/'); await page.getByLabel('分类', { exact: true }).selectOption('default'); await page.getByRole('button', { name: '确认收藏', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.study-form-error')?.textContent.length > 0); assert.equal(await page.locator('.study-course').count(), 1); await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.setViewportSize({ width: 760, height: 900 }); await page.locator('.avatar-trigger').hover();
  const menu = await page.locator('.study-account-menu').boundingBox(); assert.ok(menu.x >= 0 && menu.x + menu.width <= 760);
  assert.ok(await videoPage.locator('.study-home-entry').isVisible()); assert.ok(await teacherPage.locator('.study-home-entry').isVisible());
  // Concurrent calls are serialized by the real worker, so neither favorite is lost.
  const results = await Promise.all(['201','202'].map(id => send({ channel: 'bili-focus', type: 'library.mutate', action: { type: 'item.save', kind: 'teacher', item: { id, name: `并发${id}`, categoryId: 'default' } } })));
  assert.ok(results.every(result => result.ok)); assert.ok(data.library.teachers.some(item => item.id === '201')); assert.ok(data.library.teachers.some(item => item.id === '202'));
  console.log('Browser integration passed: migration, header/menu, category invariants/cascade, teacher toggle/artwork, manual courses/cover, playback P, failure handling, concurrent writes and cross-tab sync.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
