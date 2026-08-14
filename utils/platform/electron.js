import { createUniappPlatform } from './uniapp.js'

const STORAGE_PREFIX = 'mud-agent:'

function parseStored(value) {
  if (value == null) return undefined
  try { return JSON.parse(value) } catch (_) { return value }
}

function electronBridge() {
  return typeof window !== 'undefined' ? window.mudElectron : null
}

function normalizedRoute(url) {
  const value = String(url || '/').trim()
  return value.startsWith('/') ? value : '/' + value
}

function routeRecord(url) {
  return { route: normalizedRoute(url).replace(/^\//u, '').split('?')[0] }
}

function desktopAssetUrl(source) {
  const value = String(source || '').trim()
  if (/^(?:https?:|data:|file:|blob:)/i.test(value)) return value
  if (/^[a-z]:[\\/]/i.test(value)) {
    const normalized = value.replace(/\\/g, '/')
    return encodeURI('file:///' + normalized).replace(/#/g, '%23')
  }
  if (value.startsWith('\\\\')) {
    return encodeURI('file:' + value.replace(/\\/g, '/')).replace(/#/g, '%23')
  }
  return value
}

function finishCallback(options, result) {
  if (options && options.success) options.success(result)
  if (options && options.complete) options.complete(result)
}

function showDesktopToast(options) {
  if (typeof document === 'undefined' || !document.body) {
    finishCallback(options, { errMsg: 'showToast:ok' })
    return
  }
  const toast = document.createElement('div')
  toast.textContent = String(options && options.title || '')
  Object.assign(toast.style, {
    position: 'fixed',
    zIndex: '2147483647',
    left: '50%',
    bottom: '12%',
    transform: 'translateX(-50%)',
    maxWidth: '70%',
    padding: '10px 16px',
    borderRadius: '6px',
    color: '#fff',
    background: 'rgba(30, 30, 30, .92)',
    fontSize: '14px',
    textAlign: 'center',
    pointerEvents: 'none'
  })
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), Math.max(800, Math.min(Number(options && options.duration) || 1800, 10000)))
  finishCallback(options, { errMsg: 'showToast:ok' })
}

export function hasElectronBridge() {
  const bridge = electronBridge()
  return Boolean(bridge && bridge.isElectron)
}

export function createElectronPlatform(bridge = electronBridge()) {
  if (!bridge || !bridge.isElectron) throw new Error('Electron preload bridge 未就绪')
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.add('electron-runtime')
  }
  const web = createUniappPlatform()
  const socketHandlers = new Map()
  const initialHash = typeof window !== 'undefined' && window.location
    ? String(window.location.hash || '').replace(/^#\/?/u, '')
    : ''
  const routeStack = [routeRecord(initialHash || 'pages/login/login')]
  let socketSequence = 0

  bridge.tcp.onEvent((event) => {
    const handlers = event && socketHandlers.get(event.id)
    if (!handlers) return
    if (event.type === 'open') handlers.onOpen && handlers.onOpen()
    else if (event.type === 'data') handlers.onData && handlers.onData(new Uint8Array(event.data || []))
    else if (event.type === 'error') handlers.onError && handlers.onError({ errMsg: event.message || 'TCP 连接错误' })
    else if (event.type === 'close') {
      socketHandlers.delete(event.id)
      handlers.onClose && handlers.onClose(event)
    }
  })

  async function fetchText(options) {
    return bridge.http.fetch({
      url: String(options.url || ''),
      method: String(options.method || 'GET'),
      headers: options.headers || {},
      body: options.body == null ? '' : String(options.body),
      timeout: Number(options.timeout) || 180000
    })
  }

  return {
    ...web,
    name: 'electron',
    isAndroidApp: () => false,
    getAndroidApi: () => null,
    getNativeTcpPlugin: () => null,

    getStorageSync(key) {
      return parseStored(localStorage.getItem(STORAGE_PREFIX + key))
    },
    setStorageSync(key, value) {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
    },
    removeStorageSync(key) {
      localStorage.removeItem(STORAGE_PREFIX + key)
    },
    showModal(options) {
      const task = bridge.showModal({
        title: options && options.title,
        content: options && options.content,
        showCancel: !options || options.showCancel !== false,
        confirmText: options && options.confirmText,
        cancelText: options && options.cancelText
      }).then((result) => {
        finishCallback(options, result)
        return result
      }).catch((error) => {
        if (options && options.fail) options.fail(error)
        if (options && options.complete) options.complete(error)
        return { confirm: false, cancel: true }
      })
      return task
    },
    showToast(options) { showDesktopToast(options) },
    navigateTo(options) {
      const url = normalizedRoute(options && options.url)
      routeStack.push(routeRecord(url))
      window.location.hash = '#' + url
      finishCallback(options, { errMsg: 'navigateTo:ok' })
    },
    navigateBack(options = {}) {
      const delta = Math.max(1, Number(options.delta) || 1)
      routeStack.splice(Math.max(1, routeStack.length - delta), delta)
      if (delta === 1) window.history.back()
      else window.history.go(-delta)
      finishCallback(options, { errMsg: 'navigateBack:ok' })
    },
    reLaunch(options) {
      const url = normalizedRoute(options && options.url)
      routeStack.splice(0, routeStack.length, routeRecord(url))
      window.location.replace('#' + url)
      finishCallback(options, { errMsg: 'reLaunch:ok' })
    },
    getCurrentPages() { return routeStack.slice() },
    getWindowInfo() {
      return { windowWidth: window.innerWidth, windowHeight: window.innerHeight }
    },
    getAppVersion() { return bridge.appVersion || '' },
    openUrl(url, onError) {
      bridge.openExternal(String(url)).catch((error) => onError && onError(error))
    },
    setClipboardData(options) {
      try {
        bridge.clipboard.writeText(String(options && options.data || ''))
        if (options && options.success) options.success()
      } catch (error) {
        if (options && options.fail) options.fail(error)
      }
    },
    setWakeLock() {},
    setBackgroundColor(options) {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.style.backgroundColor = options && options.backgroundColor || '#000000'
      }
    },
    setNavigationBarColor() {},
    exportTextFile(options) {
      if (!bridge.files || typeof bridge.files.exportText !== 'function') throw new Error('Electron 文件导出桥未就绪')
      return bridge.files.exportText(options || {})
    },
    importTextFile(options) {
      if (!bridge.files || typeof bridge.files.importText !== 'function') throw new Error('Electron 文件导入桥未就绪')
      return bridge.files.importText(options || {})
    },
    resolveAssetUrl(source) { return desktopAssetUrl(source) },
    applyAppStyle(style) {
      if (typeof document === 'undefined' || !document.documentElement) return
      const rootStyle = document.documentElement.style
      for (const [name, value] of Object.entries(style || {})) {
        if (name.startsWith('--')) rootStyle.setProperty(name, String(value))
        else if (name in rootStyle) rootStyle[name] = String(value)
      }
    },
    getRuntimeCapabilities() {
      return {
        platform: 'electron',
        formFactor: window.innerWidth >= 900 ? 'desktop' : 'mobile',
        viewport: { width: window.innerWidth, height: window.innerHeight },
        supportsImageBackground: true,
        supportsSvgBackground: true,
        supportsFixedBackground: true,
        supportsBackdropFilter: typeof CSS !== 'undefined' && CSS.supports && CSS.supports('backdrop-filter', 'blur(1px)'),
        supportsFileImport: true,
        publicStyleFile: '',
        safeArea: null
      }
    },

    fetchText,
    request(options) {
      const task = fetchText(options)
        .then((response) => {
          let data = response.body
          try { data = JSON.parse(response.body) } catch (_) {}
          if (options && options.success) {
            options.success({
              statusCode: response.status,
              data,
              header: response.headers || {},
              errMsg: 'request:ok'
            })
          }
          return response
        })
        .catch((error) => {
          if (options && options.fail) options.fail({ errMsg: error.message || String(error) })
          return null
        })
      return task
    },
    openSocket(options) {
      const id = 'socket-' + Date.now().toString(36) + '-' + (++socketSequence)
      socketHandlers.set(id, options)
      bridge.tcp.connect(id, String(options.host), Number(options.port)).catch((error) => {
        const handlers = socketHandlers.get(id)
        if (handlers && handlers.onError) handlers.onError({ errMsg: error.message || String(error) })
      })
      return {
        sendBytes(bytes, onError) {
          const data = Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
          bridge.tcp.send(id, data).catch((error) => onError && onError({ errMsg: error.message || String(error) }))
          return true
        },
        close(reason = 'close') {
          socketHandlers.delete(id)
          bridge.tcp.close(id, reason)
        }
      }
    }
  }
}

export default { createElectronPlatform, hasElectronBridge }
