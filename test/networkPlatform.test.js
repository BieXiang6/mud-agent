import test from 'node:test'
import assert from 'node:assert/strict'
import { getNetworkPlatform, resetNetworkPlatform, setNetworkPlatform } from '../utils/network/platform.js'
import { createUniappNetworkPlatform } from '../utils/network/uniappPlatform.js'
import { configurePlatform, runtime } from '../utils/platform/index.js'
import { createElectronPlatform } from '../utils/platform/electron.js'

test('accepts an Electron-compatible injected network platform', () => {
  const electron = { name: 'electron', openSocket() {} }
  assert.equal(setNetworkPlatform(electron), electron)
  assert.equal(getNetworkPlatform(), electron)
  resetNetworkPlatform()
})

test('rejects incomplete network platform adapters', () => {
  assert.throws(() => setNetworkPlatform({ name: 'broken' }), /openSocket/)
  resetNetworkPlatform()
})

test('runtime facade forwards storage and UI calls to the configured platform', () => {
  const calls = []
  configurePlatform({
    name: 'electron',
    openSocket() {},
    getStorageSync(key) { calls.push(['get', key]); return 'saved' },
    setStorageSync(key, value) { calls.push(['set', key, value]) },
    showToast(options) { calls.push(['toast', options.title]) }
  })

  assert.equal(runtime.getStorageSync('theme'), 'saved')
  runtime.setStorageSync('theme', 'dark')
  runtime.showToast({ title: '完成' })
  assert.deepEqual(calls, [
    ['get', 'theme'],
    ['set', 'theme', 'dark'],
    ['toast', '完成']
  ])
  resetNetworkPlatform()
})

test('uni-app adapter normalizes socket events and byte sending', () => {
  const previousUni = globalThis.uni
  const callbacks = {}
  let connectOptions
  let requestOptions
  const storage = new Map()
  let sent
  let closed
  const uniTask = {
    onOpen(callback) { callbacks.open = callback },
    onMessage(callback) { callbacks.message = callback },
    onError(callback) { callbacks.error = callback },
    onClose(callback) { callbacks.close = callback },
    send(options) { sent = options.data },
    close(options) { closed = options }
  }
  globalThis.uni = {
    getStorageSync(key) { return storage.get(key) },
    setStorageSync(key, value) { storage.set(key, value) },
    removeStorageSync(key) { storage.delete(key) },
    getWindowInfo() { return { windowWidth: 1200, windowHeight: 800 } },
    request(options) {
      requestOptions = options
      return 'request-task'
    },
    connectSocket(options) {
      connectOptions = options
      return uniTask
    }
  }

  try {
    const platform = createUniappNetworkPlatform()
    platform.setStorageSync('theme', 'light')
    assert.equal(platform.getStorageSync('theme'), 'light')
    platform.removeStorageSync('theme')
    assert.equal(platform.getStorageSync('theme'), undefined)
    assert.deepEqual(platform.getWindowInfo(), { windowWidth: 1200, windowHeight: 800 })
    assert.equal(platform.resolveAssetUrl('static/background.svg'), '/static/background.svg')
    assert.deepEqual(platform.getRuntimeCapabilities(), {
      platform: 'uni-app', formFactor: 'desktop', viewport: { width: 1200, height: 800 },
      supportsImageBackground: true, supportsSvgBackground: true, supportsFixedBackground: false,
      supportsBackdropFilter: false, supportsFileImport: true, publicStyleFile: '', safeArea: null
    })
    assert.equal(platform.request({ url: 'https://example.test' }), 'request-task')
    assert.deepEqual(requestOptions, { url: 'https://example.test' })

    const events = []
    const socket = platform.openSocket({
      host: '127.0.0.1',
      port: 3040,
      onOpen: () => events.push('open'),
      onData: (data) => events.push(data),
      onError: (error) => events.push(error),
      onClose: (event) => events.push(event)
    })

    assert.equal(connectOptions.url, 'tcp://127.0.0.1:3040')
    callbacks.open()
    callbacks.message({ data: 'payload' })
    callbacks.error('error')
    callbacks.close('close')
    assert.deepEqual(events, ['open', 'payload', 'error', 'close'])

    socket.sendBytes(new Uint8Array([1, 2, 3]))
    assert.deepEqual(Array.from(new Uint8Array(sent)), [1, 2, 3])
    socket.close('done')
    assert.deepEqual(closed, { code: 1000, reason: 'done' })
  } finally {
    if (previousUni === undefined) delete globalThis.uni
    else globalThis.uni = previousUni
  }
})

