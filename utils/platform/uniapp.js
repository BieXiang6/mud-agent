function globalUni() {
  return typeof uni !== 'undefined' ? uni : null
}

function globalPlus() {
  return typeof plus !== 'undefined' ? plus : null
}

function requireUniMethod(name) {
  const runtime = globalUni()
  if (!runtime || typeof runtime[name] !== 'function') {
    throw new Error('当前平台未提供 ' + name + ' 适配器')
  }
  return { runtime, method: runtime[name] }
}

function callUni(name, options) {
  const { runtime, method } = requireUniMethod(name)
  return method.call(runtime, options)
}

function isAbsoluteAssetUrl(value) {
  return /^(?:https?:|data:|file:|blob:|wxfile:|_www\/|_doc\/|_downloads\/)/i.test(value)
}

function safeJsonFileName(value) {
  const name = String(value || 'mud-agent-style.json').replace(/^.*[\\/]/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 120) || 'mud-agent-style.json'
  return name.toLowerCase().endsWith('.json') ? name : name + '.json'
}

function browserExportText(options) {
  const name = safeJsonFileName(options && options.suggestedName)
  const blob = new Blob([String(options && options.text || '')], { type: String(options && options.mimeType || 'application/json') })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return Promise.resolve({ name, path: name })
}

function browserImportText(options) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = (options && options.accept) || '.json,application/json'
    input.style.display = 'none'
    document.body.appendChild(input)
    let settled = false
    const finish = (value, error) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus)
      input.remove()
      if (error) reject(error)
      else resolve(value)
    }
    const onFocus = () => setTimeout(() => { if (!input.files || !input.files.length) finish(null) }, 350)
    window.addEventListener('focus', onFocus)
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0]
      if (!file) return finish(null)
      if (file.size > Number(options && options.maxBytes || 2 * 1024 * 1024)) return finish(null, new Error('样式文件超过大小限制'))
      try { finish({ name: file.name, path: file.name, text: await file.text() }) } catch (error) { finish(null, error) }
    })
    input.click()
  })
}

function requestPlusFileSystem(nativeRuntime, type) {
  return new Promise((resolve, reject) => nativeRuntime.io.requestFileSystem(type, resolve, reject))
}

function plusDirectory(root, name, create) {
  return new Promise((resolve, reject) => root.getDirectory(name, { create }, resolve, reject))
}

function plusFileEntry(root, name, create) {
  return new Promise((resolve, reject) => root.getFile(name, { create }, resolve, reject))
}

function writePlusText(entry, text) {
  return new Promise((resolve, reject) => entry.createWriter((writer) => {
    writer.onerror = reject
    writer.onwrite = () => {
      writer.onwrite = () => resolve(entry)
      writer.write(String(text))
    }
    writer.truncate(0)
  }, reject))
}

function readPlusText(nativeRuntime, entry, maxBytes) {
  return new Promise((resolve, reject) => entry.file((file) => {
    if (Number(file.size) > maxBytes) return reject(new Error('样式文件超过大小限制'))
    const reader = new nativeRuntime.io.FileReader()
    reader.onerror = reject
    reader.onloadend = () => resolve(String(reader.result || ''))
    reader.readAsText(file, 'utf-8')
  }, reject))
}

function resolvePlusEntry(nativeRuntime, path) {
  return new Promise((resolve, reject) => nativeRuntime.io.resolveLocalFileSystemURL(path, resolve, reject))
}

function utf8ByteLength(value) {
  const text = String(value || '')
  let bytes = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4
      index += 1
    } else bytes += 3
  }
  return bytes
}

function readUniText(runtime, path, maxBytes) {
  let manager
  try { manager = runtime.getFileSystemManager() } catch (error) { return Promise.reject(error) }
  if (!manager || typeof manager.readFile !== 'function') return Promise.reject(new Error('getFileSystemManager.readFile 不可用'))
  return new Promise((resolve, reject) => manager.readFile({
    filePath: path,
    encoding: 'utf8',
    success: (result) => {
      const text = String(!result || result.data == null ? '' : result.data)
      if (utf8ByteLength(text) > maxBytes) reject(new Error('样式文件超过大小限制'))
      else resolve(text)
    },
    fail: reject
  }))
}

async function exportPlusText(nativeRuntime, options) {
  const fileSystem = await requestPlusFileSystem(nativeRuntime, nativeRuntime.io.PUBLIC_DOCUMENTS)
  const directory = await plusDirectory(fileSystem.root, 'MudAgent', true)
  const name = safeJsonFileName(options && options.suggestedName)
  const entry = await plusFileEntry(directory, name, true)
  await writePlusText(entry, options && options.text)
  return { name, path: entry.toLocalURL ? entry.toLocalURL() : '_documents/MudAgent/' + name }
}

