const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../src/core/library.js');
const add = (state, action) => Library.mutate(state, action);
test('migrates legacy teacher nicknames without losing favorites', () => {
  const state = Library.normalize({ teachers: [{ id: '123', name: '数学老师' }] });
  assert.equal(state.teachers[0].categoryId, 'default');
  assert.equal(state.teachers[0].name, '数学老师');
  assert.equal(state.teacherCategories.length, 1);
  assert.equal(state.courseCategories.length, 1);
  assert.deepEqual(Library.normalize({ library: state }), state);
});
test('category removal cascades only within its own collection; the final category is protected', () => {
  let state = Library.normalize();
  assert.throws(() => add(state, { type: 'category.remove', kind: 'teacher', id: 'default' }), /至少/);
  state = add(state, { type: 'category.add', kind: 'teacher', id: 'math', name: '数学' });
  state = add(state, { type: 'item.save', kind: 'teacher', item: { id: '123', name: '老师', categoryId: 'math' } });
  state = add(state, { type: 'item.save', kind: 'course', item: { id: 'BV1GJ411x7h7', name: '课程', categoryId: 'default', pageCount: 5 } });
  state = add(state, { type: 'category.remove', kind: 'teacher', id: 'math' });
  assert.equal(state.teachers.length, 0); assert.equal(state.courses.length, 1);
  assert.throws(() => add(state, { type: 'item.save', kind: 'teacher', item: { id: '123', name: '老师', categoryId: 'math' } }), /分类/);
});
test('course categories are independent and cascade; empty and duplicate categories are rejected', () => {
  let state = Library.normalize();
  assert.throws(() => add(state, { type: 'category.add', kind: 'course', id: 'x', name: ' ' }), /名称/);
  assert.throws(() => add(state, { type: 'category.add', kind: 'course', id: 'x', name: '未分类' }), /已存在/);
  state = add(state, { type: 'category.add', kind: 'course', id: 'math', name: '数学' });
  state = add(state, { type: 'item.save', kind: 'course', item: { id: 'BV1GJ411x7h7', name: '课', categoryId: 'math' } });
  state = add(state, { type: 'category.remove', kind: 'course', id: 'math' });
  assert.equal(state.courses.length, 0); assert.equal(state.teacherCategories.length, 1);
});
test('re-saving a course preserves watched P; av progress updates the canonical BV course', () => {
  let state = Library.normalize(); const item = { id: 'BV1GJ411x7h7', aid: 1234, name: '课', categoryId: 'default', pageCount: 6 };
  state = add(state, { type: 'item.save', kind: 'course', item });
  state = add(state, { type: 'course.progress', kind: 'course', id: 'av1234', page: 4 });
  state = add(state, { type: 'item.save', kind: 'course', item });
  assert.equal(state.courses.length, 1); assert.equal(state.courses[0].lastPage, 4);
  state = add(state, { type: 'course.progress', kind: 'course', id: item.id, page: 99 });
  assert.equal(state.courses[0].lastPage, 4);
});
test('course URLs and artwork reject lookalike hosts, scripts and invalid IDs', () => {
  assert.equal(Library.courseUrl('https://www.bilibili.com/video/BV1GJ411x7h7/?p=3').page, 3);
  assert.deepEqual(Library.courseUrl('https://www.bilibili.com/cheese/play/ep172445?spm_id_from=test'), {
    kind: 'cheese', id: 'ep172445', episodeId: '172445', seasonId: null,
    url: 'https://www.bilibili.com/cheese/play/ep172445'
  });
  assert.equal(Library.courseUrl('https://www.bilibili.com/cheese/play/ss4372').seasonId, '4372');
  assert.equal(Library.courseUrl('https://bilibili.com/video/av123/?p=-1').page, 1);
  for (const value of ['https://www.bilibili.com.evil.test/video/av123','javascript:alert(1)','https://b23.tv/abc','https://www.bilibili.com/video/BVbad','https://www.bilibili.com/cheese/play/ep0','https://www.bilibili.com/cheese/play/ep12wrong']) assert.equal(Library.courseUrl(value), null);
  assert.equal(Library.imageUrl('//i0.hdslb.com/bfs/face/abc.jpg'), 'https://i0.hdslb.com/bfs/face/abc.jpg');
  assert.equal(Library.imageUrl('https://archive.biliimg.com/bfs/archive/b812154ed17681ea67748ec936467ac6e5f3688a.jpg'), 'https://archive.biliimg.com/bfs/archive/b812154ed17681ea67748ec936467ac6e5f3688a.jpg');
  assert.equal(Library.imageUrl('https://archive.biliimg.com/bfs/archive/42ddc1dd232321ab61ef321ee036e2c936fcd4dd.jpg'), 'https://archive.biliimg.com/bfs/archive/42ddc1dd232321ab61ef321ee036e2c936fcd4dd.jpg');
  assert.equal(Library.imageUrl('https://hdslb.com.evil.test/img.png'), '');
  assert.equal(Library.imageUrl('https://biliimg.com.evil.test/img.png'), '');
});
test('classroom courses keep episode progress and reopen the watched lesson', () => {
  let state = Library.normalize();
  const item = { id: 'ss4372', name: '清史', categoryId: 'default', pageCount: 21, firstEpisodeId: '172445', startEpisodeId: '172532' };
  state = add(state, { type: 'item.save', kind: 'course', item });
  state = add(state, { type: 'course.progress', kind: 'course', id: item.id, page: 2, episodeId: '172532' });
  state = add(state, { type: 'item.save', kind: 'course', item });
  assert.equal(state.courses[0].lastPage, 2);
  assert.equal(state.courses[0].lastEpisodeId, '172532');
  state.courses[0].cover = '';
  state = add(state, { type: 'course.metadata', kind: 'course', id: item.id,
    cover: 'https://archive.biliimg.com/bfs/archive/cover.jpg', pageCount: 22 });
  assert.equal(state.courses[0].cover, 'https://archive.biliimg.com/bfs/archive/cover.jpg');
  assert.equal(state.courses[0].pageCount, 22);
  assert.equal(state.courses[0].lastEpisodeId, '172532');
});
test('teacher toggle removal and re-add do not create duplicates', () => {
  let state = Library.normalize(); const item = { id: '123', name: '昵称', categoryId: 'default' };
  state = add(state, { type: 'item.save', kind: 'teacher', item });
  state = add(state, { type: 'item.save', kind: 'teacher', item });
  assert.equal(state.teachers.length, 1);
  state = add(state, { type: 'item.remove', kind: 'teacher', id: '123' });
  assert.equal(state.teachers.length, 0);
});
test('editing changes only name/category and cannot revive a deleted favorite', () => {
  let state = Library.normalize();
  state = add(state, { type: 'category.add', kind: 'course', id: 'math', name: '数学' });
  state = add(state, { type: 'item.save', kind: 'course', item: { id: 'BV1GJ411x7h7', name: '旧名字', categoryId: 'default', pageCount: 5, cover: 'https://i0.hdslb.com/cover.jpg' } });
  state = add(state, { type: 'course.progress', kind: 'course', id: 'BV1GJ411x7h7', page: 3 });
  state = add(state, { type: 'item.edit', kind: 'course', id: 'BV1GJ411x7h7', name: ' 新名字 ', categoryId: 'math' });
  assert.equal(state.courses[0].name, '新名字'); assert.equal(state.courses[0].categoryId, 'math');
  assert.equal(state.courses[0].lastPage, 3); assert.equal(state.courses[0].cover, 'https://i0.hdslb.com/cover.jpg');
  assert.throws(() => add(state, { type: 'item.edit', kind: 'course', id: 'BV1GJ411x7h7', name: ' ', categoryId: 'math' }), /不能为空/);
  assert.throws(() => add(state, { type: 'item.edit', kind: 'course', id: 'BV1GJ411x7h7', name: '新', categoryId: 'gone' }), /分类/);
  state = add(state, { type: 'item.remove', kind: 'course', id: 'BV1GJ411x7h7' });
  assert.throws(() => add(state, { type: 'item.edit', kind: 'course', id: 'BV1GJ411x7h7', name: '新', categoryId: 'math' }), /已被删除/);
});
