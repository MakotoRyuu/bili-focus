importScripts('../core/shared.js', '../core/library.js');
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: 'https://www.bilibili.com/' }));
let privacyUpdate = Promise.resolve();
function syncSearchPrivacy(focused) {
  const next = privacyUpdate.then(async () => {
    const focusMode = focused ?? (await chrome.storage.local.get({ focusMode: true })).focusMode;
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: focusMode ? ['search_privacy'] : [],
      disableRulesetIds: focusMode ? [] : ['search_privacy']
    });
  });
  privacyUpdate = next.catch(() => {});
  return next;
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.focusMode) syncSearchPrivacy().catch(console.error);
});
syncSearchPrivacy().catch(console.error);
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
  if (!parsed) throw new Error('请输入完整的 B站 BV / av 或课堂视频链接，不支持短链接或番剧链接。');
  if (parsed.kind === 'cheese') {
    const query = parsed.episodeId ? `ep_id=${parsed.episodeId}` : `season_id=${parsed.seasonId}`;
    const data = await json(`https://api.bilibili.com/pugv/view/web/season?${query}`);
    const episodes = Array.isArray(data.episodes) ? data.episodes : [];
    let first = episodes.find(episode => Number(episode.index) === 1);
    let selected = parsed.episodeId
      ? episodes.find(episode => String(episode.id) === parsed.episodeId)
      : first;
    // Large courses can return only one page of lessons with the season summary.
    if (data.season_id && (!first || !selected)) {
      const pages = Math.max(1, Math.ceil((Number(data.ep_count) || episodes.length) / 100));
      for (let page = 1; page <= pages && (!first || !selected); page++) {
        const list = await json(`https://api.bilibili.com/pugv/view/web/ep/list?season_id=${data.season_id}&pn=${page}&ps=100`);
        const items = Array.isArray(list.items) ? list.items : [];
        if (!first) first = items.find(episode => Number(episode.index) === 1) || (page === 1 ? items[0] : null);
        if (!selected) selected = parsed.episodeId
          ? items.find(episode => String(episode.id) === parsed.episodeId)
          : first;
      }
    }
    if (!data.season_id || !first?.id || !selected?.id) throw new Error('暂时无法获取该课堂课程的课时资料。');
    return {
      id: `ss${data.season_id}`, name: String(data.title || ''), cover: Library.imageUrl(data.cover),
      pageCount: episodes.reduce((count, episode) => Math.max(count, Number(episode.index) || 0), Math.max(1, Number(data.ep_count) || 0)),
      firstEpisodeId: String(first.id), startEpisodeId: String(selected.id),
      episodeId: String(selected.id), page: Number(selected.index) || 1
    };
  }
  const query = parsed.id.startsWith('BV') ? `bvid=${parsed.id}` : `aid=${parsed.id.slice(2)}`;
  const data = await json(`https://api.bilibili.com/x/web-interface/view?${query}`);
  return { id: data.bvid, aid: data.aid, name: data.title, cover: Library.imageUrl(data.pic), pageCount: Math.max(1, data.pages?.length || data.videos || 1) };
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.channel !== 'bili-focus') return;
  const work = message.type === 'metadata' ? metadata(message) : message.type === 'mode.set' ? transaction(async () => {
    if (typeof message.focusMode !== 'boolean') throw new Error('无效的模式。');
    await syncSearchPrivacy(message.focusMode);
    await chrome.storage.local.set({ focusMode: message.focusMode });
    return message.focusMode;
  }) : transaction(async () => {
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