function plusIsAndroid(nativeRuntime) {
  return /^android$/i.test(String(nativeRuntime && nativeRuntime.os && nativeRuntime.os.name || ''))
}

function filePickerError(error) {
  const message = String(error && (error.errMsg || error.message) || error || '文件选择失败')
  return new Error('系统文件浏览器调用失败：' + message + '。这通常不是“所有文件访问”权限问题，请确认已使用新版 uni-app 安卓基座。')
}

function selectedFileReadError(error) {
  const message = String(error && (error.errMsg || error.message) || error || '未知错误')
  return new Error('已选择文件，但无法读取其内容：' + message + '。无需申请“所有文件访问”权限，请尝试从系统“下载”或“文档”目录选择 JSON。')
}

let nativePickerActive = false

function invokeAndroid(android, target, name, ...args) {
  return android.invoke(target, name, ...args)
}

function androidUriName(android, activity, uri, fallback) {
  let cursor
  try {
    const resolver = invokeAndroid(android, activity, 'getContentResolver')
    cursor = invokeAndroid(android, resolver, 'query', uri, null, null, null, null)
    if (cursor && invokeAndroid(android, cursor, 'moveToFirst')) {
      const columns = android.importClass('android.provider.OpenableColumns')
      const displayName = android.getAttribute(columns, 'DISPLAY_NAME') || '_display_name'
      const index = Number(invokeAndroid(android, cursor, 'getColumnIndex', displayName))
      if (index >= 0) return String(invokeAndroid(android, cursor, 'getString', index) || fallback)
    }
  } catch (_) {
  } finally {
    try { if (cursor) invokeAndroid(android, cursor, 'close') } catch (_) {}
  }
  return fallback
}

function readAndroidContentText(android, activity, uri, maxBytes) {
  let stream
  let reader
  try {
    const resolver = invokeAndroid(android, activity, 'getContentResolver')
    stream = invokeAndroid(android, resolver, 'openInputStream', uri)
    if (!stream) throw new Error('系统未返回可读数据流')
    const inputReader = android.newObject('java.io.InputStreamReader', stream, 'UTF-8')
    reader = android.newObject('java.io.BufferedReader', inputReader)
    if (!reader) throw new Error('无法创建文件读取器')
    const lines = []
    let chars = 0
    while (true) {
      const line = invokeAndroid(android, reader, 'readLine')
      if (line == null) break
      const value = String(line)
      chars += value.length + 1
      if (chars > maxBytes) throw new Error('样式文件超过大小限制')
      lines.push(value)
    }
    const text = lines.join('\n')
    if (utf8ByteLength(text) > maxBytes) throw new Error('样式文件超过大小限制')
    return text
  } finally {
    try { if (reader) invokeAndroid(android, reader, 'close') } catch (_) {}
    try { if (!reader && stream) invokeAndroid(android, stream, 'close') } catch (_) {}
  }
}

function chooseAndroidNativeFile(nativeRuntime, options) {
  const android = nativeRuntime && nativeRuntime.android
  if (!android || typeof android.runtimeMainActivity !== 'function' || typeof android.importClass !== 'function') {
    return Promise.reject(new Error('当前安卓基座没有 Native.js 文件选择能力'))
  }
  if (nativePickerActive) return Promise.reject(new Error('文件浏览器已经打开'))
  nativePickerActive = true
  return new Promise((resolve, reject) => {
    const requestCode = 49372
    let activity
    let previousHandler
    const finish = (value, error) => {
      nativePickerActive = false
      try { if (activity) activity.onActivityResult = previousHandler || null } catch (_) {}
      if (error) reject(error)
      else resolve(value)
    }
    try {
      const Intent = android.importClass('android.content.Intent')
      activity = android.runtimeMainActivity()
      previousHandler = activity.onActivityResult
      const intent = android.newObject('android.content.Intent', android.getAttribute(Intent, 'ACTION_OPEN_DOCUMENT') || 'android.intent.action.OPEN_DOCUMENT')
      invokeAndroid(android, intent, 'addCategory', android.getAttribute(Intent, 'CATEGORY_OPENABLE') || 'android.intent.category.OPENABLE')
      invokeAndroid(android, intent, 'setType', 'application/json')
      activity.onActivityResult = (code, resultCode, data) => {
        if (Number(code) !== requestCode) {
          if (typeof previousHandler === 'function') previousHandler(code, resultCode, data)
          return
        }
        if (Number(resultCode) !== -1 || !data) return finish(null)
        try {
          const uri = invokeAndroid(android, data, 'getData')
          if (!uri) throw new Error('系统文件浏览器未返回文件 URI')
          const uriText = String(invokeAndroid(android, uri, 'toString') || uri)
          const fallbackName = safeJsonFileName(uriText)
          const name = androidUriName(android, activity, uri, fallbackName)
          const text = readAndroidContentText(android, activity, uri, Number(options && options.maxBytes || 2 * 1024 * 1024))
          finish({ name, path: uriText, text })
        } catch (error) { finish(null, selectedFileReadError(error)) }
      }
      invokeAndroid(android, activity, 'startActivityForResult', intent, requestCode)
    } catch (error) {
      finish(null, new Error('无法启动安卓系统文件浏览器：' + String(error && error.message || error)))
    }
  })
}

