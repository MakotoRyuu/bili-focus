(() => {
  const el = (tag, text = '', className = '') => {
    const node = document.createElement(tag); node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, action, className = '') => {
    const node = el('button', text, className); node.type = 'button'; node.onclick = action; return node;
  };
  function field(form, title, input) {
    const label = el('label', title); input.setAttribute('aria-label', title); label.append(input); form.append(label); return input;
  }
  function notice(message) {
    let node = document.querySelector('#study-status');
    if (!node) { node = el('p', '', 'study-status'); node.id = 'study-status'; node.setAttribute('role', 'status'); document.body.append(node); }
    node.textContent = message;
  }
  function dialog(title, build, submitText = '保存') {
    if (document.querySelector('.study-dialog')) return;
    const node = el('dialog', '', 'study-dialog'), form = el('form'), heading = el('h3', title);
    heading.id = 'study-dialog-title'; node.setAttribute('aria-labelledby', heading.id); form.append(heading);
    const error = el('p', '', 'study-form-error'); error.setAttribute('role', 'alert');
    const submit = el('button', submitText, 'study-primary'); submit.type = 'submit';
    const cancel = button('取消', () => node.close());
    const handler = build(form, error);
    const actions = el('div', '', 'study-actions'); actions.append(cancel, submit); form.append(error, actions); node.append(form);
    form.onsubmit = async event => {
      event.preventDefault(); if (submit.disabled) return;
      submit.disabled = true; cancel.disabled = true; error.textContent = '';
      try { await handler(); node.close(); }
      catch (failure) { error.textContent = failure.message || '保存失败，请重试。'; }
      finally { submit.disabled = false; cancel.disabled = false; }
    };
    node.addEventListener('cancel', event => { if (submit.disabled) event.preventDefault(); });
    node.addEventListener('close', () => node.remove()); document.body.append(node); node.showModal();
    return node;
  }
  function image(value, fallback, className) {
    const wrap = el('span', fallback, className);
    const url = Library.imageUrl(value);
    if (url) {
      const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.onload = () => { wrap.classList.add('study-image-loaded'); };
      img.onerror = () => { img.remove(); wrap.classList.remove('study-image-loaded'); };
      img.src = url; wrap.append(img);
    }
    return wrap;
  }
  function create({ getState, mutate, metadata, getAppearance, saveAppearance }) {
    const labels = { teacher: '老师', course: '课程' };
    function addCategory(kind) {
      dialog(`添加${labels[kind]}分类`, form => {
        const name = el('input'); name.required = true; name.maxLength = 30; field(form, '分类名称', name);
        return () => mutate({ type: 'category.add', kind, name: name.value });
      }, '添加分类');
    }
    function deleteCategory(kind, category) {
      const count = getState()[`${kind}s`].filter(item => item.categoryId === category.id).length;
      dialog('删除分类', form => {
        form.append(el('p', `删除「${category.name}」将一并移除其中的 ${count} 个${labels[kind]}收藏，无法撤销。`));
        return () => mutate({ type: 'category.remove', kind, id: category.id });
      }, '删除分类及收藏');
    }
    function categoryField(form, kind, selected = '') {
      const category = el('select'); category.required = true;
      const placeholder = el('option', '请选择分类'); placeholder.value = ''; placeholder.disabled = true; category.append(placeholder);
      for (const item of getState()[`${kind}Categories`]) { const option = el('option', item.name); option.value = item.id; category.append(option); }
      category.value = selected; field(form, '分类', category); return category;
    }
    function addItem(kind, teacher = null) {
      return dialog(teacher ? '填写老师昵称' : `添加${labels[kind]}`, form => {
        const body = el('div'); let url, name, category;
        form.append(body);
        function renderFields() {
          body.replaceChildren(); const isTeacher = kind === 'teacher';
          url = el('input'); url.required = true; url.placeholder = isTeacher ? 'https://space.bilibili.com/… 或 UID' : 'BV / av 视频或课堂 ep / ss 链接';
          if (!teacher) field(body, isTeacher ? '主页链接或 UID' : '课程链接', url);
          name = el('input'); name.maxLength = isTeacher ? 40 : 100; name.required = isTeacher; name.value = teacher?.name || '';
          field(body, isTeacher ? '昵称' : '课程名称（可选，默认使用课程标题）', name);
          category = categoryField(body, kind);
          body.append(el('p', '可先在首页「添加分类」中创建新的分类。', 'study-help'));
        }
        renderFields();
        return async () => {
          // Snapshot before awaiting metadata; changing the form cannot change an in-flight save.
          const savingKind = kind, categoryId = category.value, enteredName = name.value.trim(), enteredUrl = url.value;
          if (!categoryId) throw new Error('请选择分类。');
          if (savingKind === 'teacher' && !enteredName) throw new Error('昵称不能只包含空格。');
          const data = teacher || await metadata(savingKind, enteredUrl);
          await mutate({ type: 'item.save', kind: savingKind, item: { ...data, name: enteredName || data.name, categoryId } });
        };
      }, '确认收藏');
    }
    function editItem(kind, item) {
      dialog(`编辑${labels[kind]}`, form => {
        const name = el('input'); name.required = true; name.maxLength = kind === 'teacher' ? 40 : 100; name.value = item.name;
        field(form, kind === 'teacher' ? '昵称' : '课程名称', name);
        const category = categoryField(form, kind, item.categoryId);
        return () => mutate({ type: 'item.edit', kind, id: item.id, name: name.value, categoryId: category.value });
      }, '保存修改');
    }
    function settings() {
      const wrap = el('div', '', 'study-settings'); const { palette, theme } = getAppearance();
      for (const [key, title, choices, selected] of [
        ['palette', '主题', [['white','纯白'],['blue','B站蓝'],['pink','B站粉'],['black','曜黑'],['green','青绿']], palette],
        ['theme', '明暗', [['system','跟随系统'],['light','浅色'],['dark','深色']], theme]
      ]) {
        const select = el('select'); select.setAttribute('aria-label', title);
        for (const [id, text] of choices) { const option = el('option', text); option.value = id; select.append(option); }
        select.value = key === 'theme' && ['white','black'].includes(palette) ? (palette === 'black' ? 'dark' : 'light') : selected;
        select.disabled = key === 'theme' && ['white','black'].includes(palette);
        select.onchange = async () => { try { await saveAppearance(key, select.value); } catch (e) { select.value = selected; notice(e.message); } };
        const label = el('label', title); label.append(select); wrap.append(label);
      }
      return wrap;
    }
    function card(kind, item) {
      const teacher = kind === 'teacher', node = el('article', '', `study-card study-${kind}`), link = el('a');
      const classroom = !teacher && /^ss[1-9]\d*$/.test(item.id);
      link.href = teacher ? `https://space.bilibili.com/${item.id}/upload/video`
        : classroom ? `https://www.bilibili.com/cheese/play/ep${item.lastEpisodeId || item.startEpisodeId || item.firstEpisodeId}`
          : `https://www.bilibili.com/video/${item.id}/?p=${item.lastPage || 1}`;
      link.append(image(teacher ? item.avatar : item.cover, teacher ? item.name.slice(0,1) : '封面暂不可用', teacher ? 'study-avatar' : 'study-cover'), el('span', item.name, 'study-card-name'));
      const unit = classroom ? '课' : 'P';
      const detail = teacher ? '查看投稿与合集' : item.pageCount > 1 ? (item.lastPage ? `上次看到第 ${item.lastPage} ${unit} · 共 ${item.pageCount} ${unit}` : `尚未开始 · 共 ${item.pageCount} ${unit}`) : '打开课程';
      link.append(el('span', detail, 'study-card-detail'));
      const remove = button('移除', async () => { try { await mutate({ type: 'item.remove', kind, id: item.id }); } catch (e) { notice(e.message); } }, 'study-remove');
      const edit = button('⚙', () => editItem(kind, item), 'study-edit'); edit.setAttribute('aria-label', `编辑${labels[kind]} ${item.name}`); edit.title = '编辑名称和分类';
      remove.setAttribute('aria-label', `移除${labels[kind]} ${item.name}`); node.append(link, edit, remove); return node;
    }
    function render(root) {
      root.replaceChildren();
      for (const kind of ['course', 'teacher']) {
        const state = getState(), section = el('section', '', 'study-section'); section.dataset.collection = kind;
        const heading = el('div', '', 'study-heading'); heading.append(el('h2', kind === 'teacher' ? '我的老师' : '我的课程'));
        if (kind === 'course') heading.append(settings());
        heading.append(button('添加分类', () => addCategory(kind), 'study-secondary'));
        heading.append(button(`添加${labels[kind]}`, () => addItem(kind), 'study-primary'));
        section.append(heading);
        const categories = state[`${kind}Categories`];
        for (const [index, category] of categories.entries()) {
          const group = el('section', '', 'study-category'); group.dataset.category = category.id;
          const separator = el('div', '', 'study-category-heading'); separator.append(el('h3', category.name), el('span', '', 'study-divider'));
          const menu = el('details', '', 'study-category-menu');
          const trigger = el('summary', '分类操作');
          trigger.setAttribute('aria-label', `${category.name}的分类操作`);
          const actions = el('div', '', 'study-category-actions');
          const remove = button('删除分类', () => { menu.open = false; deleteCategory(kind, category); });
          remove.disabled = categories.length === 1; remove.title = remove.disabled ? '至少保留一个分类' : '同时移除该分类中的全部收藏'; actions.append(remove);
          for (const [label, direction, disabled] of [['上移', -1, index === 0], ['下移', 1, index === categories.length - 1]]) {
            const move = button(label, async () => {
              menu.open = false;
              try { await mutate({ type: 'category.move', kind, id: category.id, direction }); }
              catch (e) { notice(e.message); }
            });
            move.disabled = disabled;
            actions.append(move);
          }
          menu.append(trigger, actions); separator.append(menu);
          group.append(separator);
          const grid = el('div', '', 'study-grid');
          const items = state[`${kind}s`].filter(item => item.categoryId === category.id);
          if (!items.length) grid.append(el('p', `此分类还没有${labels[kind]}。`, 'study-empty'));
          for (const item of items) grid.append(card(kind, item));
          group.append(grid); section.append(group);
        }
        root.append(section);
      }
    }
    return { render, addItem };
  }
  globalThis.FocusUI = { create, el, notice };
})();
