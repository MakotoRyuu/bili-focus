(() => {
  const teacherId = value => {
    const input = String(value).trim();
    if (/^[1-9]\d{0,19}$/.test(input)) return input;
    try {
      const url = new URL(input);
      if (url.protocol !== 'https:' || url.hostname !== 'space.bilibili.com') return null;
      return url.pathname.match(/^\/([1-9]\d{0,19})(?:\/|$)/)?.[1] || null;
    } catch { return null; }
  };
  const route = value => {
    const url = new URL(value);
    if (url.hostname === 'search.bilibili.com') return 'search';
    if (url.hostname === 'space.bilibili.com' && /^\/[1-9]\d*(?:\/|$)/.test(url.pathname)) return 'teacher';
    if (url.hostname === 'www.bilibili.com' && /^\/video\/(?:BV[\w]+|av\d+)/i.test(url.pathname)) return 'video';
    return 'home';
  };
  const searchUrl = value => `https://search.bilibili.com/upuser?keyword=${encodeURIComponent(value.trim())}`;
  globalThis.Study = { teacherId, route, searchUrl };
})();
