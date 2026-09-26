importScripts('../core/shared.js', '../core/library.js');
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: 'https://www.bilibili.com/' }));
let pending = Promise.resolve();
function transaction(work) {
  const next = pending.then(work);
  pending = next.catch(() => {});
  return next;
}
async function readLibrary() {
  const raw = await chrome.storage.local.get(['library', 'teachers', 'courses']);
  const state = Library.normalize(raw);
  if (!raw.library) await chrome.storage.local.set({ library: state });
  return state;
}
async function json(url) {
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('B站暂时无法访问，请稍后重试。');
  const result = await response.json();
  if (result.code !== 0 || !result.data) throw new Error('B站暂时未返回资料，请稍后重试。');
  return result.data;
}
async function metadata(message) {
  if (message.kind === 'teacher') {
    const id = Study.teacherId(message.url);
    if (!id) throw new Error('请输入有效的老师主页链接或 UID。');
    try {
      const data = await json(`https://api.bilibili.com/x/web-interface/card?mid=${id}`);
      return { id, name: String(data.card?.name || ''), avatar: Library.imageUrl(data.card?.face) };
    } catch { return { id, name: '', avatar: '' }; } // A nickname remains usable if the public API is rate limited.
  }
  if (message.kind !== 'course') throw new Error('无效的资料类型。');
  const parsed = Library.courseUrl(message.url);
  if (!parsed) throw new Error('请输入完整的 B站 BV / av 视频链接，不支持短链接或番剧链接。');
  const query = parsed.id.startsWith('BV') ? `bvid=${parsed.id}` : `aid=${parsed.id.slice(2)}`;
  const data = await json(`https://api.bilibili.com/x/web-interface/view?${query}`);
  return { id: data.bvid, aid: data.aid, name: data.title, cover: Library.imageUrl(data.pic), pageCount: Math.max(1, data.pages?.length || data.videos || 1) };
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.channel !== 'bili-focus') return;
  const work = message.type === 'metadata' ? metadata(message) : transaction(async () => {
    const state = await readLibrary();
    if (message.type === 'library.read') return state;
    if (message.type !== 'library.mutate') throw new Error('不支持的请求。');
    const action = { ...message.action };
    if (action.type === 'category.add') action.id = crypto.randomUUID();
    const next = Library.mutate(state, action);
    await chrome.storage.local.set({ library: next });
    return next;
  });
  work.then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message || '操作失败，请重试。' }));
  return true;
});