test('uni-app Android style import reads content URIs through getFileSystemManager', async () => {
  const previousUni = globalThis.uni
  const previousPlus = globalThis.plus
  globalThis.plus = { os: { name: 'Android' }, io: {} }
  globalThis.uni = {}

  try {
    const platform = createUniappNetworkPlatform()
    await assert.rejects(platform.importTextFile({ suggestedName: 'mud-agent-style.json' }), /无需申请“所有文件访问”权限.*自定义基座/)

    globalThis.uni.chooseFile = ({ fail }) => fail({ errMsg: 'chooseFile:fail permission denied' })
    await assert.rejects(platform.importTextFile({ suggestedName: 'mud-agent-style.json' }), /通常不是“所有文件访问”权限问题/)

    let readOptions
    globalThis.uni.chooseFile = ({ success }) => success({
      tempFilePaths: ['content://com.android.providers.downloads.documents/document/42'],
      tempFiles: [{ name: 'theme.json', size: 18, path: 'content://com.android.providers.downloads.documents/document/42' }]
    })
    globalThis.uni.getFileSystemManager = () => ({
      readFile(options) {
        readOptions = options
        options.success({ data: '{"format":"test"}' })
      }
    })
    const imported = await platform.importTextFile({ suggestedName: 'mud-agent-style.json', maxBytes: 1024 })
    assert.equal(readOptions.filePath, 'content://com.android.providers.downloads.documents/document/42')
    assert.equal(readOptions.encoding, 'utf8')
    assert.equal(imported.name, 'theme.json')
    assert.equal(imported.text, '{"format":"test"}')
  } finally {
    if (previousUni === undefined) delete globalThis.uni
    else globalThis.uni = previousUni
    if (previousPlus === undefined) delete globalThis.plus
    else globalThis.plus = previousPlus
  }
})

test('uni-app Android falls back to Native.js when chooseFile is unavailable', async () => {
  const previousUni = globalThis.uni
  const previousPlus = globalThis.plus
  const activity = {}
  const uri = { value: 'content://documents/77' }
  const resolver = {}
  const cursor = { closed: false }
  const stream = { lines: ['{\"format\":', '\"native-test\"}'] }
  let launched
  const android = {
    runtimeMainActivity() { return activity },
    importClass(name) {
      if (name === 'android.content.Intent') return { ACTION_OPEN_DOCUMENT: 'open-document', CATEGORY_OPENABLE: 'openable' }
      if (name === 'android.provider.OpenableColumns') return { DISPLAY_NAME: '_display_name' }
      return {}
    },
    getAttribute(target, name) { return target && target[name] },
    newObject(name, ...args) {
      if (name === 'android.content.Intent') return { action: args[0] }
      if (name === 'java.io.InputStreamReader') return { stream: args[0] }
      if (name === 'java.io.BufferedReader') return { lines: args[0].stream.lines.slice(), index: 0 }
      return {}
    },
    invoke(target, name, ...args) {
      if (target === activity && name === 'getContentResolver') return resolver
      if (target === activity && name === 'startActivityForResult') { launched = { intent: args[0], code: args[1] }; return }
      if (name === 'addCategory') { target.category = args[0]; return }
      if (name === 'setType') { target.type = args[0]; return }
      if (name === 'getData') return uri
      if (target === uri && name === 'toString') return uri.value
      if (target === resolver && name === 'query') return cursor
      if (target === resolver && name === 'openInputStream') return stream
      if (target === cursor && name === 'moveToFirst') return true
      if (target === cursor && name === 'getColumnIndex') return 0
      if (target === cursor && name === 'getString') return 'native-style.json'
      if (target === cursor && name === 'close') { cursor.closed = true; return }
      if (name === 'readLine') return target.index < target.lines.length ? target.lines[target.index++] : null
      if (name === 'close') { target.closed = true; return }
      throw new Error('unexpected invoke: ' + name)
    }
  }
  globalThis.uni = {}
  globalThis.plus = { os: { name: 'Android' }, io: {}, android }

  try {
    const platform = createUniappNetworkPlatform()
    const pending = platform.importTextFile({ suggestedName: 'mud-agent-style.json', maxBytes: 1024 })
    assert.equal(launched.intent.action, 'open-document')
    assert.equal(launched.intent.category, 'openable')
    assert.equal(launched.intent.type, 'application/json')
    activity.onActivityResult(launched.code, -1, {})
    assert.deepEqual(await pending, {
      name: 'native-style.json',
      path: 'content://documents/77',
      text: '{\"format\":\n\"native-test\"}'
    })
    assert.equal(cursor.closed, true)
  } finally {
    if (previousUni === undefined) delete globalThis.uni
    else globalThis.uni = previousUni
    if (previousPlus === undefined) delete globalThis.plus
    else globalThis.plus = previousPlus
  }
})

