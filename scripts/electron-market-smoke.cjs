// Uses temporary storage, a local HTTP server and simulated TCP login only.
const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const path = require('node:path')
const { mkdtemp, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { once } = require('node:events')
const { pathToFileURL } = require('node:url')
const renderer = path.resolve(process.argv[2] || 'dist/verification-h5/index.html')
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let window, server, dataDir
const evaluate = source => window.webContents.executeJavaScript(source, true)
async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return
    await pause(100)
  }
  throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText.slice(-3500)'))
}
async function click(selector, label) {
  await evaluate(`(() => {
    const elements = Array.from(document.querySelectorAll(${JSON.stringify(selector)}))
    const target = ${label == null ? 'elements[0]' : 'elements.find(el => el.innerText.trim() === ' + JSON.stringify(label) + ')'}
    if (!target) throw new Error('Missing control: ' + ${JSON.stringify(selector + ' ' + (label || ''))})
    target.click()
  })()`)
}
async function fill(selector, value) {
  await evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)})
    if (!input) throw new Error('Missing input: ' + ${JSON.stringify(selector)})
    input.value = ${JSON.stringify(value)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
}
app.whenReady().then(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mud-market-ui-'))
  const { createMarketplaceStore } = await import(pathToFileURL(path.resolve('server/marketplaceStore.js')).href)
  const { createReleaseServer } = await import(pathToFileURL(path.resolve('server/index.js')).href)
  const store = createMarketplaceStore({ dataDir })
  const author = { host: 'game.test', port: '4057', account: 'hero', captcha: '_5' }
  const own = await store.registerIdentity({ nickname: '已有作者', account: 'other-1' })
  const other = await store.registerIdentity({ nickname: '另一作者', account: 'other-2' })
  const longDescription = '查看房间并判断出口，适合探索和巡逻😀。'.repeat(15)
  const remote = await store.publish({ type: 'script', name: 'market-route', description: longDescription, version: '1.0.0', author: own,
    payload: { source: 'exports.main = () => game.get("here");' } }, own.privateSignature)
  await store.publish({ type: 'skill', name: 'remote-guide', description: '另一位作者的导航指南', version: '1.0.0', author: other,
    payload: { content: '先查看当前房间，再列出出口。' } }, other.privateSignature)
  server = createReleaseServer({ marketDataDir: dataDir })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = 'http://127.0.0.1:' + server.address().port
  ipcMain.on('mud:get-app-version', event => { event.returnValue = 'test' })
  ipcMain.handle('mud:http-fetch', async (_event, options) => {
    assert.ok(options.url.startsWith(base + '/'), 'Smoke test must never access a real service')
    const response = await fetch(options.url, { method: options.method, headers: options.headers, body: options.method === 'GET' ? undefined : options.body })
    return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }
  })
  let confirmDeletion = true, deletePrompts = 0
  ipcMain.handle('mud:show-modal', async (_event, options) => {
    if (options.title === '删除市场内容') { deletePrompts++; return { confirm: confirmDeletion, cancel: !confirmDeletion } }
    return { confirm: true, cancel: false }
  })
  let exportedIdentity = ''
  ipcMain.handle('mud:export-text-file', async (_event, options) => { exportedIdentity = options.text; return { name: options.suggestedName } })
  ipcMain.handle('mud:import-text-file', async () => ({ name: 'identity.json', text: exportedIdentity }))
  ipcMain.handle('mud:tcp-connect', (event, args) => {
    setTimeout(() => {
      event.sender.send('mud:tcp-event', { id: args.id, type: 'open' })
      event.sender.send('mud:tcp-event', { id: args.id, type: 'data', data: Array.from(Buffer.from('版本验证成功\n')) })
    }, 30)
  })
  ipcMain.handle('mud:tcp-send', (event, args) => {
    if (Buffer.from(args.data).toString().includes('║')) event.sender.send('mud:tcp-event', { id: args.id, type: 'data', data: Array.from(Buffer.from('\x1b0000007\n\x1b002测试房间\n')) })
  })
  ipcMain.handle('mud:tcp-close', () => {})
  window = new BrowserWindow({ show: false, width: 460, height: 900, webPreferences: {
    partition: 'market-smoke', preload: path.resolve('electron/preload.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true
  } })
  const errors = []
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  await window.loadFile(renderer, { hash: '/pages/login/login' })
  await evaluate(`localStorage.setItem('mud-agent:mud_release_api_url', ${JSON.stringify(JSON.stringify(base))})`)
  await evaluate(`(() => {
    const values = {
      mud_ai_custom_skills: JSON.stringify([{ name: 'local-guide', description: '本地导航工作流', content: '查看房间并说明出口。', disableModelInvocation: false }])
    }
    for (const [key, value] of Object.entries(values)) localStorage.setItem('mud-agent:' + key, JSON.stringify(value))
  })()`)
  await waitFor(`!!document.querySelector('.login-btn')`)
  for (const [index, value] of [author.host, author.port, author.account, 'test-password', author.captcha].entries()) {
    await evaluate(`(() => { const input = document.querySelectorAll('.card .field input')[${index}]; input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input', {bubbles:true})) })()`)
  }
  await click('.encoding-option', 'UTF-8')
  await click('.login-btn')
  await waitFor(`!!document.querySelector('.quick-fab')`)
  await evaluate(`window.location.hash = '#/pages/ai-skills/ai-skills'`)
  await waitFor(`!!document.querySelector('.market-open')`)
  await click('.market-open')
  await waitFor(`document.querySelector('.card .name')?.innerText === 'remote-guide'`)
  assert.equal(await evaluate(`document.querySelector('.card .meta').innerText`), '作者：另一作者 · 版本：1.0.0')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('.card .market-button')).some(el => el.innerText === '更新内容')`), false)
  assert.equal(await evaluate(`!!document.querySelector('.credential')`), false, 'Identity management must be hidden until login is clicked')
  await click('.identity-open', '登录')
  await waitFor(`!!document.querySelector('.credential input')`)
  await pause(150)
  await writeFile(path.join(path.dirname(renderer), 'market-login-smoke.png'), (await window.webContents.capturePage()).toPNG())
  await fill('.credential input', '已有作者')
  await click('.credential .primary', '注册昵称并继续')
  await waitFor(`document.querySelector('.credential')?.innerText.includes('昵称已存在')`)
  await fill('.credential input', '江湖客')
  await click('.credential .primary', '注册昵称并继续')
  await waitFor(`document.querySelector('.credential')?.innerText.includes('本机已保存私密签名')`)
  assert.equal(await evaluate(`document.querySelector('.identity-open').innerText`), '江湖客')
  await click('.credential .market-button', '关闭')
  assert.equal(await evaluate(`!!document.querySelector('.credential')`), false)
  await click('.topbar .market-button', '上传')
  await waitFor(`!!document.querySelector('.dialog .local-row')`)
  await click('.local-row', 'local-guide')
  await pause(150)
  await writeFile(path.join(path.dirname(renderer), 'market-publish-smoke.png'), (await window.webContents.capturePage()).toPNG())
  await click('.dialog .primary', '上传发布')
  await waitFor(`!document.querySelector('.mask') && document.querySelector('.card .name')?.innerText === 'local-guide'`)
  await click('.card .market-button', '更新内容')
  await waitFor(`!!document.querySelector('.dialog .local-row')`)
  await click('.local-row', 'local-guide')
  await fill('.dialog input[maxlength="40"]', '1.1.0')
  await click('.dialog .primary', '提交更新')
  await waitFor(`!document.querySelector('.mask') && document.querySelector('.card .meta')?.innerText.includes('1.1.0')`)
  const uploaded = (await store.list({ type: 'skill', q: 'local-guide' })).items[0]
  assert.equal(uploaded.revision, 2)
  assert.equal(uploaded.author.nickname, '江湖客')
  assert.notEqual(uploaded.authorId, own.id)
  confirmDeletion = false
  await click('.market-list .danger', '删除')
  await waitFor(`!!document.querySelector('.market-list .danger:not(.disabled)')`)
  assert.equal(deletePrompts, 1)
  assert.equal((await store.get(uploaded.id)).id, uploaded.id)
  confirmDeletion = true
  await click('.market-list .danger', '删除')
  await waitFor(`document.querySelector('.card .name')?.innerText === 'remote-guide'`)
  assert.equal(deletePrompts, 2)
  await assert.rejects(store.get(uploaded.id), /不存在/)
  assert.equal(await evaluate(`JSON.parse(JSON.parse(localStorage.getItem('mud-agent:mud_ai_custom_skills'))).some(skill => skill.name === 'local-guide')`), true)
  await click('.filters .market-button', '脚本')
  await waitFor(`document.querySelector('.card .name')?.innerText === 'market-route'`)
  await click('.card .primary', '查看与下载')
  await waitFor(`!!document.querySelector('.dialog .source')`)
  assert.equal(await evaluate(`document.querySelector('.dialog .description').innerText`), longDescription, 'Details must retain the complete description')
  await click('.dialog .primary', '下载到本机')
  await waitFor(`document.querySelector('.dialog')?.innerText.includes('已下载到本机')`)
  const localScripts = await evaluate(`JSON.parse(JSON.parse(localStorage.getItem('mud-agent:mud_ai_scripts_v1')))`)
  assert.equal(localScripts[0].name, remote.name)
  await click('.dialog .market-button', '关闭')
  await click('.identity-open', '江湖客')
  await waitFor(`!!document.querySelector('.credential')`)
  await click('.credential .market-button', '导出私密签名')
  await waitFor(`document.querySelector('.credential')?.innerText.includes('签名已导出')`)
  assert.equal(JSON.parse(exportedIdentity).nickname, '江湖客')
  await click('.credential .market-button', '关闭')
  // Simulate a new client's missing signature without exposing it in test output.
  await evaluate(`localStorage.removeItem('mud-agent:mud_market_private_identities_v1')`)
  await click('.topbar .back')
  await waitFor(`!!document.querySelector('.market-open')`)
  await click('.market-open')
  await waitFor(`document.querySelector('.identity-open')?.innerText === '登录'`)
  assert.equal(await evaluate(`!!document.querySelector('.credential')`), false)
  await click('.topbar .market-button', '上传')
  await waitFor(`!!document.querySelector('.credential input')`)
  await fill('.credential input', '江湖客')
  await click('.credential .primary', '注册昵称并继续')
  await waitFor(`document.querySelector('.credential')?.innerText.includes('昵称已存在')`)
  await click('.credential .market-button', '导入私密签名')
  await waitFor(`document.querySelector('.credential')?.innerText.includes('可以继续上传和更新')`)
  await click('.credential .market-button', '关闭')
  await store.setBlocked('江湖客', true)
  await click('.topbar .market-button', '上传')
  await waitFor(`document.querySelector('.error')?.innerText.includes('禁止上传')`)
  assert.equal(await evaluate(`!!document.querySelector('.mask')`), false)
  await store.setBlocked('江湖客', false)
  await click('.filters .market-button', '脚本')
  await fill('.search-row input', '不存在的条目')
  await click('.search-row .market-button', '搜索')
  await waitFor(`document.querySelector('.empty')?.innerText.includes('暂无匹配内容')`)
  await fill('.search-row input', '')
  await click('.search-row .market-button', '搜索')
  await waitFor(`document.querySelector('.card .name')?.innerText === 'market-route'`)
  const fixtureAdmin = await store.registerIdentity({ nickname: '想都别想', account: 'fixture-admin' })
  for (let index = 0; index < 22; index++) {
    await store.publish({ type: 'script', name: 'scroll-item-' + index, description: longDescription, version: '1.0', author: fixtureAdmin,
      payload: { source: 'exports.main = () => 1;' } }, fixtureAdmin.privateSignature)
  }
  await click('.search-row .market-button', '搜索')
  await waitFor(`document.querySelectorAll('.market-list .card').length === 20`)
  assert.equal(await evaluate(`document.querySelectorAll('.market-list .danger').length`), 0, 'Other authors must not receive delete controls')
  const preview = await evaluate(`(() => {
    const element = document.querySelector('.description-preview')
    return { text: element.innerText, height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight) }
  })()`)
  assert.equal(Array.from(preview.text).length, 81)
  assert.ok(preview.text.endsWith('…'))
  assert.ok(preview.height <= preview.lineHeight * 2 + 1)
  const fixedBounds = await evaluate(`(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom } }
    return { tools: rect('.market-tools'), footer: rect('.pagination'), height: innerHeight }
  })()`)
  await evaluate(`(() => {
    const host = document.querySelector('.market-list')
    const scroller = [host, ...host.querySelectorAll('*')].find(el => el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))
    if (!scroller) throw new Error('Market list must have its own scroll area')
    scroller.scrollTop = scroller.scrollHeight
  })()`)
  await waitFor(`Array.from(document.querySelector('.market-list').querySelectorAll('*')).some(el => el.scrollTop > 0) || document.querySelector('.market-list').scrollTop > 0`)
  assert.deepEqual(await evaluate(`(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom } }
    return { tools: rect('.market-tools'), footer: rect('.pagination'), height: innerHeight }
  })()`), fixedBounds)
  assert.ok(fixedBounds.footer.bottom <= fixedBounds.height + 1)
  await click('.pagination .market-button', '下一页')
  await waitFor(`document.querySelectorAll('.market-list .card').length === 3`)
  assert.equal(await evaluate(`Math.max(document.querySelector('.market-list').scrollTop, ...Array.from(document.querySelector('.market-list').querySelectorAll('*')).map(el => el.scrollTop))`), 0)
  await click('.pagination .market-button', '上一页')
  await waitFor(`document.querySelectorAll('.market-list .card').length === 20`)
  await pause(250)
  await writeFile(path.join(path.dirname(renderer), 'market-smoke.png'), (await window.webContents.capturePage()).toPNG())
  // Initial unconfigured marketplace can report its failed request as a console error.
  assert.ok(!errors.some(message => /TypeError|ReferenceError|Unhandled/.test(message)), errors.join('\n'))
  console.log('PASS: unique nickname registration, private signature export/import, author updates, previews, downloads, search and upload blocking')
}).then(async () => {
  if (window) window.destroy()
  if (server) { server.close(); await once(server, 'close') }
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
  app.quit()
}).catch(async error => {
  console.error(error)
  if (window && !window.isDestroyed()) window.destroy()
  if (server) server.close()
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
  app.exit(1)
})
