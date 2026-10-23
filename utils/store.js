// 全局游戏状态 (响应式, 供登录页/游戏页共享)
import { reactive, shallowRef } from 'vue'
import { clearGameEvents } from './ai/eventJournal.js'
import { runtime } from './platform/index.js'
import { applyAppAppearance } from './appearance.js'

const emptyDir = () => ({ nw: null, n: null, ne: null, w: null, e: null, sw: null, s: null, se: null })
const THEME_STORAGE_KEY = 'mud_theme_mode'
const DISPLAY_STORAGE_KEY = 'mud_display_preferences'
// App-Plus excludes Electron globals; dependency patches keep its legacy JS parser compatible.
let quickUiSmokeTest = false
let quickUiSmokeLines = []
// #ifdef H5
quickUiSmokeTest = typeof window !== 'undefined' && window.mudElectron && window.mudElectron.quickUiSmokeTest === true
quickUiSmokeLines = quickUiSmokeTest
  ? Array.from({ length: 80 }, (_, index) => ({ raw: '自动滚动测试行 ' + (index + 1) }))
  : []
// #endif

function storedThemeMode() {
  try {
    const saved = runtime.getStorageSync(THEME_STORAGE_KEY)
    return saved === 'light' ? 'light' : 'dark'
  } catch (_) {
    return 'dark'
  }
}

const appearanceState = reactive({ themeMode: storedThemeMode() })

function storedDisplayPreferences() {
  try {
    const saved = runtime.getStorageSync(DISPLAY_STORAGE_KEY) || {}
    return { longVisible: saved.longVisible !== false, chatExpanded: saved.chatExpanded !== false }
  } catch (_) {
    return { longVisible: true, chatExpanded: true }
  }
}

const displayPreferences = reactive(storedDisplayPreferences())

function setDisplayPreference(key, value) {
  displayPreferences[key] = Boolean(value)
  runtime.setStorageSync(DISPLAY_STORAGE_KEY, { ...displayPreferences })
}

export function createGameState(sessionId = "") {
return reactive({
  sessionId,
  // ---- 连接 / 登录阶段 ----
  // idle | connecting | versionok | charcreate | loginok | error
  stage: quickUiSmokeTest ? 'loginok' : 'idle',
  statusMsg: '',
  connected: quickUiSmokeTest,
  gameRevision: 0,
  get themeMode() { return appearanceState.themeMode },
  set themeMode(value) { appearanceState.themeMode = value },

  // ---- 房间 ----
  title: { segs: [{ t: '这是江湖智能体' }] },
  // 显示偏好在所有会话间共享，并在下次启动时恢复。
  get longVisible() { return displayPreferences.longVisible },
  set longVisible(value) { setDisplayPreference('longVisible', value) },
  long: [],               // 场景描述 (富文本节点)
  dirs: emptyDir(),       // 方向按钮 {nw,n,ne,w,e,sw,s,se} -> {label, cmd} | null
  acts: [],               // 动作按钮 [{label, cmd}]
  objects: [],            // 物品列表 [{label, cmd, qi, hp, hpMax}]
  tmenu: [],              // 顶栏按钮 [{label, cmd}]

  // ---- 聊天 ----
  get chatExpanded() { return displayPreferences.chatExpanded },
  set chatExpanded(value) { setDisplayPreference('chatExpanded', value) },
  chat: quickUiSmokeLines.slice(), // 聊天记录 (富文本节点)
  chatScrollId: quickUiSmokeTest ? 1 : 0, // 用于触发聊天区滚动到底部

  // ---- 主输出 ----
  screen: quickUiSmokeLines.slice(), // 主输出 (富文本节点, 上限 100)
  screenScrollId: quickUiSmokeTest ? 1 : 0, // 用于触发滚动到底部

  // ---- 状态条 (HP/MP) ----
  hpRows: [],             // [[{label, bars:[{pct,color}]}]]

  // ---- 自定按钮面板 ----
  mycmdsVisible: false,
  mycmdsCustom: false,     // true: 自定按钮面板; false: 服务器分类菜单
  mycmds: [],             // [{label, cmd}]

  // ---- 弹窗 ----
  dialog: null,           // {title, type, ...}
  dialogTitle: '',        // 点击按钮时记录, 供服务器回传弹窗使用
})

}

const activeGameState = shallowRef(createGameState())
const sessionChangeListeners = new Set()
export const state = new Proxy({}, {
  get: (_target, key) => activeGameState.value[key],
  set: (_target, key, value) => { activeGameState.value[key] = value; return true },
  has: (_target, key) => key in activeGameState.value,
  ownKeys: () => Reflect.ownKeys(activeGameState.value),
  getOwnPropertyDescriptor: (_target, key) => key in activeGameState.value ? { enumerable: true, configurable: true, value: activeGameState.value[key] } : undefined
})
export function getActiveGameState() { return activeGameState.value }
export function onGameSessionChange(listener) { sessionChangeListeners.add(listener); return () => sessionChangeListeners.delete(listener) }
export function setActiveGameState(next) {
  if (next === activeGameState.value) return
  for (const listener of sessionChangeListeners) listener()
  activeGameState.value = next
}

export function applyThemeMode() {
  applyAppAppearance(state.themeMode)
}

export function setThemeMode(mode) {
  state.themeMode = mode === 'light' ? 'light' : 'dark'
  runtime.setStorageSync(THEME_STORAGE_KEY, state.themeMode)
  applyThemeMode()
}

export function toggleThemeMode() {
  setThemeMode(state.themeMode === 'light' ? 'dark' : 'light')
}

// 初始化主界面 (登录成功时调用, 对应原版 writeServerData 中 \x1b0000007 分支)
export function enterGame(state = getActiveGameState(), clearEvents = clearGameEvents) {
  clearEvents()
  state.stage = 'loginok'
  state.statusMsg = ''
  state.chat = []
  state.screen = []
  state.mycmdsVisible = false
  state.mycmdsCustom = false
  state.mycmds = []
  state.dialog = null
}

// 清空房间相关状态 (对应原版 writeToST)
export function resetRoom(state = getActiveGameState()) {
  state.long = []
  state.dirs = emptyDir()
  state.acts = []
  state.objects = []
  state.mycmdsVisible = false
  state.mycmdsCustom = false
  state.mycmds = []
}

// 完全重置 (退出游戏/重连时)
export function resetAll(state = getActiveGameState()) {
  state.stage = 'idle'
  state.statusMsg = ''
  state.connected = false
  state.gameRevision = 0
  state.title = { segs: [{ t: '这是江湖智能体' }] }
  state.long = []
  state.dirs = emptyDir()
  state.acts = []
  state.objects = []
  state.tmenu = []
  state.chat = []
  state.screen = []
  state.hpRows = []
  state.mycmdsVisible = false
  state.mycmdsCustom = false
  state.mycmds = []
  state.dialog = null
  state.dialogTitle = ''
}

export default { state, enterGame, resetRoom, resetAll }
