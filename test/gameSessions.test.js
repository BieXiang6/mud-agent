import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick, watch } from 'vue'
import net from '../utils/net.js'
import { state } from '../utils/store.js'
import { beginAccountLogin, closeGameSession, gameSessions, getActiveGameBridge, showAccountLogin, switchGameSession } from '../utils/gameSessions.js'
import { queryGameEvents } from '../utils/ai/eventJournal.js'
import { encodeText, decodeText } from '../utils/textEncoding.js'
import { saveStoredScript } from '../utils/ai/scriptStore.js'
import { getScriptRun, runStoredScript } from '../utils/ai/scriptRuntime.js'
import { setLogLevel } from '../utils/log.js'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const profile = account => ({ host: 'test.invalid', port: '4000', account })
let sockets
let storage
beforeEach(() => {
  sockets = []
  storage = new Map()
  setLogLevel(0)
  net.configureNetworkPlatform({
    name: 'multi-account-test',
    getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    openSocket(options) {
      const socket = { options, sent: [], closed: false, sendBytes(bytes) {
        this.sent.push(decodeText(Array.from(bytes), this.encoding || 'utf-8'))
        options.onData(encodeText('\x1b015command received\n', this.encoding || 'utf-8'))
      }, close() { this.closed = true; options.onClose() } }
      sockets.push(socket)
      return socket
    }
  })
})
afterEach(() => {
  for (const session of gameSessions.value) closeGameSession(session.id)
})

async function login(account, encoding = 'utf-8') {
  assert.equal(beginAccountLogin(profile(account)), false)
  const id = state.sessionId
  net.connect('test.invalid', 4000, { encoding })
  const socket = sockets[sockets.length - 1]
  socket.encoding = encoding
  socket.options.onOpen()
  socket.options.onData(encodeText('\x1b0000007\n\x1b002room-' + account + '\n', encoding))
  await pause(5)
  assert.equal(state.stage, 'loginok')
  return { id, socket }
}

test('five accounts stay connected; switching restores isolated views and sends only to the selected account', async () => {
  const accounts = []
  for (let index = 0; index < 5; index++) accounts.push(await login('account' + index))
  assert.equal(gameSessions.value.length, 5)
  assert.ok(sockets.every(socket => !socket.closed))
  assert.throws(() => beginAccountLogin(profile('sixth')), /最多同时登录 5/)
  assert.throws(() => showAccountLogin(), /最多同时登录 5/)
  assert.equal(state.sessionId, accounts[4].id)
  const updates = []
  const unwatch = watch(() => state.title.segs.map(segment => segment.t).join(''), value => updates.push(value))
  switchGameSession(accounts[0].id)
  await nextTick()
  net.sendLine('look')
  assert.deepEqual(accounts[0].socket.sent, ['look\n'])
  assert.equal(accounts[4].socket.sent.length, 0)
  assert.equal(state.title.segs[0].t, 'room-account0')
  assert.deepEqual(updates, ['room-account0'])
  unwatch()
  assert.equal(beginAccountLogin(profile('account0')), true)
  assert.equal(sockets.length, 5)
  closeGameSession(accounts[2].id)
  assert.equal(accounts[2].socket.closed, true)
  assert.equal(accounts[0].socket.closed, false)
  await login('replacement')
  assert.equal(gameSessions.value.filter(session => session.connected).length, 5)
})

test('same account with different suffixes opens independent sessions', () => {
  const first = { ...profile('hero'), password: 'secret', captcha: '_5', encoding: 'gbk' }
  assert.equal(beginAccountLogin(first), false)
  const firstId = state.sessionId
  state.connected = true
  state.stage = 'loginok'
  assert.equal(beginAccountLogin({ ...first, captcha: '_6' }), false)
  const secondId = state.sessionId
  assert.notEqual(firstId, secondId)
  state.connected = true
  state.stage = 'loginok'
  assert.equal(gameSessions.value.length, 2)
  assert.equal(beginAccountLogin(first), true)
  assert.equal(state.sessionId, firstId)
})

test('background packets, multibyte fragments, dialogs, chat and protocol replies remain isolated', async () => {
  const a = await login('A', 'utf-8')
  const b = await login('B', 'gbk')
  const bytes = encodeText('\x1b015后台中文\n', 'utf-8')
  a.socket.options.onData(bytes.slice(0, 6))
  b.socket.options.onData(encodeText('\x1b100乙的聊天\n\x1b007乙的弹窗\n', 'gbk'))
  a.socket.options.onData(bytes.slice(6))
  a.socket.options.onData(encodeText('\x1b100甲的聊天\n\x1b007甲的弹窗\n\x1b014ping-a\n', 'utf-8'))
  await pause(10)
  assert.equal(state.chat[0].raw, '乙的聊天')
  assert.ok(!JSON.stringify(state.dialog).includes('甲的弹窗'))
  assert.equal(a.socket.sent[0], 'ping-a\n')
  assert.equal(b.socket.sent.length, 0)
  assert.ok(!JSON.stringify(queryGameEvents()).includes('甲的聊天'))
  switchGameSession(a.id)
  assert.equal(state.chat[0].raw, '甲的聊天')
  assert.ok(state.screen.some(node => node.raw === '后台中文'))
  assert.ok(JSON.stringify(state.dialog).includes('甲的弹窗'))
  assert.ok(!JSON.stringify(queryGameEvents()).includes('乙的聊天'))
})

