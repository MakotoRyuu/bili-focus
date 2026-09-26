(() => {
  const headerSelector = '.bili-header__bar, .bili-mini-header__content, .international-header .mini-header';
  const loggedAvatarSelector = '.header-avatar-wrap, .header-avatar, .header-entry-mini';
  function cleanMenu(panel) {
    panel.classList.add('study-account-menu');
    const nickname = panel.querySelector('.nickname, .nickname-item, [class*="nickname"], [class*="username"], [class*="user-name"], a[href*="space.bilibili.com"]');
    const logout = [...panel.querySelectorAll('a,button,span,div,[role=menuitem]')].find(node => /^(退出登录|退出登陆|退出)$/.test(node.textContent.trim()) && ![...node.children].some(child => /^(退出登录|退出登陆|退出)$/.test(child.textContent.trim())));
    const keep = [nickname, logout].filter(Boolean);
    for (const branch of panel.querySelectorAll('.study-account-branch')) branch.classList.remove('study-account-branch');
    // Unknown/new menu layouts stay hidden rather than exposing their recommendations.
    panel.dataset.studyReady = keep.length ? 'true' : 'false';
    for (const node of panel.querySelectorAll('[data-study-keep]')) node.removeAttribute('data-study-keep');
    for (const node of keep) {
      node.dataset.studyKeep = 'true';
      for (const child of node.querySelectorAll('*')) child.dataset.studyKeep = 'true';
      let parent = node.parentElement;
      while (parent && parent !== panel) { parent.dataset.studyKeep = 'true'; parent.classList.add('study-account-branch'); parent = parent.parentElement; }
    }
    if (nickname) nickname.classList.add('study-account-nickname');
    if (logout) logout.classList.add('study-account-logout');
  }
  function update() {
    const headers = document.querySelectorAll(headerSelector);
    if (document.body && !headers.length && !document.querySelector('#study-home-fallback')) {
      const back = document.createElement('a'); back.href = 'https://www.bilibili.com/'; back.textContent = '返回主页'; back.id = 'study-home-fallback'; back.className = 'study-home-entry'; document.body.append(back);
    }
    if (headers.length) document.querySelector('#study-home-fallback')?.remove();
    for (const header of headers) {
      header.classList.add('study-native-header');
      const left = header.querySelector('.left-entry-main, .left-entry, .nav-con');
      if (!header.querySelector('.study-home-entry')) {
        const link = document.createElement('a'); link.href = 'https://www.bilibili.com/'; link.textContent = '返回主页'; link.className = 'study-home-entry home-page-entry';
        if (left) left.prepend(link); else header.prepend(link);
      }
      for (const avatar of header.querySelectorAll(loggedAvatarSelector)) {
        if (avatar.closest('.header-avatar-unlogin-wrap')) continue;
        const trigger = [...avatar.querySelectorAll('.study-avatar-trigger, a[href*="space.bilibili.com"], .header-avatar__face, .header-entry-avatar')].find(node => !node.closest('.v-popover-content, .avatar-panel, .header-avatar-panel, .header-entry-popover'));
        if (trigger) {
          trigger.classList.add('study-avatar-trigger');
          trigger.removeAttribute('href'); trigger.setAttribute('role', 'button'); trigger.setAttribute('aria-label', '个人账号'); trigger.tabIndex = 0;
        }
        for (const panel of avatar.querySelectorAll('.v-popover-content, .avatar-panel, .header-avatar-panel, .header-entry-popover')) {
          // Use the outer menu container only, not nested popover containers.
          if (!panel.parentElement.closest('.study-account-menu')) cleanMenu(panel);
        }
      }
    }
  }
  function blockAvatarNavigation(event) {
    if (event.type === 'keydown' && !['Enter',' '].includes(event.key)) return;
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    const avatar = target?.closest(loggedAvatarSelector);
    if (!avatar || !avatar.closest(headerSelector) || avatar.closest('.header-avatar-unlogin-wrap')) return;
    const panel = target.closest('.study-account-menu');
    if (panel && !target.closest('.study-account-nickname') && !target.closest('a[href*="space.bilibili.com"]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }
  for (const type of ['click','auxclick','keydown']) window.addEventListener(type, blockAvatarNavigation, true);
  globalThis.FocusHeader = { update };
})();
