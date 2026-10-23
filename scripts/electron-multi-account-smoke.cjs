// Uses an isolated in-memory profile and a simulated TCP server; no real accounts.
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const assert = require('node:assert/strict')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const renderer = path.resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'dist/electron-app/renderer/index.html')
const sockets = new Map()
const testAgents = process.argv.includes('--agents')
const modelRequests = new Map()
const abortedModelRequests = []
let window
const evaluate = source => window.webContents.executeJavaScript(source, true)

async function waitFor(expression) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  if (testAgents && process.env.MUD_SMOKE_DEBUG) await evaluate(`document.querySelector('.ai-entry')?.click()`)
  throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText.slice(-3000)'))
}
function receive(socket, text) {
  socket.sender.send('mud:tcp-event', { id: socket.id, type: 'data', data: Array.from(Buffer.from(text, 'utf8')) })
}
function respondModel(pending, toolName) {
  modelRequests.delete(pending.request.id)
  const delta = toolName ? { role: 'assistant', tool_calls: [{ index: 0, id: toolName + '-' + pending.account, type: 'function', function: {
    name: toolName, arguments: JSON.stringify(toolName === 'finish' ? { summary: 'done-agent-' + pending.account } : { region: 'here' })
  } }] } : { role: 'assistant', content: 'done-agent-' + pending.account }
  const send = payload => pending.sender.send('mud:http-stream-event', { id: pending.request.id, ...payload })
  send({ phase: 'headers', status: 200, statusText: 'OK', headers: { 'content-type': 'text/event-stream' } })
  const chunk = { id: 'completion-' + pending.request.id, object: 'chat.completion.chunk', model: 'test-model', choices: [{ index: 0, delta, finish_reason: null }] }
  const end = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: toolName ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }
  send({ phase: 'chunk', chunk: 'data: ' + JSON.stringify(chunk) + '\n\ndata: ' + JSON.stringify(end) + '\n\ndata: [DONE]\n\n' })
  send({ phase: 'end' })
}
async function startAgent(index) {
  await evaluate(`document.querySelector('.ai-entry').click()`)
  await waitFor(`!!document.querySelector('.ai-panel textarea')`)
  assert.equal(await evaluate(`document.querySelectorAll('.ai-turn').length`), 0, 'A new account must start with its own conversation')
  await evaluate(`(() => { const input = document.querySelector('.ai-panel textarea'); input.value = 'agent-test-${index}'; input.dispatchEvent(new Event('input', {bubbles:true})); document.querySelector('.ai-action.primary').click() })()`)
  await waitFor(`!!document.querySelector('.ai-action.danger')`)
  for (let attempt = 0; attempt < 50 && ![...modelRequests.values()].some(request => request.account === index); attempt++) await pause(50)
  assert.ok([...modelRequests.values()].some(request => request.account === index))
  await evaluate(`document.querySelector('.ai-close').click()`)
}
async function longPressShortcut() {
  await evaluate(`(() => {
    const button = document.querySelector('.quick-fab')
    const rect = button.getBoundingClientRect()
    button.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, pointerId:1, pointerType:'mouse', isPrimary:true, button:0, clientX:rect.x+10, clientY:rect.y+10}))
  })()`)
  await pause(550)
  await evaluate(`window.dispatchEvent(new PointerEvent('pointerup', {bubbles:true,pointerId:1,pointerType:'mouse',isPrimary:true,button:0}))`)
  await waitFor(`!!document.querySelector('.session-panel')`)
  assert.equal(await evaluate(`!!document.querySelector('.quick-panel')`), false)
}
async function fillLogin(account) {
  await waitFor(`!!document.querySelector('.login-btn')`)
  await evaluate(`(() => {
    const inputs = document.querySelectorAll('.card .field input')
    const values = [
      [inputs[0], 'test.invalid'],
      [inputs[1], '4000'],
      [inputs[2], ${JSON.stringify(account)}],
      [inputs[3], 'test-password'],
      [inputs[4], '_5']
    ]
    for (const [input, value] of values) { input.value = value; input.dispatchEvent(new Event('input', {bubbles:true})) }
    Array.from(document.querySelectorAll('.encoding-option')).find(e=>e.innerText === 'UTF-8').click()
  })()`)
  await pause(50)
  await evaluate(`document.querySelector('.login-btn').click()`)
  await waitFor(`!!document.querySelector('.quick-fab')`)
  await waitFor(`document.querySelector('.here')?.innerText.includes(${JSON.stringify('room-' + account)})`)
}

