// 全局游戏状态 (响应式, 供登录页/游戏页共享)
import { reactive } from 'vue'
import { clearGameEvents } from './ai/eventJournal.js'
import { runtime } from './platform/index.js'
import { applyAppAppearance } from './appearance.js'

const emptyDir = () => ({ nw: null, n: null, ne: null, w: null, e: null, sw: null, s: null, se: null })
const THEME_STORAGE_KEY = 'mud_theme_mode'
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

export const state = reactive({
  // ---- 连接 / 登录阶段 ----
  // idle | connecting | versionok | charcreate | loginok | error
  stage: quickUiSmokeTest ? 'loginok' : 'idle',
  statusMsg: '',
  connected: quickUiSmokeTest,
  gameRevision: 0,
  themeMode: storedThemeMode(),

  // ---- 房间 ----
  title: { segs: [{ t: '这是江湖智能体' }] },
  // 场景描述应在进入游戏后立即可见；仍可通过“系统设置”手动关闭。
  longVisible: true,
  long: [],               // 场景描述 (富文本节点)
  dirs: emptyDir(),       // 方向按钮 {nw,n,ne,w,e,sw,s,se} -> {label, cmd} | null
  acts: [],               // 动作按钮 [{label, cmd}]
  objects: [],            // 物品列表 [{label, cmd, qi, hp, hpMax}]
  tmenu: [],              // 顶栏按钮 [{label, cmd}]

  // ---- 聊天 ----
  chatExpanded: true,
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
export function enterGame() {
  clearGameEvents()
  state.stage = 'loginok'
  state.statusMsg = ''
  state.chat = []
  state.chatExpanded = true
  state.screen = []
  state.longVisible = true
  state.mycmdsVisible = false
  state.mycmdsCustom = false
  state.mycmds = []
  state.dialog = null
}

// 清空房间相关状态 (对应原版 writeToST)
export function resetRoom() {
  state.long = []
  state.dirs = emptyDir()
  state.acts = []
  state.objects = []
  state.mycmdsVisible = false
  state.mycmdsCustom = false
  state.mycmds = []
}

// 完全重置 (退出游戏/重连时)
export function resetAll() {
  state.stage = 'idle'
  state.statusMsg = ''
  state.connected = false
  state.gameRevision = 0
  state.title = { segs: [{ t: '这是江湖智能体' }] }
  state.longVisible = true
  state.long = []
  state.dirs = emptyDir()
  state.acts = []
  state.objects = []
  state.tmenu = []
  state.chatExpanded = true
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
