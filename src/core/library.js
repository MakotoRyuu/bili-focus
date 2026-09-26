/* Shared pure data rules: used by the worker and tests. */
(() => {
  const DEFAULT_CATEGORY = { id: 'default', name: '未分类' };
  function imageUrl(value) {
    try {
      const url = new URL(String(value || '').replace(/^\/\//, 'https://'));
      if (!['https:', 'http:'].includes(url.protocol) || !/(^|\.)(?:hdslb|biliimg)\.com$/.test(url.hostname)) return '';
      url.protocol = 'https:'; return url.href;
    } catch { return ''; }
  }
  function courseUrl(value) {
    try {
      const url = new URL(String(value).trim());
      if (url.protocol !== 'https:' || !['www.bilibili.com', 'bilibili.com'].includes(url.hostname)) return null;
      const cheese = url.pathname.match(/^\/cheese\/play\/(ep|ss)([1-9]\d*)(?:\/|$)/);
      if (cheese) return {
        kind: 'cheese', id: `${cheese[1]}${cheese[2]}`,
        episodeId: cheese[1] === 'ep' ? cheese[2] : null,
        seasonId: cheese[1] === 'ss' ? cheese[2] : null,
        url: `https://www.bilibili.com/cheese/play/${cheese[1]}${cheese[2]}`
      };
      const match = url.pathname.match(/^\/video\/(BV[0-9A-Za-z]{10}|av[1-9]\d*)(?:\/|$)/);
      if (!match) return null;
      const page = Number(url.searchParams.get('p') || 1);
      return { kind: 'video', id: match[1], page: Number.isSafeInteger(page) && page > 0 ? page : 1, url: `https://www.bilibili.com/video/${match[1]}/` };
    } catch { return null; }
  }
  function normalize(raw = {}) {
    const library = raw.library || {};
    const result = { version: 1, teacherCategories: [], courseCategories: [], teachers: [], courses: [] };
    for (const kind of ['teacher', 'course']) {
      const key = `${kind}Categories`;
      const categories = Array.isArray(library[key]) ? library[key] : [];
      result[key] = categories.filter(item => typeof item.id === 'string' && typeof item.name === 'string' && item.name.trim()).map(item => ({ id: item.id, name: item.name }));
      if (!result[key].length) result[key] = [{ ...DEFAULT_CATEGORY }];
      const items = library[`${kind}s`] || raw[`${kind}s`] || [];
      result[`${kind}s`] = items.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string').map(item => ({ ...item,
        categoryId: result[key].some(category => category.id === item.categoryId) ? item.categoryId : result[key][0].id,
        ...(kind === 'teacher' ? { avatar: imageUrl(item.avatar) } : { cover: imageUrl(item.cover) })
      }));
    }
    return result;
  }
  function mutate(current, action) {
    const state = structuredClone(current);
    const kind = action.kind;
    if (!['teacher', 'course'].includes(kind)) throw new Error('无效的收藏类型。');
    const items = `${kind}s`, categories = `${kind}Categories`;
    if (action.type === 'category.add') {
      const name = String(action.name || '').trim().slice(0, 30);
      if (!name) throw new Error('请填写分类名称。');
      if (state[categories].some(item => item.name === name)) throw new Error('分类名称已存在。');
      state[categories].push({ id: action.id, name });
    } else if (action.type === 'category.remove') {
      if (state[categories].length <= 1) throw new Error('至少保留一个分类。');
      if (!state[categories].some(item => item.id === action.id)) throw new Error('分类不存在。');
      state[categories] = state[categories].filter(item => item.id !== action.id);
      state[items] = state[items].filter(item => item.categoryId !== action.id);
    } else if (action.type === 'category.move') {
      const index = state[categories].findIndex(item => item.id === action.id);
      if (index < 0) throw new Error('分类不存在。');
      if (action.direction !== -1 && action.direction !== 1) throw new Error('无效的移动方向。');
      const next = index + action.direction;
      if (next < 0 || next >= state[categories].length) return state;
      [state[categories][index], state[categories][next]] = [state[categories][next], state[categories][index]];
    } else if (action.type === 'item.save') {
      const item = action.item;
      if (!item || !String(item.name || '').trim()) throw new Error('请填写名称。');
      if (!state[categories].some(category => category.id === item.categoryId)) throw new Error('请选择有效分类；分类可能已被其他标签页删除。');
      if (kind === 'teacher' && !/^[1-9]\d{0,19}$/.test(item.id)) throw new Error('老师 UID 无效。');
      if (kind === 'course' && !(/^(?:BV[0-9A-Za-z]{10}|av[1-9]\d*|ss[1-9]\d*)$/.test(item.id))) throw new Error('课程链接无效。');
      const previous = state[items].find(entry => entry.id === item.id || (kind === 'course' && item.aid && entry.aid === item.aid));
      const saved = { ...previous, ...item, name: item.name.trim().slice(0, 100) };
      if (kind === 'teacher') saved.avatar = imageUrl(item.avatar) || previous?.avatar || '';
      else {
        saved.cover = imageUrl(item.cover) || previous?.cover || '';
        saved.lastPage = previous?.lastPage || null;
        saved.lastEpisodeId = previous?.lastEpisodeId || null;
        saved.pageCount = Math.max(1, Number(item.pageCount) || previous?.pageCount || 1);
      }
      state[items] = state[items].filter(entry => entry !== previous);
      state[items].push(saved);
    } else if (action.type === 'item.edit') {
      const item = state[items].find(entry => entry.id === action.id);
      if (!item) throw new Error('收藏已被删除，请刷新后重试。');
      const name = String(action.name || '').trim();
      if (!name) throw new Error('名称不能为空。');
      if (!state[categories].some(category => category.id === action.categoryId)) throw new Error('请选择有效分类。');
      item.name = name.slice(0, kind === 'teacher' ? 40 : 100);
      item.categoryId = action.categoryId;
    } else if (action.type === 'item.remove') {
      state[items] = state[items].filter(item => item.id !== action.id);
    } else if (action.type === 'teacher.avatar' && kind === 'teacher') {
      const item = state.teachers.find(item => item.id === action.id);
      if (item && imageUrl(action.avatar)) item.avatar = imageUrl(action.avatar);
    } else if (action.type === 'course.metadata' && kind === 'course') {
      const item = state.courses.find(item => item.id === action.id);
      if (item) {
        if (imageUrl(action.cover)) item.cover = imageUrl(action.cover);
        if (Number.isSafeInteger(action.pageCount) && action.pageCount > item.pageCount) item.pageCount = action.pageCount;
        if (!item.firstEpisodeId && /^[1-9]\d*$/.test(String(action.firstEpisodeId || ''))) item.firstEpisodeId = String(action.firstEpisodeId);
      }
    } else if (action.type === 'course.progress' && kind === 'course') {
      const item = state.courses.find(item => item.id === action.id || `av${item.aid}` === action.id);
      if (item && Number.isSafeInteger(action.page) && action.page >= 1 && action.page <= item.pageCount) {
        item.lastPage = action.page;
        if (/^ss[1-9]\d*$/.test(item.id) && /^[1-9]\d*$/.test(String(action.episodeId || ''))) item.lastEpisodeId = String(action.episodeId);
      }
    } else throw new Error('不支持的操作。');
    return state;
  }
  globalThis.Library = { normalize, mutate, courseUrl, imageUrl };
})();