app.whenReady().then(async () => {
  ipcMain.on('mud:get-app-version', event => { event.returnValue = 'test' })
  ipcMain.handle('mud:http-fetch', async () => ({ status: 404, headers: {}, body: '{}' }))
  ipcMain.handle('mud:show-modal', async () => ({ confirm: true, cancel: false }))
  if (testAgents) {
    ipcMain.on('mud:http-stream-start', (event, request) => {
      const body = JSON.parse(request.body)
      const account = Number(JSON.stringify(body.messages).match(/agent-test-(\d+)/)?.[1])
      assert.ok(Number.isInteger(account))
      const pending = { request, sender: event.sender, account }
      modelRequests.set(request.id, pending)
      const result = body.messages.findLast(message => message.role === 'tool')
      if (process.env.MUD_SMOKE_DEBUG) console.log('model request', request.id, account, result && result.tool_call_id)
      if (result) {
        if (result.tool_call_id.startsWith('get_region_content')) {
          assert.ok(result.content.includes('room-test-' + account), 'Background agent must read its own game')
          respondModel(pending, 'finish')
        } else respondModel(pending)
      }
    })
    ipcMain.on('mud:http-stream-abort', (_event, { id }) => { abortedModelRequests.push(id); modelRequests.delete(id) })
  }
  ipcMain.handle('mud:tcp-connect', (event, args) => {
    const socket = { id: args.id, sender: event.sender, account: '' }
    sockets.set(args.id, socket)
    setTimeout(() => {
      event.sender.send('mud:tcp-event', { id: args.id, type: 'open' })
      receive(socket, '版本验证成功\n')
    }, 30)
  })
  ipcMain.handle('mud:tcp-send', (_event, args) => {
    const socket = sockets.get(args.id)
    if (!socket) throw new Error('Socket closed')
    const text = Buffer.from(args.data).toString('utf8')
    if (text.includes('║')) {
      socket.account = text.split('║')[0]
      receive(socket, '\x1b0000007\n\x1b002room-' + socket.account + '\n')
    }
  })
  ipcMain.handle('mud:tcp-close', (_event, args) => { sockets.delete(args.id) })
  window = new BrowserWindow({ show: false, width: 460, height: 820, webPreferences: {
    partition: 'multi-account-smoke', preload: path.resolve('electron/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false
  } })
  window.webContents.on('console-message', event => {
    if (event.level === 'error') console.error(event.message)
    else if (process.env.MUD_SMOKE_DEBUG && event.message.includes('[AI')) console.log(event.message)
  })
  await window.loadFile(renderer, { hash: '/pages/login/login' })
  if (testAgents) await evaluate(`(() => {
    const config = { mud_ai_model: 'test-model', mud_ai_api_key: 'test-key', mud_ai_base_url: 'https://model.invalid', mud_ai_protocol: 'openai-completions' }
    for (const [key, value] of Object.entries(config)) localStorage.setItem('mud-agent:' + key, JSON.stringify(value))
  })()`)
  for (let index = 0; index < 5; index++) {
    if (index) {
      await longPressShortcut()
      await evaluate(`document.querySelector('.session-add').click()`)
    }
    await fillLogin('test-' + index)
    if (testAgents) await startAgent(index)
    assert.equal(sockets.size, index + 1, 'Adding an account must keep existing sockets open')
  }
  await longPressShortcut()
  if (testAgents) {
    assert.equal(modelRequests.size, 5, 'Five model requests must remain active after account switches and login navigation')
    assert.equal(abortedModelRequests.length, 0, 'Switching accounts must not abort model requests')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('.session-row')).filter(row => row.innerText.includes('运行中')).length`), 5)
    for (const pending of [...modelRequests.values()]) respondModel(pending, 'get_region_content')
    await waitFor(`Array.from(document.querySelectorAll('.session-row')).filter(row => row.innerText.includes('已完成')).length === 5`)
    const histories = await evaluate(`Object.keys(localStorage).filter(key => key.startsWith('mud-agent:mud_ai_account_tasks_v1:')).map(key => ({ key, tasks: JSON.parse(JSON.parse(localStorage.getItem(key))) }))`)
    const { profileId } = await import('../utils/loginProfiles.js')
    const accountIds = Array.from({ length: 5 }, (_, index) => profileId({ host: 'test.invalid', port: '4000', account: 'test-' + index, password: 'test-password', captcha: '_5', encoding: 'utf-8' }))
    assert.equal(histories.length, 5)
    for (const history of histories) {
      const index = accountIds.indexOf(decodeURIComponent(history.key).split(':').at(-1))
      assert.ok(index >= 0, 'Task history must be bound to a full login profile hash')
      assert.equal(history.tasks.length, 1)
      assert.equal(history.tasks[0].conversation[0].text, 'agent-test-' + index)
      assert.ok(!JSON.stringify(history.tasks).includes('agent-test-' + ((index + 1) % 5)))
    }
  }
  assert.equal(await evaluate(`document.querySelectorAll('.session-row').length`), 5)
  assert.equal(await evaluate(`document.querySelector('.session-add').classList.contains('disabled')`), true)
  const first = [...sockets.values()].find(socket => socket.account === 'test-0')
  receive(first, '\x1b002background-room-A\n\x1b100background-chat-A\n')
  await pause(100)
  assert.equal(await evaluate(`document.querySelector('.here').innerText.includes('background-room-A')`), false)
  await evaluate(`document.querySelectorAll('.session-row')[0].click()`)
  await waitFor(`document.querySelector('.here')?.innerText.includes('background-room-A')`)
  assert.equal(await evaluate(`document.querySelector('.chat').innerText.includes('background-chat-A')`), true)
  assert.equal(sockets.size, 5)
  assert.equal(await evaluate(`!!document.querySelector('.session-panel')`), false)
  if (testAgents) {
    await evaluate(`document.querySelector('.ai-entry').click()`)
    await waitFor(`document.querySelector('.ai-panel')?.innerText.includes('done-agent-0')`)
    assert.equal(await evaluate(`document.querySelector('.ai-panel').innerText.includes('agent-test-1')`), false)
    await evaluate(`document.querySelector('.ai-close').click()`)
  }
  await pause(900)
  const shortcutPoint = () => evaluate(`(() => { const rect = document.querySelector('.quick-fab').getBoundingClientRect(); return {x:rect.x+10,y:rect.y+10} })()`)
  // Dispatch touch events directly so the hidden window's compositor cannot
  // stretch a short press or defer a move. Never synthesize a longpress event.
  const touchEvent = (type, points = []) => evaluate(`(() => {
    const type = ${JSON.stringify(type.toLowerCase())}
    const points = ${JSON.stringify(points)}
    if (type === 'touchstart') window.shortcutTouchTarget = document.querySelector('.quick-fab')
    const target = window.shortcutTouchTarget
    if (points.length) window.shortcutTouchPoint = points[0]
    const makeTouch = point => new Touch({ identifier:1, target, clientX:point.x, clientY:point.y, pageX:point.x, pageY:point.y })
    const touches = points.map(makeTouch)
    const changedTouches = touches.length ? touches : [makeTouch(window.shortcutTouchPoint)]
    target.dispatchEvent(new TouchEvent(type, { bubbles:true, cancelable:true, touches, targetTouches:touches, changedTouches }))
    if (type === 'touchend') target.click()
  })()`)
  let touch = await shortcutPoint()
  let touchStart = touchEvent('touchStart', [touch])
  await pause(70)
  await Promise.all([touchStart, touchEvent('touchEnd')])
  await waitFor(`!!document.querySelector('.quick-panel')`)
  assert.equal(await evaluate(`!!document.querySelector('.session-panel')`), false)
  await evaluate(`document.querySelector('.quick-panel-close').click()`)
  touchStart = touchEvent('touchStart', [touch])
  await pause(70)
  await Promise.all([touchStart, touchEvent('touchCancel')])
  await pause(550)
  assert.equal(await evaluate(`!!document.querySelector('.session-panel')`), false, 'Cancelled touch must not open the list')
  touchStart = touchEvent('touchStart', [touch])
  await pause(50)
  const touchMove = touchEvent('touchMove', [{ x: touch.x - 40, y: touch.y - 40 }])
  await pause(600)
  await Promise.all([touchStart, touchMove, touchEvent('touchEnd')])
  assert.equal(await evaluate(`!!document.querySelector('.session-panel')`), false, 'Dragging must cancel the long press')
  assert.equal(await evaluate(`!!document.querySelector('.quick-panel')`), false, 'Releasing a drag must not trigger a tap')
  touch = await shortcutPoint()
  touchStart = touchEvent('touchStart', [touch])
  await pause(50)
  const jitter = touchEvent('touchMove', [{ x: touch.x + 4, y: touch.y + 3 }])
  await pause(600)
  await Promise.all([touchStart, jitter, touchEvent('touchEnd')])
  await waitFor(`!!document.querySelector('.session-panel')`)
  assert.equal(await evaluate(`!!document.querySelector('.quick-panel')`), false, 'Long press release must not trigger a tap')
  await evaluate(`document.querySelectorAll('.session-disconnect')[1].click()`)
  await waitFor(`document.querySelectorAll('.session-row').length === 4`)
  assert.equal(sockets.size, 4)
  assert.equal(await evaluate(`document.querySelector('.here').innerText.includes('background-room-A')`), true)
  await evaluate(`document.querySelectorAll('.session-disconnect')[0].click()`)
  await waitFor(`!document.querySelector('.session-panel') && document.querySelector('.here')?.innerText.includes('room-test-2')`)
  assert.equal(sockets.size, 3)
  console.log('PASS: five login flows, mouse/touch long press, account cap, background updates, switching and targeted disconnect')
  if (testAgents) console.log('PASS: five concurrent real agents, background tools, independent conversation/task persistence and restored account UI')
  window.destroy()
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
