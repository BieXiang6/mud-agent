const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const renderer = path.join(root, 'dist', 'electron-app', 'renderer', 'index.html')
const preload = path.join(root, 'electron', 'preload.cjs')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function evaluate(window, source) {
  return window.webContents.executeJavaScript(source, true)
}

async function rect(window, selector) {
  return evaluate(window, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const value = element.getBoundingClientRect()
    return { x: value.x, y: value.y, width: value.width, height: value.height }
  })()`)
}

function point(value) {
  return { x: Math.round(value.x + value.width / 2), y: Math.round(value.y + value.height / 2) }
}

async function mouseDrag(window, from, to) {
  window.webContents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 })
  for (let step = 1; step <= 5; step++) {
    const ratio = step / 5
    window.webContents.sendInputEvent({
      type: 'mouseMove',
      x: Math.round(from.x + (to.x - from.x) * ratio),
      y: Math.round(from.y + (to.y - from.y) * ratio),
      button: 'left'
    })
    await delay(20)
  }
  window.webContents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 })
  await delay(100)
}

async function mouseClick(window, at) {
  window.webContents.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 })
  window.webContents.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 })
  await delay(120)
}

async function openGame(window) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await rect(window, '.quick-fab')) return
    await delay(100)
  }
  throw new Error('游戏页未加载快捷入口')
}

async function waitForScrollBottom(window, selector) {
  let lastState = null
  for (let attempt = 0; attempt < 30; attempt++) {
    lastState = await evaluate(window, `(() => {
      const host = document.querySelector(${JSON.stringify(selector)})
      if (!host) return null
      const candidates = [host, ...host.querySelectorAll('*')]
      const scroller = candidates.reduce((best, element) => {
        const overflow = element.scrollHeight - element.clientHeight
        const bestOverflow = best.scrollHeight - best.clientHeight
        return overflow > bestOverflow ? element : best
      }, host)
      return {
        tag: scroller.tagName,
        className: scroller.className,
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        distance: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
      }
    })()`)
    if (lastState && lastState.scrollHeight > lastState.clientHeight && lastState.distance <= 2) return
    await delay(100)
  }
  throw new Error(selector + ' 未自动滚动到底部：' + JSON.stringify(lastState))
}

async function run() {
  ipcMain.on('mud:get-app-version', (event) => { event.returnValue = 'test' })
  ipcMain.handle('mud:http-fetch', async () => ({ status: 404, statusText: 'Not Found', headers: {}, body: '{}' }))
  ipcMain.handle('mud:tcp-close', async () => undefined)
  const window = new BrowserWindow({
    show: false,
    width: 460,
    height: 820,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: ['--mud-quick-ui-smoke-test']
    }
  })
  await window.loadFile(renderer, { hash: '/pages/game/game' })
  await openGame(window)
  await waitForScrollBottom(window, '.chat-scroll')
  await waitForScrollBottom(window, '.out-scroll')

  const entryBefore = await rect(window, '.quick-fab')
  await mouseDrag(window, point(entryBefore), { x: point(entryBefore).x - 90, y: point(entryBefore).y - 100 })
  const entryAfter = await rect(window, '.quick-fab')
  if (!entryAfter || entryAfter.x >= entryBefore.x - 50 || entryAfter.y >= entryBefore.y - 50) {
    throw new Error('快捷入口鼠标拖动失败')
  }

  await delay(350)
  await mouseClick(window, point(entryAfter))
  const panelBefore = await rect(window, '.quick-panel')
  const headBefore = await rect(window, '.quick-panel-head')
  if (!panelBefore || !headBefore) throw new Error('点击快捷入口后窗口未打开')
  await mouseDrag(window, point(headBefore), { x: point(headBefore).x - 55, y: point(headBefore).y - 45 })
  const panelAfter = await rect(window, '.quick-panel')
  if (!panelAfter || panelAfter.x >= panelBefore.x - 25 || panelAfter.y >= panelBefore.y - 20) {
    throw new Error('快捷窗口鼠标拖动失败')
  }

  const firstButton = await rect(window, '.quick-panel .mycmds-btn')
  await mouseClick(window, point(firstButton))
  if (!await rect(window, '.quick-panel')) throw new Error('点击快捷按钮后窗口被意外关闭')

  const closeButton = await rect(window, '.quick-panel-close')
  await mouseClick(window, point(closeButton))
  if (await rect(window, '.quick-panel')) throw new Error('快捷窗口关闭按钮失效')
  await mouseClick(window, point(await rect(window, '.quick-fab')))
  if (!await rect(window, '.quick-panel')) throw new Error('快捷窗口关闭后无法重新打开')

  const button = await rect(window, '.quick-panel .mycmds-btn')
  const buttonPoint = point(button)
  window.webContents.sendInputEvent({ type: 'mouseDown', ...buttonPoint, button: 'left', clickCount: 1 })
  await delay(550)
  window.webContents.sendInputEvent({ type: 'mouseUp', ...buttonPoint, button: 'left', clickCount: 1 })
  await delay(150)
  const dialogText = await evaluate(window, `document.querySelector('.gd-panel')?.textContent || ''`)
  if (!dialogText.includes('按钮1')) throw new Error('鼠标长按快捷按钮未打开设置窗口')

  console.log('Electron 交互测试通过：chat/out 自动到底部、入口拖动、窗口拖动、普通点击、关闭/重开、鼠标长按')
  window.destroy()
}

app.whenReady().then(run).then(() => app.quit()).catch((error) => {
  console.error(error)
  app.exit(1)
})