test('background disconnect callbacks never change the active account and disconnected slots can be reused', async () => {
  let staleCallbacks = 0
  beginAccountLogin(profile('A'))
  net.connect('test.invalid', 4000, { onClose: () => { staleCallbacks++; state.stage = 'idle' } })
  const a = sockets[0]
  a.options.onOpen()
  a.options.onData(encodeText('\x1b0000007\n', 'gbk'))
  await pause(5)
  const b = await login('B')
  a.options.onClose()
  assert.equal(staleCallbacks, 0)
  assert.equal(state.sessionId, b.id)
  assert.equal(state.connected, true)
  assert.equal(gameSessions.value.find(session => session.account === 'A').connected, false)
  await login('C')
  assert.equal(gameSessions.value.length, 2)
})

test('adding another account preserves sockets, and stale callbacks cannot revive a removed session', async () => {
  const a = await login('A')
  showAccountLogin()
  assert.equal(state.stage, 'idle')
  assert.equal(a.socket.closed, false)
  switchGameSession(a.id)
  closeGameSession(a.id)
  a.socket.options.onData(encodeText('\x1b0000007\n\x1b015stale\n', 'utf-8'))
  await pause(5)
  assert.equal(state.connected, false)
  assert.equal(state.screen.some(node => node.raw === 'stale'), false)
})

test('a running script stays bound to its originating account after a foreground switch', async () => {
  const a = await login('A')
  const script = saveStoredScript({ name: 'background-script', source: 'exports.main = async function () { let text = ""; game.on("chat", event => { text = event.text; }); await game.sleep(50); await game.send("script-A"); return { room: game.get("here").text, text }; };' })
  const started = await runStoredScript({ scriptId: script.id, waitForResult: false })
  await pause(5)
  const b = await login('B')
  a.socket.options.onData(encodeText('\x1b100only-A\n', 'utf-8'))
  b.socket.options.onData(encodeText('\x1b100only-B\n', 'utf-8'))
  await pause(500)
  const run = getScriptRun(started.id)
  assert.equal(run.status, 'completed')
  assert.equal(run.sessionId, a.id)
  assert.deepEqual(run.result, { room: 'room-A', text: 'only-A' })
  assert.ok(a.socket.sent.includes('script-A\n'))
  assert.equal(b.socket.sent.length, 0)
})

test('action IDs from one account cannot invoke another account even with identical revisions', async () => {
  const a = await login('A')
  state.acts = [{ text: 'look', cmd: 'look' }]
  const action = getActiveGameBridge().getRegionContent('actions').items[0].action
  await login('B')
  state.acts = [{ text: 'look', cmd: 'look' }]
  await assert.rejects(getActiveGameBridge().invokeGameAction(action.id), /动作不存在或已过期/)
  switchGameSession(a.id)
  assert.equal(getActiveGameBridge().getRegionContent('actions').items[0].action.id, action.id)
})

test('Android native plugin sessions connect, send and close by independent IDs', async () => {
  const connections = new Map()
  const sent = []
  const plugin = {
    connect() { throw new Error('single socket API must not be used') }, send() {},
    connectSession(id, host, port, timeout, encoding, callback) { connections.set(id, callback); callback({ type: 'open' }); callback({ type: 'data', data: '\x1b0000007\n' }) },
    sendSession(id, text) { sent.push({ id, text }) },
    closeSession(id) { connections.delete(id) }
  }
  net.configureNetworkPlatform({ openSocket() { throw new Error('unexpected fallback') }, isAndroidApp: () => true, getNativeTcpPlugin: () => plugin })
  beginAccountLogin(profile('native-A'))
  net.connect('test.invalid', 4000, { encoding: 'utf-8' })
  await pause(5)
  const a = state.sessionId
  beginAccountLogin(profile('native-B'))
  net.connect('test.invalid', 4000, { encoding: 'gbk' })
  await pause(5)
  const b = state.sessionId
  assert.equal(connections.size, 2)
  switchGameSession(a)
  net.sendLine('look')
  assert.deepEqual(sent, [{ id: a, text: 'look\n' }])
  closeGameSession(a)
  assert.equal(connections.has(a), false)
  assert.equal(connections.has(b), true)
})
