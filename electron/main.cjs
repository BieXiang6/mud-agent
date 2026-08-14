const { app, BrowserWindow, dialog, ipcMain, net: electronNet, shell } = require('electron')
const nodeNet = require('node:net')
const fs = require('node:fs/promises')
const path = require('node:path')

const sockets = new Map()
const smokeTest = process.argv.includes('--smoke-test')

function socketKey(webContentsId, id) {
  return webContentsId + ':' + id
}

function validSocketArgs(id, host, port) {
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(String(id))) throw new Error('无效的 socket id')
  if (!String(host || '').trim() || String(host).length > 255) throw new Error('无效的服务器地址')
  const parsedPort = Number(port)
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) throw new Error('无效的服务器端口')
  return { id: String(id), host: String(host).trim(), port: parsedPort }
}

function sendSocketEvent(sender, event) {
  if (!sender.isDestroyed()) sender.send('mud:tcp-event', event)
}

function closeSocketsFor(webContentsId) {
  for (const [key, socket] of sockets) {
    if (key.startsWith(webContentsId + ':')) {
      sockets.delete(key)
      socket.destroy()
    }
  }
}

ipcMain.handle('mud:tcp-connect', (event, args) => {
  const target = validSocketArgs(args && args.id, args && args.host, args && args.port)
  const key = socketKey(event.sender.id, target.id)
  const previous = sockets.get(key)
  if (previous) previous.destroy()
  const socket = nodeNet.createConnection({ host: target.host, port: target.port })
  sockets.set(key, socket)
  socket.setNoDelay(true)
  socket.setKeepAlive(true)
  socket.on('connect', () => sendSocketEvent(event.sender, { id: target.id, type: 'open' }))
  socket.on('data', (data) => sendSocketEvent(event.sender, { id: target.id, type: 'data', data: Array.from(data) }))
  socket.on('error', (error) => sendSocketEvent(event.sender, { id: target.id, type: 'error', message: error.message }))
  socket.on('close', (hadError) => {
    sockets.delete(key)
    sendSocketEvent(event.sender, { id: target.id, type: 'close', hadError })
  })
})

ipcMain.handle('mud:tcp-send', (event, args) => {
  const id = String(args && args.id || '')
  const socket = sockets.get(socketKey(event.sender.id, id))
  if (!socket || socket.destroyed) throw new Error('TCP 连接未建立')
  const bytes = Array.isArray(args.data) ? args.data : []
  if (bytes.length > 1024 * 1024) throw new Error('单次发送数据过大')
  socket.write(Buffer.from(bytes))
})

ipcMain.handle('mud:tcp-close', (event, args) => {
  const key = socketKey(event.sender.id, String(args && args.id || ''))
  const socket = sockets.get(key)
  sockets.delete(key)
  if (socket) socket.destroy()
})

ipcMain.handle('mud:http-fetch', async (_event, request) => {
  const url = new URL(String(request && request.url || ''))
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('仅允许 HTTP/HTTPS 请求')
  const controller = new AbortController()
  const timeout = Math.max(1000, Math.min(Number(request.timeout) || 180000, 300000))
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await electronNet.fetch(url.toString(), {
      method: String(request.method || 'GET').toUpperCase(),
      headers: request.headers || {},
      body: request.body || undefined,
      signal: controller.signal
    })
    const headers = {}
    response.headers.forEach((value, key) => { headers[key] = value })
    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body: await response.text()
    }
  } finally {
    clearTimeout(timer)
  }
})

ipcMain.handle('mud:open-external', (_event, url) => {
  const target = new URL(String(url || ''))
  if (target.protocol !== 'http:' && target.protocol !== 'https:') throw new Error('仅允许打开 HTTP/HTTPS 链接')
  return shell.openExternal(target.toString())
})

ipcMain.handle('mud:show-modal', async (event, options) => {
  const confirmText = String(options && options.confirmText || '确定').slice(0, 20)
  const cancelText = String(options && options.cancelText || '取消').slice(0, 20)
  const showCancel = !options || options.showCancel !== false
  const buttons = showCancel ? [confirmText, cancelText] : [confirmText]
  const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), {
    type: 'question',
    title: String(options && options.title || '提示').slice(0, 100),
    message: String(options && options.content || '').slice(0, 10000),
    buttons,
    defaultId: 0,
    cancelId: showCancel ? 1 : 0,
    noLink: true
  })
  return { confirm: result.response === 0, cancel: showCancel && result.response !== 0 }
})

function safeJsonFileName(value) {
  const base = path.basename(String(value || 'mud-agent-style.json')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 120) || 'mud-agent-style.json'
  return base.toLowerCase().endsWith('.json') ? base : base + '.json'
}

ipcMain.handle('mud:export-text-file', async (event, options) => {
  const text = String(options && options.text || '')
  if (!text || Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) throw new Error('导出内容为空或超过 2MB')
  const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
    title: '导出应用样式',
    defaultPath: path.join(app.getPath('documents'), safeJsonFileName(options && options.suggestedName)),
    filters: [{ name: 'JSON 样式文件', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePath) return null
  await fs.writeFile(result.filePath, text, 'utf8')
  return { path: result.filePath, name: path.basename(result.filePath) }
})

ipcMain.handle('mud:import-text-file', async (event) => {
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: '导入应用样式',
    properties: ['openFile'],
    filters: [{ name: 'JSON 样式文件', extensions: ['json'] }]
  })
  if (result.canceled || !result.filePaths.length) return null
  const filePath = result.filePaths[0]
  const info = await fs.stat(filePath)
  if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('样式文件无效或超过 2MB')
  return { path: filePath, name: path.basename(filePath), text: await fs.readFile(filePath, 'utf8') }
})

ipcMain.on('mud:get-app-version', (event) => {
  event.returnValue = app.getVersion()
})

function createWindow() {
  const window = new BrowserWindow({
    width: 460,
    height: 820,
    minWidth: 360,
    minHeight: 640,
    backgroundColor: '#000000',
    title: '这是江湖智能体',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  const webContentsId = window.webContents.id
  window.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url)
      if (target.protocol === 'http:' || target.protocol === 'https:') shell.openExternal(target.toString())
    } catch (_) {}
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })
  window.webContents.once('destroyed', () => closeSocketsFor(webContentsId))
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[electron] renderer 加载失败:', code, description)
    if (smokeTest) app.exit(1)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] renderer 异常退出:', details.reason)
    if (smokeTest) app.exit(1)
  })
  window.webContents.once('did-finish-load', () => {
    if (smokeTest) setTimeout(() => app.exit(0), 1500)
  })
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  for (const socket of sockets.values()) socket.destroy()
  sockets.clear()
})
