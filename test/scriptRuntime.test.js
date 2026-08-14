import test from 'node:test'
import assert from 'node:assert/strict'
import { configurePlatform, resetPlatform } from '../utils/platform/index.js'

const storage = new Map()
configurePlatform({
  name: 'script-test',
  openSocket() {},
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) },
  removeStorageSync(key) { storage.delete(key) },
  resolveAssetUrl(value) { return value },
  applyAppStyle() {},
  setBackgroundColor() {},
  setNavigationBarColor() {},
  getRuntimeCapabilities() { return { platform: 'test' } }
})

const { recordGameEvent } = await import('../utils/ai/eventJournal.js')
const { cancelScriptRun, getScriptRun, runStoredScript, validateScriptSource } = await import('../utils/ai/scriptRuntime.js')
const { deleteStoredScript, getStoredScript, listStoredScripts, saveStoredScript } = await import('../utils/ai/scriptStore.js')
const { createScriptTools } = await import('../utils/ai/scriptTools.js')

test('saves, updates, lists, and deletes reusable scripts', () => {
  const saved = saveStoredScript({ name: 'adder', description: 'adds values', source: 'exports.add = async function (a, b) { return a + b; };' })
  assert.equal(listStoredScripts()[0].sourceLength, saved.source.length)
  assert.equal(getStoredScript(saved.id).name, 'adder')
  assert.throws(() => saveStoredScript({ id: saved.id, expectedUpdatedAt: saved.updatedAt - 1, name: 'adder', source: saved.source }), /已被修改/)
  const updated = saveStoredScript({ id: saved.id, expectedUpdatedAt: saved.updatedAt, name: 'adder', description: 'updated', source: saved.source })
  assert.equal(updated.description, 'updated')
  assert.equal(deleteStoredScript(saved.id), true)
  assert.equal(getStoredScript(saved.id), null)
})

test('executes exported functions with arguments, logs, and JSON return values', async () => {
  const script = saveStoredScript({
    name: 'function-call',
    source: 'exports.add = async function (a, b) { game.log("adding", a, b); return { total: a + b, room: game.get("here").text }; };'
  })
  const run = await runStoredScript({ scriptId: script.id, functionName: 'add', args: [2, 5], waitForResult: true })
  assert.equal(run.status, 'completed')
  assert.equal(run.result.total, 7)
  assert.match(run.logs[0], /adding 2 5/)
})

test('supports non-blocking runs, event listeners, status lookup, and cancellation', async () => {
  const delayed = saveStoredScript({
    name: 'delayed',
    source: 'exports.echo = async function (value) { await game.sleep(25); return value; }; exports.watch = async function () { let text = ""; game.on("chat", event => { text = event.text; }); await game.sleep(40); return text; }; exports.forever = async function () { await game.keepAlive(); };'
  })
  const started = await runStoredScript({ scriptId: delayed.id, functionName: 'echo', args: ['ok'], waitForResult: false })
  assert.equal(started.nonBlocking, true)
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(getScriptRun(started.id).result, 'ok')

  const watching = runStoredScript({ scriptId: delayed.id, functionName: 'watch', waitForResult: true })
  setTimeout(() => recordGameEvent('chat', 'hello listener'), 5)
  assert.equal((await watching).result, 'hello listener')

  const active = await runStoredScript({ scriptId: delayed.id, functionName: 'forever', waitForResult: false, timeoutMs: 5000 })
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(cancelScriptRun(active.id).status, 'running')
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.equal(getScriptRun(active.id).status, 'cancelled')
})

test('exposes script persistence and function invocation through agent tools', async () => {
  const tools = new Map(createScriptTools().map((tool) => [tool.name, tool]))
  assert.deepEqual(Array.from(tools.keys()), ['list_game_scripts', 'get_game_script', 'save_game_script', 'delete_game_script', 'run_game_script', 'get_script_run', 'cancel_script_run'])
  const saved = await tools.get('save_game_script').execute('save', {
    name: 'tool-script',
    description: 'tool integration',
    source: 'exports.main = async function (value) { return { value: value }; };'
  })
  const scriptId = saved.details.saved.id
  const run = await tools.get('run_game_script').execute('run', { scriptId, functionName: 'main', args: ['from-tool'], waitForResult: true })
  assert.equal(run.details.result.value, 'from-tool')
})

test('rejects blocking loops and access to runtime globals or constructors', () => {
  assert.throws(() => validateScriptSource('exports.main = function () { while (true) {} };'), /同步循环/)
  assert.throws(() => validateScriptSource('exports.main = function () { return window.location; };'), /受限全局对象/)
  assert.throws(() => validateScriptSource('exports.main = function () { return game.get.constructor; };'), /原型或构造器/)
  resetPlatform()
})
