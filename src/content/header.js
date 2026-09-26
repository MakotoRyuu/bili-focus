(() => {
  const home = 'https://www.bilibili.com/';
  const refreshHome = `${home}#study-refresh-once`;
  if (location.href === refreshHome) {
    // Consume before reloading, including when the user opens the link in a new tab.
    history.replaceState(history.state, '', home);
    const reload = () => location.reload();
    if (document.readyState === 'complete') reload();
    else window.addEventListener('load', reload, { once: true });
  }
  const headerSelector = '.bili-header__bar, .bili-mini-header__content, .international-header .mini-header';
  const primed = new WeakSet();
  function homeLink() {
    const link = document.createElement('a'); link.href = refreshHome; link.className = 'study-home-entry home-page-entry'; link.setAttribute('aria-label', '返回主页'); link.title = '返回主页';
    // Bilibili's familiar TV silhouette, rendered locally without external assets.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '30'); svg.setAttribute('height', '30'); svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('viewBox', '0 0 18 18');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', "M3.73252 2.67094C3.33229 2.28484 3.33229 1.64373 3.73252 1.25764C4.11291 0.890684 4.71552 0.890684 5.09591 1.25764L7.21723 3.30403C7.27749 3.36218 7.32869 3.4261 7.37081 3.49407H10.5789C10.6211 3.4261 10.6723 3.36218 10.7325 3.30403L12.8538 1.25764C13.2342 0.890684 13.8368 0.890684 14.2172 1.25764C14.6175 1.64373 14.6175 2.28484 14.2172 2.67094L13.364 3.49407H14C16.2091 3.49407 18 5.28493 18 7.49407V12.9996C18 15.2087 16.2091 16.9996 14 16.9996H4C1.79086 16.9996 0 15.2087 0 12.9996V7.49406C0 5.28492 1.79086 3.49407 4 3.49407H4.58579L3.73252 2.67094ZM4 5.42343C2.89543 5.42343 2 6.31886 2 7.42343V13.0702C2 14.1748 2.89543 15.0702 4 15.0702H14C15.1046 15.0702 16 14.1748 16 13.0702V7.42343C16 6.31886 15.1046 5.42343 14 5.42343H4ZM5 9.31747C5 8.76519 5.44772 8.31747 6 8.31747C6.55228 8.31747 7 8.76519 7 9.31747V10.2115C7 10.7638 6.55228 11.2115 6 11.2115C5.44772 11.2115 5 10.7638 5 10.2115V9.31747ZM12 8.31747C11.4477 8.31747 11 8.76519 11 9.31747V10.2115C11 10.7638 11.4477 11.2115 12 11.2115C12.5523 11.2115 13 10.7638 13 10.2115V9.31747C13 8.76519 12.5523 8.31747 12 8.31747Z"); path.setAttribute('fill', 'currentColor'); svg.append(path); link.append(svg); return link;
  }
  function sourceInfo(source) {
    const panel = source.querySelector('.v-popover-content, .avatar-panel, .header-avatar-panel, .header-entry-popover');
    const name = panel?.querySelector('.nickname, .nickname-item, [class*="nickname"], [class*="username"], [class*="user-name"], a[href*="space.bilibili.com"]')?.textContent.trim();
    const logout = panel && [...panel.querySelectorAll('a,button,span,div,[role=menuitem]')].find(node => /^(退出登录|退出登陆|退出)$/.test(node.textContent.trim()) && ![...node.children].some(child => /^(退出登录|退出登陆|退出)$/.test(child.textContent.trim())));
    return { name, logout };
  }
  function updateAccount(header) {
    const right = header.querySelector('.right-entry__main, .right-entry'); if (!right) return;
    const guest = right.querySelector('.header-avatar-unlogin-wrap');
    const source = guest || right.querySelector('.header-avatar-wrap, .header-avatar, .header-entry-mini'); if (!source) return;
    source.classList.add('study-native-account-source');
    let account = right.querySelector('.study-account-inline');
    if (!account) {
      account = document.createElement('div'); account.className = 'study-account-inline'; right.append(account);
    }
    const loggedIn = !guest;
    if (account.dataset.loggedIn !== String(loggedIn)) {
      account.replaceChildren(); account.dataset.loggedIn = String(loggedIn);
      if (guest) {
        const login = document.createElement('button'); login.type = 'button'; login.textContent = '登录'; login.className = 'study-account-login';
        login.onclick = () => { const current = right.querySelector('.header-avatar-unlogin-wrap'); (current?.querySelector('.header-avatar-unlogin-entry, .header-avatar-unlogin-inner, a, button') || current)?.click(); }; account.append(login);
      } else {
        const name = document.createElement('span'); name.className = 'study-account-name'; name.textContent = '账号加载中';
        const logout = document.createElement('button'); logout.type = 'button'; logout.className = 'study-account-exit'; logout.textContent = '退出登录'; logout.disabled = true;
        logout.onclick = () => { const current = right.querySelector('.header-avatar-wrap, .header-avatar, .header-entry-mini'); const action = current && sourceInfo(current).logout; if (action) action.click(); };
        account.append(name, logout);
      }
    }
    if (loggedIn) {
      const info = sourceInfo(source);
      if (info.name) { account.querySelector('.study-account-name').textContent = info.name; account.querySelector('.study-account-name').title = info.name; }
      account.querySelector('.study-account-exit').disabled = !info.logout;
      // Native account menus are lazy-mounted. Mount once offscreen, retaining the site's logout handler.
      if ((!info.name || !info.logout) && !primed.has(source)) {
        primed.add(source);
        for (const node of [source, ...source.querySelectorAll('.v-popover-wrap')]) node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      }
    }
  }
  function update() {
    const headers = document.querySelectorAll(headerSelector);
    if (document.body && !headers.length && !document.querySelector('#study-home-fallback')) { const link = homeLink(); link.id = 'study-home-fallback'; document.body.append(link); }
    if (headers.length) document.querySelector('#study-home-fallback')?.remove();
    for (const header of headers) {
      header.classList.add('study-native-header');
      if (!header.querySelector('.study-home-entry')) { const left = header.querySelector('.left-entry-main, .left-entry, .nav-con'); if (left) left.prepend(homeLink()); else header.prepend(homeLink()); }
      if (Study.route(location.href) === 'search') header.querySelector('.study-account-inline')?.remove();
      else updateAccount(header);
    }
  }
  // Prevent native delegated navigation from adding tracking or using its SPA router.
  document.addEventListener('click', event => {
    const link = event.target.closest?.('.study-home-entry');
    if (!link) return;
    event.stopImmediatePropagation();
    if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      const alreadyHome = location.origin + location.pathname + location.search === home;
      location.assign(refreshHome);
      // A fragment-only navigation does not load a new document.
      if (alreadyHome) location.reload();
    }
  }, true);
  globalThis.FocusHeader = { update };
})();