test('Electron adapter provides synchronous storage and bridged TCP events', async () => {
  const previousWindow = globalThis.window
  const previousStorage = globalThis.localStorage
  const previousDocument = globalThis.document
  const values = new Map()
  const sent = []
  const rootClasses = new Set()
  let tcpListener
  globalThis.localStorage = {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, value) },
    removeItem(key) { values.delete(key) }
  }
  const navigation = []
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    location: {
      hash: '#/pages/login/login',
      replace(value) { navigation.push(['replace', value]); this.hash = value }
    },
    history: {
      back() { navigation.push(['back']) },
      go(delta) { navigation.push(['go', delta]) }
    }
  }
  globalThis.document = {
    documentElement: {
      style: {},
      classList: { add(value) { rootClasses.add(value) } }
    }
  }
  const bridge = {
    isElectron: true,
    appVersion: '1.2.3',
    clipboard: { writeText() {} },
    openExternal: async () => {},
    showModal: async () => ({ confirm: true, cancel: false }),
    files: {
      exportText: async () => ({ path: 'C:\\themes\\style.json', name: 'style.json' }),
      importText: async () => ({ path: 'C:\\themes\\style.json', name: 'style.json', text: '{}' })
    },
    http: { fetch: async () => ({ status: 200, statusText: 'OK', headers: {}, body: '{}' }) },
    tcp: {
      onEvent(listener) { tcpListener = listener },
      async connect(id, host, port) { sent.push(['connect', id, host, port]) },
      async send(id, data) { sent.push(['send', id, data]) },
      async close(id, reason) { sent.push(['close', id, reason]) }
    }
  }

  try {
    const platform = createElectronPlatform(bridge)
    assert.equal(rootClasses.has('electron-runtime'), true)
    platform.setStorageSync('profile', { id: 7 })
    assert.deepEqual(platform.getStorageSync('profile'), { id: 7 })
    assert.equal(platform.getAppVersion(), '1.2.3')
    assert.deepEqual(platform.getWindowInfo(), { windowWidth: 1280, windowHeight: 800 })
    assert.equal(platform.resolveAssetUrl('C:\\themes\\ink #1.png'), 'file:///C:/themes/ink%20%231.png')
    assert.equal(platform.getRuntimeCapabilities().platform, 'electron')
    assert.equal(platform.getRuntimeCapabilities().supportsFixedBackground, true)
    assert.equal(platform.getRuntimeCapabilities().supportsFileImport, true)
    assert.deepEqual(await platform.exportTextFile({ text: '{}' }), { path: 'C:\\themes\\style.json', name: 'style.json' })
    assert.equal((await platform.importTextFile()).text, '{}')
    platform.navigateTo({ url: '/pages/ai-settings/ai-settings' })
    platform.navigateBack()
    platform.reLaunch({ url: '/pages/game/game' })
    assert.deepEqual(platform.getCurrentPages(), [{ route: 'pages/game/game' }])
    assert.deepEqual(navigation, [['back'], ['replace', '#/pages/game/game']])

    const events = []
    const socket = platform.openSocket({
      host: '127.0.0.1',
      port: 3040,
      onOpen: () => events.push('open'),
      onData: (data) => events.push(Array.from(data))
    })
    await Promise.resolve()
    const id = sent[0][1]
    tcpListener({ id, type: 'open' })
    tcpListener({ id, type: 'data', data: [1, 2] })
    socket.sendBytes(new Uint8Array([3, 4]))
    socket.close('done')
    await Promise.resolve()
    assert.deepEqual(events, ['open', [1, 2]])
    assert.deepEqual(sent, [
      ['connect', id, '127.0.0.1', 3040],
      ['send', id, [3, 4]],
      ['close', id, 'done']
    ])
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})