function chooseUniFile(runtime, nativeRuntime, options) {
  return new Promise((resolve, reject) => runtime.chooseFile({
    count: 1,
    type: 'all',
    extension: ['.json'],
    success: async (result) => {
      try {
        const selected = result.tempFiles && result.tempFiles[0]
        const path = result.tempFilePaths && result.tempFilePaths[0] || selected && selected.path
        if (!path) throw new Error('文件浏览器未返回文件地址')
        const name = selected && selected.name || safeJsonFileName(path)
        const maxBytes = Number(options && options.maxBytes || 2 * 1024 * 1024)
        if (selected && Number(selected.size) > maxBytes) throw new Error('样式文件超过大小限制')
        let text
        if (runtime && typeof runtime.getFileSystemManager === 'function') {
          try { text = await readUniText(runtime, path, maxBytes) } catch (error) {
            if (/^content:/i.test(path)) throw error
          }
        }
        if (text == null) {
          const entry = await resolvePlusEntry(nativeRuntime, path)
          text = await readPlusText(nativeRuntime, entry, maxBytes)
        }
        resolve({ name, path, text })
      } catch (error) { reject(selectedFileReadError(error)) }
    },
    fail: (error) => /cancel/i.test(String(error && error.errMsg || '')) ? resolve(null) : reject(filePickerError(error))
  }))
}

