/* Deterministic browser integration using the real worker and UI, with storage/API fixtures. */
const { chromium } = require('playwright');
const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm'); const assert = require('node:assert/strict'); const { webcrypto } = require('node:crypto');
const root = path.join(__dirname, '..'); const manifest = require('../manifest.json');
let data = { teachers: [{ id: '7', name: '原有昵称' }], palette: 'blue', theme: 'light' }, messageHandler, browser, context, networkFails = false, failNextLibraryRead = false;
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
  chrome: { runtime: { id: 'test', onMessage: { addListener: fn => { messageHandler = fn; } } }, action: { onClicked: { addListener() {} } }, tabs: { create() {} }, storage: { local: { get, set }, onChanged: { addListener() {} } }, declarativeNetRequest: { updateEnabledRulesets: async () => {} } },
  fetch: async url => {
    if (networkFails) throw new Error('offline');
    return { ok: true, json: async () => ({ code: 0, data: url.includes('/card?') ? { card: { name: '真实账号名', face: 'https://i0.hdslb.com/avatar.png' } } : url.includes('/pugv/view/web/season?') ? {
      season_id: 4372, title: '测试课堂课程', cover: 'https://archive.biliimg.com/cheese.jpg', ep_count: 1,
      episodes: [{ id: 172445, index: 1 }, { id: 172532, index: 2 }]
    } : { bvid: 'BV1GJ411x7h7', aid: 1234, title: '测试多 P 课程', pic: 'https://i0.hdslb.com/cover.png', pages: Array(5).fill({}) } }) };
  }
});
worker.importScripts = (...files) => files.forEach(file => vm.runInContext(fs.readFileSync(path.resolve(root, 'src/background', file), 'utf8'), worker));
vm.runInContext(fs.readFileSync(path.join(root, manifest.background.service_worker), 'utf8'), worker);
const send = message => {
  if (message.type === 'library.read' && failNextLibraryRead) {
    failNextLibraryRead = false;
    return Promise.resolve({ ok: false, error: 'temporary worker failure' });
  }
  return new Promise(resolve => messageHandler(message, { id: 'test' }, resolve));
};
const header = `<div class="bili-header"><div class="bili-header__bar"><div class="left-entry"><div class="left-entry-main"><a class="home-page-entry" href="https://www.bilibili.com/">首页</a></div></div><div class="center-search-container"><form id="nav-searchform"><input class="nav-search-input"><button class="nav-search-btn">搜索</button></form></div><div class="right-entry"><div class="right-entry__main"><div class="header-avatar-wrap"><a class="avatar-trigger" href="https://space.bilibili.com/999">头像</a><div class="v-popover-content"><div class="avatar-panel" style="width:320px;padding:40px;transform:translateX(60px);background:red"><a class="nickname" href="https://space.bilibili.com/999">我的昵称</a><div class="stats">数据与硬币</div><div class="recommend-services">推荐服务</div><button class="logout" onclick="window.logoutClicked=true">退出登录</button></div></div></div></div></div></div></div>`;
function fixture(url) {
  const searching = url.includes('search.bilibili.com'); const teacher = url.includes('space.bilibili.com'); const video = url.includes('/video/') || url.includes('/cheese/play/');
  const siteHeader = searching || teacher || video ? header : `<div class="bili-feed4">${header}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:14px sans-serif}.bili-header__bar{height:64px;padding:0 32px;box-sizing:border-box;display:flex;justify-content:space-between}#nav-searchform{display:flex}input{min-width:0;flex:1}.header-avatar-wrap{position:relative}.avatar-trigger{display:block;width:36px;height:36px}.header-avatar-wrap:hover .avatar-trigger{transform:scale(2) translateY(18px)}.v-popover-content{display:none;position:absolute;top:100%;right:0;width:240px;background:white;box-shadow:0 3px 15px #ccc}.header-avatar-wrap:hover .v-popover-content{display:block}.upinfo{margin:24px}.upinfo-avatar img{width:64px;height:64px}.nickname{display:block}.bili-feed4-layout{height:400px}</style></head><body>${siteHeader}${searching ? '<div class=search-tabs>视频 / 用户</div><div class=video-list><article class=bili-video-card style="--text:#18191c"><h3 class=bili-video-card__info--tit>视频结果</h3></article></div>' : teacher ? '<div class="upinfo header-upinfo"><div class="upinfo-avatar"><img src="https://i0.hdslb.com/avatar.png"></div><div class="upinfo-detail"><div class="nickname">页面老师名</div></div><div class="operations">关注 / 举报 / 加入黑名单</div></div><a href="/123/pugv">课堂</a>' : video ? '<video></video>' : '<div class="bili-feed4-layout">推荐流</div></div>'}</body></html>`;
}
async function open(url) {
  const page = await context.newPage(); await page.goto(url);
  if (url === 'https://www.bilibili.com/' && data.focusMode !== false) {
    await page.waitForFunction(() => performance.getEntriesByType('navigation')[0]?.type === 'reload');
  }
  for (const file of manifest.content_scripts[0].css) {
    for (;;) {
      try { await page.addStyleTag({ path: path.join(root, file) }); break; }
      catch (error) {
        if (!/Execution context was destroyed/.test(error.message)) throw error;
        await page.waitForLoadState('domcontentloaded');
      }
    }
  }
  return page;
}
async function assertHomePlacement(page) {
  const layout = await page.evaluate(() => {
    const header = document.querySelector('.bili-header');
    const home = document.querySelector('.study-home');
    return { adjacent: header?.nextElementSibling === home, gap: home?.getBoundingClientRect().top - header?.getBoundingClientRect().bottom };
  });
  assert.equal(layout.adjacent, true);
  assert.ok(layout.gap >= 0 && layout.gap < 100, `library sits too far below the header: ${layout.gap}px`);
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
  await context.route('https://archive.biliimg.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#00aeec"/></svg>' }));
  const page = await open('https://www.bilibili.com/'); await page.locator('.study-home').waitFor();
  await assertHomePlacement(page);
  await page.evaluate(() => document.querySelector('.bili-feed4-layout').append(document.querySelector('.study-home')));
  await page.waitForFunction(() => document.querySelector('.bili-header')?.nextElementSibling?.id === 'study-home');
  await assertHomePlacement(page);
  async function assertModeButtonStyle() {
    const layout = await page.locator('.center-search-container').evaluate(search => {
      const button = search.querySelector('.study-mode-toggle');
      const form = search.querySelector('#nav-searchform');
      const bounds = button.getBoundingClientRect(), formBounds = form.getBoundingClientRect();
      const style = getComputedStyle(button);
      return { first: search.firstElementChild === button, gap: formBounds.left - bounds.right, background: style.backgroundColor, color: style.color,
        searchWidth: search.getBoundingClientRect().width, buttonWidth: bounds.width, formWidth: formBounds.width,
        searchDisplay: getComputedStyle(search).display, formFlex: getComputedStyle(form).flex, formPosition: getComputedStyle(form).position };
    });
    assert.equal(layout.first, true);
    assert.ok(layout.gap >= 0 && layout.gap <= 6, `mode button layout: ${JSON.stringify(layout)}`);
    assert.equal(layout.background, 'rgb(255, 255, 255)');
    assert.equal(layout.color, 'rgb(24, 25, 28)');
  }
  await assertModeButtonStyle();
  assert.equal(await page.locator('.study-teacher .study-card-name').innerText(), '原有昵称');
  assert.equal(await page.locator('#study-status').count(), 0);
  for (const width of [1440, 2200, 760]) {
    await page.setViewportSize({width,height:1000});
    await assertModeButtonStyle();
    const icon = await page.locator('.study-home-entry').first().boundingBox();
    const heading = await page.locator('.study-heading h2').first().boundingBox();
    assert.ok(Math.abs(icon.x-heading.x)<1, `home alignment at ${width}: ${icon.x}/${heading.x}`);
  }
  await page.setViewportSize({width:1440,height:1000});
  const selects = await page.locator('.study-settings select').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width)); assert.equal(selects[0], selects[1]);
  assert.deepEqual(await page.locator('[data-collection]').evaluateAll(nodes=>nodes.map(node=>node.dataset.collection)), ['course','teacher']);
  assert.equal(await page.locator('.study-home-entry svg').count(),1);
  await page.locator('.study-account-name').waitFor();
  assert.equal(await page.locator('.study-account-name').innerText(),'我的昵称');
  assert.equal(await page.locator('.avatar-trigger').isVisible(),false);
  assert.equal(await page.locator('.stats').isVisible(), false);
  await page.locator('.study-account-exit').click(); assert.equal(await page.evaluate(()=>window.logoutClicked),true);
  await page.evaluate(()=>{document.querySelector('.header-avatar-wrap').remove();const guest=document.createElement('div');guest.className='header-avatar-unlogin-wrap';const entry=document.createElement('button');entry.className='header-avatar-unlogin-entry';entry.textContent='原生登录';entry.onclick=()=>{window.loginClicked=true};guest.append(entry);document.querySelector('.right-entry__main').prepend(guest)});
  await page.locator('.study-account-login').waitFor(); await page.locator('.study-account-login').click(); assert.equal(await page.evaluate(()=>window.loginClicked),true);
  const teachers = page.locator('[data-collection=teacher]'), courses = page.locator('[data-collection=course]');
  const teacherMenu = category => category.locator('.study-category-menu');
  await teacherMenu(teachers.locator('[data-category=default]')).locator('summary').click();
  assert.equal(await teachers.getByRole('button', { name: '删除分类', exact: true }).isDisabled(), true);
  assert.equal(await teachers.getByRole('button', { name: '上移', exact: true }).isDisabled(), true);
  await teachers.getByRole('button', { name: '添加分类', exact: true }).click(); await page.getByLabel('分类名称', { exact: true }).fill('数学'); await page.locator('dialog').getByRole('button', { name: '添加分类', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-collection=teacher] .study-category').length === 2);
  const teacherOrder = () => teachers.locator('.study-category h3').allTextContents();
  const mathCategory = () => teachers.locator('.study-category').filter({ has: page.getByRole('heading', { name: '数学', exact: true }) });
  await teacherMenu(mathCategory()).locator('summary').click();
  await mathCategory().getByRole('button', { name: '上移' }).click();
  await page.waitForFunction(() => document.querySelector('[data-collection=teacher] .study-category h3')?.textContent === '数学');
  assert.deepEqual(await teacherOrder(), ['数学', '未分类']);
  assert.deepEqual(await courses.locator('.study-category').evaluateAll(nodes => nodes.map(node => node.dataset.category)), ['default']);
  await teacherMenu(mathCategory()).locator('summary').click();
  await mathCategory().getByRole('button', { name: '下移' }).click();
  await page.waitForFunction(() => document.querySelector('[data-collection=teacher] .study-category h3')?.textContent === '未分类');
  assert.deepEqual(await teacherOrder(), ['未分类', '数学']);
  const teacherPage = await open('https://space.bilibili.com/123/upload/video'); await teacherPage.locator('#study-save-teacher').click();
  assert.equal(await teacherPage.getByLabel('分类', { exact: true }).inputValue(), '');
  await teacherPage.getByLabel('昵称', { exact: true }).fill('我的数学老师'); await teacherPage.getByLabel('分类', { exact: true }).selectOption({ label: '数学' });
  await teacherPage.getByRole('button', { name: '确认收藏', exact: true }).click();
  await teacherPage.waitForFunction(() => document.querySelector('#study-save-teacher')?.getAttribute('aria-pressed') === 'true');
  assert.equal(await page.locator('.study-teacher').filter({hasText:'我的数学老师'}).locator('img').count(), 1);
  await teacherPage.locator('#study-save-teacher').click(); await teacherPage.waitForFunction(() => document.querySelector('#study-save-teacher')?.getAttribute('aria-pressed') === 'false'); assert.equal(await teacherPage.locator('dialog').count(), 0);
  await teacherPage.getByRole('link', { name: '课堂', exact: true }).click();
  await teacherPage.waitForURL('https://space.bilibili.com/123/pugv');
  await teacherPage.waitForTimeout(800);
  assert.equal(teacherPage.url(), 'https://space.bilibili.com/123/pugv');
  // Manual teacher input uses public account artwork and still requires a category.
  await page.getByRole('button', { name: '添加老师', exact: true }).click(); await page.getByLabel('主页链接或 UID', { exact: true }).fill('123'); await page.getByLabel('昵称', { exact: true }).fill('手动老师'); await page.getByLabel('分类', { exact: true }).selectOption({ label: '数学' }); await page.getByRole('button', { name: '确认收藏', exact: true }).click(); await page.locator('.study-teacher').filter({hasText:'手动老师'}).locator('img').waitFor();
  await page.getByRole('button', { name: '添加课程', exact: true }).click(); await page.getByLabel('课程链接', { exact: true }).fill('https://www.bilibili.com/video/BV1GJ411x7h7/?p=2'); await page.getByLabel('分类', { exact: true }).selectOption('default'); await page.getByRole('button', { name: '确认收藏', exact: true }).click(); await page.locator('.study-course img').waitFor();
  assert.match(await page.locator('.study-course .study-card-detail').innerText(), /尚未开始/);
  const videoPage = await open('https://www.bilibili.com/video/BV1GJ411x7h7/?p=3');
  await videoPage.waitForFunction(() => document.querySelector('.study-home-entry'));
  await videoPage.evaluate(() => { const video = document.querySelector('video'); Object.defineProperties(video, { paused: { value: false }, currentTime: { value: 3 } }); video.dispatchEvent(new Event('timeupdate')); });
  await page.waitForFunction(() => document.querySelector('.study-course .study-card-detail')?.textContent.includes('第 3 P'));
  assert.ok((await page.locator('.study-course>a').getAttribute('href')).endsWith('?p=3'));
  assert.equal(await page.getByRole('button', {name:'添加老师',exact:true}).count(),1); assert.equal(await page.getByRole('button',{name:'添加课程',exact:true}).count(),1);
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
  await math.locator('.study-category-menu summary').click();
  await math.getByRole('button', { name: '删除分类', exact: true }).click(); await page.getByRole('button', { name: '删除分类及收藏', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-collection=teacher] .study-category').length === 1);
  assert.equal(await page.locator('.study-teacher').count(), 1); assert.equal(await page.locator('.study-course').count(), 1);
  networkFails = true;
  await page.getByRole('button', { name: '添加课程', exact: true }).click(); await page.getByLabel('课程链接', { exact: true }).fill('https://www.bilibili.com/video/BV1GJ411x7h7/'); await page.getByLabel('分类', { exact: true }).selectOption('default'); await page.getByRole('button', { name: '确认收藏', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.study-form-error')?.textContent.length > 0); assert.equal(await page.locator('.study-course').count(), 1); await page.getByRole('button', { name: '取消', exact: true }).click();
  networkFails = false;
  await page.getByRole('button', { name: '添加课程', exact: true }).click();
  await page.getByLabel('课程链接', { exact: true }).fill('https://www.bilibili.com/cheese/play/ep172532');
  await page.getByLabel('分类', { exact: true }).selectOption('default');
  await page.getByRole('button', { name: '确认收藏', exact: true }).click();
  const classroomCard = page.locator('.study-course').filter({ hasText: '测试课堂课程' });
  await classroomCard.waitFor();
  await classroomCard.locator('img').waitFor();
  assert.equal(await classroomCard.locator('img').getAttribute('src'), 'https://archive.biliimg.com/cheese.jpg');
  assert.match(await classroomCard.locator('.study-card-detail').innerText(), /共 2 课/);
  assert.equal(await classroomCard.locator('a').getAttribute('href'), 'https://www.bilibili.com/cheese/play/ep172532');
  const classroomPage = await open('https://www.bilibili.com/cheese/play/ep172532');
  await classroomPage.waitForFunction(() => document.documentElement.dataset.studyPage === 'cheese');
  assert.equal(classroomPage.url(), 'https://www.bilibili.com/cheese/play/ep172532');
  await classroomPage.evaluate(() => { const video = document.querySelector('video'); Object.defineProperties(video, { paused: { value: false }, currentTime: { value: 3 } }); video.dispatchEvent(new Event('timeupdate')); });
  await page.waitForFunction(() => document.querySelector('.study-course:last-of-type .study-card-detail')?.textContent.includes('第 2 课'));
  assert.match(await classroomCard.locator('.study-card-detail').innerText(), /上次看到第 2 课/);
  await page.setViewportSize({ width: 760, height: 900 });
  const account = await page.locator('.study-account-inline').boundingBox(); assert.ok(account.x >= 0 && account.x + account.width <= 760);
  assert.ok(await videoPage.locator('.study-home-entry').isVisible()); assert.ok(await teacherPage.locator('.study-home-entry').isVisible());
  const searchPage = await open('https://search.bilibili.com/video?keyword=math'); await searchPage.locator('.study-home-entry').first().waitFor(); assert.equal(new URL(searchPage.url()).pathname,'/video'); assert.equal(await searchPage.locator('.bili-video-card').isVisible(),true); assert.equal(await searchPage.locator('.search-tabs').isVisible(),true);
  for (const palette of ['white','blue','pink','black','green']) {
    await searchPage.evaluate(palette=>chrome.storage.local.set({palette,theme:'dark'}),palette);
    const colors=await searchPage.evaluate(()=>{const probe=document.createElement('span');probe.style.color='var(--study-text)';probe.style.background='var(--study-bg)';document.body.append(probe);const result={expectedText:getComputedStyle(probe).color,expectedBg:getComputedStyle(probe).backgroundColor,text:getComputedStyle(document.querySelector('.bili-video-card__info--tit')).color,bg:getComputedStyle(document.body).backgroundColor};probe.remove();return result});
    assert.equal(colors.text,colors.expectedText);assert.equal(colors.bg,colors.expectedBg);
  }
  // Concurrent calls are serialized by the real worker, so neither favorite is lost.
  const results = await Promise.all(['201','202'].map(id => send({ channel: 'bili-focus', type: 'library.mutate', action: { type: 'item.save', kind: 'teacher', item: { id, name: `并发${id}`, categoryId: 'default' } } })));
  assert.ok(results.every(result => result.ok)); assert.ok(data.library.teachers.some(item => item.id === '201')); assert.ok(data.library.teachers.some(item => item.id === '202'));
  assert.equal(await searchPage.locator('.right-entry').isVisible(), false);
  assert.equal(await searchPage.locator('.study-account-inline').count(), 0);
  await searchPage.evaluate(() => {
    document.querySelector('.study-home-entry').href = 'https://www.bilibili.com/?spm_id_from=333.337.0.0';
    document.querySelector('.left-entry').addEventListener('click', event => {
      event.preventDefault(); window.nativeNavigationIntercepted = true;
    });
  });
  let homeLoads = 0;
  searchPage.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === searchPage.mainFrame() && request.url() === 'https://www.bilibili.com/') homeLoads++;
  });
  await searchPage.locator('.study-home-entry').click();
  await searchPage.waitForURL('https://www.bilibili.com/');
  await searchPage.locator('.study-home').waitFor();
  await searchPage.waitForFunction(() => performance.getEntriesByType('navigation')[0]?.type === 'reload');
  await searchPage.locator('.study-home').waitFor({ state: 'visible' });
  await assertHomePlacement(searchPage);
  await searchPage.waitForTimeout(900);
  assert.equal(homeLoads, 2, 'one homepage navigation followed by exactly one reload');
  assert.equal(searchPage.url(), 'https://www.bilibili.com/');
  await searchPage.locator('.study-home-entry').click();
  await searchPage.waitForTimeout(1200);
  await searchPage.locator('.study-home').waitFor({ state: 'visible' });
  assert.equal(homeLoads, 3, 'clicking from home causes one reload');
  assert.equal(searchPage.url(), 'https://www.bilibili.com/');
  const trackedHome = await open('https://www.bilibili.com/?spm_id_from=333.337.0.0');
  await trackedHome.waitForURL('https://www.bilibili.com/');
  await trackedHome.locator('.study-home').waitFor();
  // Homepage still mounts when native markup is absent or removed during hydration.
  await trackedHome.evaluate(() => document.body.replaceChildren());
  await trackedHome.locator('.study-home').waitFor();
  assert.equal(await trackedHome.locator('[data-collection]').count(), 2);
  // Reproduce a header arriving after the fallback library, as in native hydration.
  await trackedHome.evaluate(markup => document.body.insertAdjacentHTML('beforeend', markup), header);
  await trackedHome.waitForFunction(() => document.querySelector('.bili-header')?.nextElementSibling?.id === 'study-home');
  const headerBox = await trackedHome.locator('.bili-header').boundingBox();
  const libraryBox = await trackedHome.locator('.study-home').boundingBox();
  assert.ok(headerBox.y + headerBox.height <= libraryBox.y);
  assert.equal(await trackedHome.locator('.study-home').count(), 1);
  // Replacement headers must also regain their position above the same library.
  await trackedHome.evaluate(markup => { document.querySelector('.bili-header').remove(); document.body.insertAdjacentHTML('beforeend', markup); }, header);
  await trackedHome.waitForFunction(() => document.querySelector('.bili-header')?.nextElementSibling?.id === 'study-home');
  const staleLibrary = clone(data.library);
  const staleClassroom = staleLibrary.courses.find(item => item.id === 'ss4372');
  staleClassroom.cover = ''; staleClassroom.pageCount = 1;
  await set({ library: staleLibrary });
  const restoredHome = await open('https://www.bilibili.com/');
  await restoredHome.waitForFunction(() => document.querySelector('.study-course img[src="https://archive.biliimg.com/cheese.jpg"]'));
  assert.equal(data.library.courses.find(item => item.id === 'ss4372').pageCount, 2);
  assert.equal(await page.getByRole('button', { name: '切换到正常 B站模式' }).count(), 1);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '切换到正常 B站模式' }).click();
  assert.notEqual(data.focusMode, false);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '切换到正常 B站模式' }).click();
  await page.getByRole('button', { name: '切换到专注模式' }).waitFor();
  for (const file of manifest.content_scripts[0].css) await page.addStyleTag({ path: path.join(root, file) });
  await assertModeButtonStyle();
  assert.equal(data.focusMode, false);
  assert.equal(await page.locator('.study-home').count(), 0);
  assert.equal(await page.locator('.bili-feed4-layout').isVisible(), true);
  assert.equal(await page.locator('html').getAttribute('data-study-page'), null);
  const normalTeacher = await open('https://space.bilibili.com/123/');
  assert.equal(normalTeacher.url(), 'https://space.bilibili.com/123/');
  assert.equal(await normalTeacher.locator('#study-save-teacher').count(), 0);
  failNextLibraryRead = true;
  await page.getByRole('button', { name: '切换到专注模式' }).click();
  await page.locator('.study-home').waitFor();
  assert.equal(failNextLibraryRead, false);
  await assertHomePlacement(page);
  for (const file of manifest.content_scripts[0].css) await page.addStyleTag({ path: path.join(root, file) });
  await assertModeButtonStyle();
  assert.equal(data.focusMode, true);
  console.log('Browser integration passed: migration, header/menu, category invariants/cascade, teacher toggle/artwork, manual courses/cover, playback P, failure handling, concurrent writes and cross-tab sync.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
