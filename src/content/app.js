(() => {
  const home = 'https://www.bilibili.com/';
  // An exit confirmed on a page whose script an extension update had already cut off can no
  // longer reach the extension; the fresh page completes the exit the user confirmed.
  try {
    if (sessionStorage.getItem('study-exit-intent') === '1') {
      sessionStorage.removeItem('study-exit-intent');
      chrome.storage.local.set({ focusMode: false }).catch(() => {});
    }
  } catch {}
  let state = Library.normalize(), loaded = false, lastUrl = '', mounted = null;
  let palette = 'blue', appearance = 'system', focusMode = true, modeReady = false;
  const avatarAttempts = new Set();
  const classroomCoverAttempts = new Set();
  let lastProgress = '', progressBusy = false;
  const skippedClassroomEpisodes = new Set();
  // A page opened before an extension update keeps its old script, which Chrome cuts off from
  // the extension. No retry can reach it again, so recover by reloading the page.
  function reloadForUpdate(error) {
    if (!/Extension context invalidated/.test(error?.message || '')) return false;
    FocusUI.notice('插件已更新，正在刷新页面…');
    setTimeout(() => location.reload(), 2000);
    return true;
  }
  async function rpc(type, payload = {}) {
    let response;
    try {
      response = await chrome.runtime.sendMessage({ channel: 'bili-focus', type, ...payload });
    } catch (error) {
      if (!reloadForUpdate(error)) throw new Error('插件连接已更新，请刷新页面后重试。');
      // Remember a confirmed exit so the reloaded page can complete it.
      if (type === 'mode.set' && payload.focusMode === false) {
        try { sessionStorage.setItem('study-exit-intent', '1'); } catch {}
      }
      throw new Error('插件已更新，页面即将自动刷新。');
    }
    if (!response?.ok) throw new Error(response?.error || '插件连接已更新，请刷新页面后重试。');
    return response.data;
  }
  function refresh() {
    if (mounted?.isConnected) ui.render(mounted);
    updateTeacherButton();
  }
  async function mutate(action) {
    state = await rpc('library.mutate', { action }); refresh(); return state;
  }
  const ui = FocusUI.create({
    getState: () => state, mutate, metadata: (kind, url) => rpc('metadata', { kind, url }),
    replace: async backup => {
      const imported = await rpc('library.import', { backup });
      state = imported.library;
      if (Object.keys(imported.preferences).length) await chrome.storage.local.set(imported.preferences);
      refresh(); return imported;
    },
    getAppearance: () => ({ palette, theme: appearance }),
    saveAppearance: async (key, value) => {
      try { await chrome.storage.local.set({ [key]: value }); }
      catch (error) {
        if (reloadForUpdate(error)) throw new Error('插件已更新，页面即将自动刷新。');
        throw error;
      }
    }
  });
  function applyAppearance() {
    if (!document.documentElement) return;
    if (!focusMode || !modeReady || !loaded) {
      delete document.documentElement.dataset.studyPalette;
      delete document.documentElement.dataset.studyAppearance;
      return;
    }
    document.documentElement.dataset.studyPalette = palette;
    document.documentElement.dataset.studyAppearance = appearance;
  }
  function teacherAvatar() {
    const img = document.querySelector('.upinfo-avatar img, .space-avatar img, #h-avatar, .h-avatar img');
    return Library.imageUrl(img?.currentSrc || img?.src);
  }
  function updateTeacherButton() {
    const button = document.querySelector('#study-save-teacher'); if (!button) return;
    const id = Study.teacherId(location.href), saved = state.teachers.some(item => item.id === id);
    button.disabled = !loaded;
    button.textContent = saved ? '已收藏 · 点击取消' : '收藏老师'; button.setAttribute('aria-pressed', String(saved));
  }
  function mount(kind) {
    if (!document.body || !loaded) return;
    if (kind === 'home' && !mounted?.isConnected) {
      mounted = FocusUI.el('main', '', 'study-home'); mounted.id = 'study-home';
      document.body.prepend(mounted); ui.render(mounted);
      for (const teacher of state.teachers.filter(item => !item.avatar)) {
        if (avatarAttempts.has(teacher.id)) continue;
        avatarAttempts.add(teacher.id);
        rpc('metadata', { kind: 'teacher', url: teacher.id }).then(data => {
          if (data.avatar) return mutate({ type: 'teacher.avatar', kind: 'teacher', id: teacher.id, avatar: data.avatar });
        }).catch(() => {}); // Initial-letter fallback is intentional for unavailable public artwork.
      }
      for (const course of state.courses.filter(item => /^ss[1-9]\d*$/.test(item.id) && !item.cover)) {
        if (classroomCoverAttempts.has(course.id)) continue;
        classroomCoverAttempts.add(course.id);
        rpc('metadata', { kind: 'course', url: `https://www.bilibili.com/cheese/play/${course.id}` })
          .then(data => mutate({ type: 'course.metadata', kind: 'course', id: course.id,
            cover: data.cover, pageCount: data.pageCount, firstEpisodeId: data.firstEpisodeId }))
          .catch(() => {}); // Keep the existing card when B站 artwork is unavailable.
      }
    }
    // Place the library immediately after the visible header, inside its page wrapper.
    // Putting it after the wrapper leaves a viewport-sized blank area above the library.
    if (kind === 'home' && mounted?.isConnected) {
      const header = document.querySelector('.bili-header, .international-header, header');
      if (header && header.nextElementSibling !== mounted) header.after(mounted);
      else if (!header && mounted.parentElement !== document.body) document.body.prepend(mounted);
    }
    if (kind === 'teacher') {
      if (!document.querySelector('#study-save-teacher')) {
        const anchor = document.querySelector('.upinfo-detail, .h-action, .space-header .info, .h-info');
        if (!anchor) return;
        const button = FocusUI.el('button', '收藏老师', 'study-primary'); button.type = 'button'; button.id = 'study-save-teacher';
        button.onclick = async () => {
          const id = Study.teacherId(location.href); if (!id || button.disabled) return;
          if (state.teachers.some(item => item.id === id)) {
            button.disabled = true;
            try { await mutate({ type: 'item.remove', kind: 'teacher', id }); }
            catch (e) { FocusUI.notice(e.message); }
            finally { updateTeacherButton(); }
          } else {
            const name = document.querySelector('#h-name, .upinfo-detail .nickname, .up-name')?.textContent?.trim() || '';
            ui.addItem('teacher', { id, name: name.slice(0,40), avatar: teacherAvatar() });
          }
        };
        anchor.append(button);
      }
      updateTeacherButton();
      const id = Study.teacherId(location.href), avatar = teacherAvatar(), saved = state.teachers.find(item => item.id === id);
      if (saved && avatar && avatar !== saved.avatar && !avatarAttempts.has(`${id}:${avatar}`)) {
        avatarAttempts.add(`${id}:${avatar}`); mutate({ type: 'teacher.avatar', kind: 'teacher', id, avatar }).catch(e => FocusUI.notice(e.message));
      }
    }
  }
  function captureProgress() {
    const parsed = Library.courseUrl(location.href); if (!loaded || !parsed || progressBusy) return;
    const video = document.querySelector('video');
    if (!video || video.paused || video.currentTime < 1) return;
    if (parsed.kind === 'cheese') {
      if (!parsed.episodeId || !state.courses.some(item => /^ss[1-9]\d*$/.test(item.id))) return;
      const key = `ep${parsed.episodeId}`;
      if (lastProgress === key || skippedClassroomEpisodes.has(key)) return;
      const currentUrl = location.href;
      progressBusy = true;
      rpc('metadata', { kind: 'course', url: currentUrl }).then(data => {
        if (location.href !== currentUrl) return;
        const saved = state.courses.find(item => item.id === data.id);
        if (!saved) { skippedClassroomEpisodes.add(key); return; }
        return mutate({ type: 'course.progress', kind: 'course', id: saved.id, page: data.page, episodeId: parsed.episodeId })
          .then(() => { lastProgress = key; });
      }).catch(e => { skippedClassroomEpisodes.add(key); FocusUI.notice(e.message); }).finally(() => { progressBusy = false; });
      return;
    }
    const saved = state.courses.find(item => item.id === parsed.id || `av${item.aid}` === parsed.id); if (!saved) return;
    const key = `${saved.id}:${parsed.page}`;
    if (lastProgress === key) return;
    progressBusy = true;
    // Courses can gain pages after being saved; refresh the page count once so progress on new pages is not dropped.
    const grow = parsed.page > (saved.pageCount || 1)
      ? rpc('metadata', { kind: 'course', url: `https://www.bilibili.com/video/${saved.id}/` })
        .then(data => mutate({ type: 'course.metadata', kind: 'course', id: saved.id, cover: data.cover, pageCount: data.pageCount }))
        .catch(() => {}) // The page guard in Library.mutate still applies if this refresh fails.
      : Promise.resolve();
    grow.then(() => mutate({ type: 'course.progress', kind: 'course', id: saved.id, page: parsed.page }))
      .then(() => { lastProgress = key; })
      .catch(e => FocusUI.notice(e.message)).finally(() => { progressBusy = false; });
  }
  function update() {
    if (!document.documentElement || !modeReady) return;
    FocusHeader.modeSwitch(focusMode, toggleMode);
    if (!focusMode || !loaded) return;
    applyAppearance();
    const kind = Study.route(location.href);
    if (lastUrl !== location.href) {
      lastUrl = location.href; document.documentElement.dataset.studyPage = kind;
      if (kind === 'home' && location.href !== home) { location.replace(home); return; }
      if (kind === 'teacher' && !/^\/\d+\/(?:upload|video|channel|lists|pugv)(?:\/|$)/.test(location.pathname)) {
        location.replace(`https://space.bilibili.com/${Study.teacherId(location.href)}/upload/video`); return;
      }
      if (kind !== 'home') { mounted?.remove(); mounted = null; }
      lastProgress = '';
    }
    FocusHeader.update(); mount(kind);
    for (const input of document.querySelectorAll('.nav-search-input, #nav-searchform input, .search-input-el')) {
      if (input.placeholder !== '搜索视频 / UP 主') input.placeholder = '搜索视频 / UP 主'; input.removeAttribute('title');
    }
    if (kind === 'video' || kind === 'cheese') captureProgress();
  }
  async function toggleMode() {
    if (focusMode) return FocusUI.confirmExit(() => rpc('mode.set', { focusMode: false }));
    try { await rpc('mode.set', { focusMode: true }); }
    catch (error) { FocusUI.notice(error.message || '模式切换失败，请重试。'); }
  }
  function search(event) {
    if (!focusMode || !modeReady) return;
    const target = event.target;
    const container = target.closest?.('#nav-searchform, .nav-search, .nav-search-container, .search-input, .search-input-wrap, .search-form');
    if (!container) return;
    if (event.type === 'keydown' && event.key !== 'Enter') return;
    if (event.type === 'click' && !target.closest('.nav-search-btn, .nav-search-submit, .search-btn, button[type=submit]')) return;
    const input = container.querySelector('input'); if (!input) return;
    event.preventDefault(); event.stopImmediatePropagation(); if (input.value.trim()) location.href = Study.searchUrl(input.value);
  }
  for (const type of ['submit','keydown','click']) document.addEventListener(type, search, true);
  document.addEventListener('keydown', event => {
    if (!focusMode || !modeReady) return;
    if (['video','cheese'].includes(Study.route(location.href)) && event.key.toLowerCase() === 'd' && !event.target.closest?.('input,textarea,[contenteditable=true]')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('timeupdate', () => { if (focusMode && modeReady) captureProgress(); }, true);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.focusMode && modeReady && (changes.focusMode.newValue !== false) !== focusMode) { location.reload(); return; }
    if (changes.library) { state = Library.normalize({ library: changes.library.newValue }); skippedClassroomEpisodes.clear(); refresh(); }
    if (changes.palette) palette = changes.palette.newValue || 'blue';
    if (changes.theme) appearance = changes.theme.newValue || 'system';
    if (changes.palette || changes.theme) { applyAppearance(); refresh(); }
  });
  chrome.storage.local.get({ palette: 'blue', theme: 'system', focusMode: true }).then(async prefs => {
    focusMode = prefs.focusMode !== false; modeReady = true;
    palette = prefs.palette; appearance = prefs.theme;
    if (focusMode) {
      state = Library.normalize(await chrome.storage.local.get(['library', 'teachers', 'courses']));
      loaded = true;
      // A delayed or failed service worker must not leave the homepage empty.
      rpc('library.read').catch(() => {});
    }
    applyAppearance(); update();
  }).catch(error => {
    const show = () => FocusUI.notice(reloadForUpdate(error) ? '插件已更新，页面即将自动刷新。' : error.message);
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, { once: true });
  });
  update(); document.addEventListener('DOMContentLoaded', update, { once: true });
  // React to page changes instead of a fast poll; a slow interval covers anything the observer misses.
  let scheduled = false;
  const scheduleUpdate = () => {
    if (scheduled || document.hidden) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; update(); }, 100);
  };
  const watch = () => new MutationObserver(scheduleUpdate).observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) watch();
  else document.addEventListener('DOMContentLoaded', watch, { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleUpdate(); });
  setInterval(() => { if (!document.hidden) update(); }, 2000);
})();
