import test from 'node:test'
import assert from 'node:assert/strict'
import { configurePlatform } from '../utils/platform/index.js'
import { applyScriptEdits } from '../utils/ai/scriptEditing.js'

const storage = new Map()
configurePlatform({ openSocket() {}, getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) })
const { createScriptTools } = await import('../utils/ai/scriptTools.js')
const { getStoredScript, saveStoredScript } = await import('../utils/ai/scriptStore.js')
const tools = new Map(createScriptTools().map(tool => [tool.name, tool]))
const call = async (name, params) => (await tools.get(name).execute('test', params)).details

test('exact edits preserve unrelated code and apply sequentially, including literal replacement characters', () => {
  const original = 'const a = 1;\nconst b = 2;\nexports.main = () => a + b;'
  const result = applyScriptEdits(original, [
    { oldText: 'const a = 1;', newText: 'const a = 3;' },
    { oldText: 'const a = 3;', newText: 'const a = "$&";' }
  ])
  assert.equal(result.source, 'const a = "$&";\nconst b = 2;\nexports.main = () => a + b;')
  assert.equal(result.changes.length, 2)
})

test('rejects absent, ambiguous, overlapping matches and invalid batches', () => {
  assert.throws(() => applyScriptEdits('aaa', [{ oldText: 'aa', newText: 'b' }]), /匹配多处/)
  assert.throws(() => applyScriptEdits('abc', [{ oldText: 'x', newText: '' }]), /未找到/)
  assert.throws(() => applyScriptEdits('abc', [{ oldText: '', newText: 'x' }]), /不能为空/)
  for (const edits of [null, [], Array(51).fill({}), [{}]]) assert.throws(() => applyScriptEdits('abc', edits))
})

test('line edits replace, insert, append and delete while preserving CRLF', () => {
  const result = applyScriptEdits('a\r\nb\r\nc', [
    { startLine: 2, endLine: 2, oldText: 'b', newText: 'B\nBB\n' },
    { startLine: 1, endLine: 0, oldText: '', newText: 'first' },
    { startLine: 6, endLine: 5, oldText: '', newText: 'last' },
    { startLine: 3, endLine: 4, oldText: 'B\r\nBB', newText: '' }
  ])
  assert.equal(result.source, 'first\r\na\r\nc\r\nlast')
  assert.throws(() => applyScriptEdits('a\nb', [{ startLine: 2, endLine: 2, oldText: 'wrong', newText: 'B' }]), /不匹配/)
  for (const range of [{ startLine: 0, endLine: 1 }, { startLine: 4, endLine: 3 }, { startLine: 2 }, { endLine: 2 }, { startLine: 2.5, endLine: 2 }]) {
    assert.throws(() => applyScriptEdits('a\nb', [{ ...range, oldText: '', newText: 'B' }]), /范围无效/)
  }
})

test('reads line ranges with version, raw source and optional display line numbers', async () => {
  const script = saveStoredScript({ name: 'range', source: 'exports.main = () => {\r\n  return 1;\r\n};' })
  const read = await call('get_game_script', { scriptId: script.id, startLine: 2, endLine: 2, lineNumbers: true })
  assert.equal(read.source, '  return 1;')
  assert.equal(read.numberedSource, '2:   return 1;')
  assert.equal(read.updatedAt, script.updatedAt)
  assert.equal(read.totalLines, 3)
  assert.equal((await call('get_game_script', { scriptId: script.id })).source, script.source)
  await assert.rejects(call('get_game_script', { scriptId: script.id, endLine: 4 }), /范围无效/)
})

test('tool saves patches under the same ID, preserves metadata, returns compact results and executes revised code', async () => {
  const script = saveStoredScript({ name: 'patch-tool', description: 'keep description', source: 'exports.main = () => {\n  return 1;\n};' })
  const result = await call('edit_game_script', { scriptId: script.name, expectedUpdatedAt: script.updatedAt, edits: [
    { startLine: 2, endLine: 2, oldText: '  return 1;', newText: '  return 2;' }
  ] })
  const saved = getStoredScript(script.id)
  assert.equal(saved.description, script.description)
  assert.equal(saved.createdAt, script.createdAt)
  assert.equal(saved.id, script.id)
  assert.ok(saved.updatedAt > script.updatedAt)
  assert.equal(result.saved.updatedAt, saved.updatedAt)
  assert.equal(result.saved.source, undefined)
  assert.equal((await call('run_game_script', { scriptId: script.id })).result, 2)
  await assert.rejects(call('edit_game_script', { scriptId: script.id, expectedUpdatedAt: script.updatedAt, edits: [{ oldText: '2', newText: '3' }] }), /重新读取/)
  await assert.rejects(call('edit_game_script', { scriptId: script.id, edits: [{ oldText: '2', newText: '3' }] }), /缺少版本/)
})

test('failed batch, syntax, restrictions and size validation never persist partial edits', async () => {
  const script = saveStoredScript({ name: 'atomic', source: 'exports.main = () => 1;' })
  for (const edits of [
    [{ oldText: '1', newText: '2' }, { oldText: 'missing', newText: '3' }],
    [{ oldText: '1', newText: '(' }],
    [{ oldText: '1', newText: 'window.location' }],
    [{ oldText: '1', newText: '"' + 'a'.repeat(40000) + '"' }],
    [{ oldText: script.source, newText: '' }]
  ]) {
    await assert.rejects(call('edit_game_script', { scriptId: script.id, expectedUpdatedAt: script.updatedAt, edits }))
    assert.deepEqual(getStoredScript(script.id), script)
  }
  await assert.rejects(call('edit_game_script', { scriptId: 'missing', expectedUpdatedAt: 0, edits: [] }), /不存在/)
})

test('revision checks work even when two saves occur within the same millisecond', () => {
  const realNow = Date.now
  try {
    Date.now = () => 1000
    const script = saveStoredScript({ name: 'monotonic', source: 'exports.main = () => 1;' })
    const next = saveStoredScript({ ...script, expectedUpdatedAt: script.updatedAt, source: 'exports.main = () => 2;' })
    assert.equal(next.updatedAt, 1001)
    assert.throws(() => saveStoredScript({ ...script, expectedUpdatedAt: script.updatedAt }), /已被修改/)
  } finally { Date.now = realNow }
})