export function createUniappPlatform() {
  return {
    name: 'uni-app',

    getStorageSync(key) {
      const runtime = globalUni()
      return runtime && typeof runtime.getStorageSync === 'function' ? runtime.getStorageSync(key) : undefined
    },
    setStorageSync(key, value) {
      const runtime = globalUni()
      if (runtime && typeof runtime.setStorageSync === 'function') runtime.setStorageSync(key, value)
    },
    removeStorageSync(key) {
      const runtime = globalUni()
      if (runtime && typeof runtime.removeStorageSync === 'function') runtime.removeStorageSync(key)
    },

    showModal(options) { return callUni('showModal', options) },
    showToast(options) { return callUni('showToast', options) },
    navigateTo(options) { return callUni('navigateTo', options) },
    navigateBack(options) { return callUni('navigateBack', options) },
    reLaunch(options) { return callUni('reLaunch', options) },
    setClipboardData(options) { return callUni('setClipboardData', options) },
    setBackgroundColor(options) {
      const runtime = globalUni()
      if (runtime && typeof runtime.setBackgroundColor === 'function') return runtime.setBackgroundColor(options)
    },
    setNavigationBarColor(options) {
      const runtime = globalUni()
      if (runtime && typeof runtime.setNavigationBarColor === 'function') return runtime.setNavigationBarColor(options)
    },
    getWindowInfo() {
      const runtime = globalUni()
      if (runtime && typeof runtime.getWindowInfo === 'function') return runtime.getWindowInfo()
      if (runtime && typeof runtime.getSystemInfoSync === 'function') return runtime.getSystemInfoSync()
      return { windowWidth: 375, windowHeight: 667 }
    },
    getAppVersion() {
      const runtime = globalUni()
      const appInfo = runtime && typeof runtime.getAppBaseInfo === 'function' ? runtime.getAppBaseInfo() : null
      if (appInfo && appInfo.appVersion) return appInfo.appVersion
      const nativeRuntime = globalPlus()
      return nativeRuntime && nativeRuntime.runtime ? nativeRuntime.runtime.version || '' : ''
    },
    openUrl(url, onError) {
      const nativeRuntime = globalPlus()
      if (nativeRuntime && nativeRuntime.runtime && typeof nativeRuntime.runtime.openURL === 'function') {
        return nativeRuntime.runtime.openURL(url, onError)
      }
      if (typeof window !== 'undefined' && typeof window.open === 'function') return window.open(url, '_blank')
      if (onError) onError(new Error('当前平台未提供外链打开适配器'))
    },
    setWakeLock(enabled) {
      const nativeRuntime = globalPlus()
      if (nativeRuntime && nativeRuntime.device && typeof nativeRuntime.device.setWakelock === 'function') {
        nativeRuntime.device.setWakelock(Boolean(enabled))
      }
    },
    getCurrentPages() {
      return typeof getCurrentPages === 'function' ? getCurrentPages() : []
    },
    exportTextFile(options) {
      const nativeRuntime = globalPlus()
      if (nativeRuntime && nativeRuntime.io) return exportPlusText(nativeRuntime, options || {})
      if (typeof document !== 'undefined' && document.body && typeof Blob !== 'undefined') return browserExportText(options || {})
      return Promise.reject(new Error('当前平台不支持文件导出'))
    },
    importTextFile(options) {
      const nativeRuntime = globalPlus()
      const runtime = globalUni()
      if (nativeRuntime && nativeRuntime.io) {
        if (runtime && typeof runtime.chooseFile === 'function') return chooseUniFile(runtime, nativeRuntime, options || {})
        if (plusIsAndroid(nativeRuntime) && nativeRuntime.android) return chooseAndroidNativeFile(nativeRuntime, options || {})
        const message = plusIsAndroid(nativeRuntime)
          ? '当前安卓基座既没有 uni.chooseFile，也没有 Native.js 文件选择能力。无需申请“所有文件访问”权限，请重新制作自定义基座。'
          : '当前 uni-app 运行环境不支持系统文件浏览器，请升级应用后重试。'
        return Promise.reject(new Error(message))
      }
      if (typeof document !== 'undefined' && document.body) return browserImportText(options || {})
      return Promise.reject(new Error('当前平台不支持文件导入'))
    },
    resolveAssetUrl(source) {
      const value = String(source || '').trim()
      const nativeRuntime = globalPlus()
      if (nativeRuntime && nativeRuntime.io && typeof nativeRuntime.io.convertLocalFileSystemURL === 'function' && !/^(?:https?:|data:|blob:)/i.test(value)) {
        try { return nativeRuntime.io.convertLocalFileSystemURL(value) || value } catch (_) {}
      }
      if (isAbsoluteAssetUrl(value) || value.startsWith('/')) return value
      return value.startsWith('./') || value.startsWith('../') ? value : '/' + value
    },
    applyAppStyle() {},
    getRuntimeCapabilities() {
      const windowInfo = this.getWindowInfo()
      return {
        platform: 'uni-app',
        formFactor: Number(windowInfo.windowWidth) >= 900 ? 'desktop' : 'mobile',
        viewport: { width: Number(windowInfo.windowWidth) || 375, height: Number(windowInfo.windowHeight) || 667 },
        supportsImageBackground: true,
        supportsSvgBackground: true,
        supportsFixedBackground: false,
        supportsBackdropFilter: false,
        supportsFileImport: Boolean((globalUni() && typeof globalUni().chooseFile === 'function') || !globalPlus()),
        publicStyleFile: globalPlus() ? '_documents/MudAgent/mud-agent-style.json' : '',
        safeArea: windowInfo.safeArea || null
      }
    },

    isAndroidApp() {
      const android = this.getAndroidApi()
      return Boolean(android && android.importClass)
    },
    getAndroidApi() {
      const nativeRuntime = globalPlus()
      return nativeRuntime && nativeRuntime.android ? nativeRuntime.android : null
    },
    getNativeTcpPlugin() {
      const runtime = globalUni()
      if (!runtime || typeof runtime.requireNativePlugin !== 'function') return null
      return runtime.requireNativePlugin('MudAgent-TCP')
    },
    request(options) { return callUni('request', options) },
    openSocket(options) {
      const { runtime, method } = requireUniMethod('connectSocket')
      const task = method.call(runtime, {
        url: 'tcp://' + options.host + ':' + options.port,
        success: () => {},
        fail: (error) => options.onError && options.onError(error)
      })
      task.onOpen(() => options.onOpen && options.onOpen())
      task.onMessage((event) => options.onData && options.onData(event.data))
      task.onError((error) => options.onError && options.onError(error))
      task.onClose((event) => options.onClose && options.onClose(event))
      return {
        sendBytes(bytes, onError) {
          const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
          const data = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
          task.send({ data, fail: onError })
          return true
        },
        close(reason = 'close') { task.close({ code: 1000, reason }) }
      }
    }
  }
}

export default { createUniappPlatform }
