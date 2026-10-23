// 服务器数据协议解析 (与原版 www/main.js 的 writeServerData 对应)
// 所有内容按 \n 分行后逐行进入 handleLine
import { parseRich, HR_LINE } from './ansi.js'
import { state as defaultState, enterGame as enterDefaultGame, resetRoom as resetDefaultRoom } from './store.js'
import { log, dbg, escapeStr, isDebugEnabled } from './log.js'
import { recordGameEvent as defaultRecordGameEvent } from './ai/eventJournal.js'
import { buildActionDialog } from './dialog.js'

export function createProtocol({ state, enterGame, resetRoom, recordGameEvent }) {
const ESC = String.fromCharCode(27)

// proto 需要向服务器回写指令 (\x1b014 回显), 由 net.js 注入, 避免循环依赖
let sendFn = () => {}

// 网络队列在一个时间片内可能处理数百条消息。主输出/聊天/场景先写入普通数组，
// 时间片结束时一次性提交给 Vue，避免逐条触发响应式依赖和滚动更新。
let messageBatchDepth = 0
let pendingScreen = []
let pendingChat = []
let pendingLong = []
let displayNodeSeq = 0
let activeLinePerf = null

function dialogItemCount(dialog) {
  if (Array.isArray(dialog.buttons)) return dialog.buttons.length
  if (Array.isArray(dialog.lines)) return dialog.lines.length
  if (Array.isArray(dialog.introLines)) return dialog.introLines.length
  return dialog.prompt ? 1 : 0
}

function visibleEventText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return parseRich(value).map((seg) => seg.t || '').join('')
  if (value.raw != null) return visibleEventText(value.raw)
  if (value.segs) return value.segs.map((seg) => seg.t || '').join('')
  if (value.label) return visibleEventText(value.label)
  if (value.text != null) return String(value.text)
  return ''
}

function dialogEventText(dialog) {
  const values = [dialog.title, dialog.prompt]
  if (Array.isArray(dialog.lines)) values.push(...dialog.lines)
  if (Array.isArray(dialog.introLines)) values.push(...dialog.introLines)
  if (Array.isArray(dialog.buttons)) values.push(...dialog.buttons)
  return values.map(visibleEventText).filter(Boolean).join('\n')
}

function setDialog(dialog) {
  if (activeLinePerf) {
    const readyAt = Date.now()
    dialog._perf = {
      ...activeLinePerf,
      dialogReadyAt: readyAt,
      dialogType: dialog.type,
      itemCount: dialogItemCount(dialog)
    }
    const p = dialog._perf
    const wait = p.txAt ? Math.max(0, p.readStartedAt - p.txAt) : null
    const decodeFrame = p.framedAt - p.receivedAt
    const queue = p.protoStartedAt - p.enqueuedAt
    const parse = readyAt - p.protoStartedAt
    log(
      'DIALOG',
      p.traceId + ' 协议=' + p.protocol + ' 类型=' + dialog.type + ' 条目=' + p.itemCount,
      (p.txId ? '关联TX#' + p.txId + ' 发送→读取=' + wait + 'ms' : '无关联TX'),
      'Java读取=' + p.nativeReadMs + 'ms' +
        '(模式=' + (p.readMode || '回退') +
        ' 后台阻塞读=' + (p.nativeBlockReadMs || 0) + 'ms' +
        ' available=' + (p.availableMs || 0) + 'ms' +
        ' Socket.read=' + (p.socketReadMs || 0) + 'ms' +
        ' 字节复制=' + (p.byteCopyMs || 0) + 'ms' +
        ' 请求/返回=' + (p.requestedBytes || p.bytes) + '/' + p.bytes + 'B)',
      '解码分帧=' + decodeFrame + 'ms 队列=' + queue + 'ms 协议解析=' + parse + 'ms'
    )
  }
  state.dialog = dialog
  recordGameEvent('dialog', dialogEventText(dialog), { type: dialog.type })
}

function displayLine(text) {
  const id = ++displayNodeSeq
  return text === HR_LINE ? { id, hr: true } : { id, raw: String(text == null ? '' : text) }
}

function appendLimited(target, items, limit) {
  if (!items.length) return
  target.push(...items)
  if (target.length > limit) target.splice(0, target.length - limit)
}

function flushMessageBatch() {
  if (pendingScreen.length) {
    // 粘包中可能一次带来数百行，但主屏只保留 100 行。
    // 先裁剪原文再解析 ANSI，避免为马上会丢弃的行创建富文本节点。
    const keep = pendingScreen.slice(-100).map((text) => displayLine(text))
    state.screen = state.screen.concat(keep).slice(-100)
    pendingScreen = []
    state.screenScrollId++
  }
  if (pendingChat.length) {
    const keep = pendingChat.slice(-300).map((text) => displayLine(text))
    state.chat = state.chat.concat(keep).slice(-300)
    pendingChat = []
    state.chatScrollId++
  }
  if (pendingLong.length) {
    state.long = state.long.concat(pendingLong)
    pendingLong = []
  }
}

function beginMessageBatch() {
  messageBatchDepth++
}

function endMessageBatch(flush = true) {
  if (messageBatchDepth > 0) messageBatchDepth--
  if (messageBatchDepth === 0 && flush) flushMessageBatch()
}

function resetMessageBatch() {
  messageBatchDepth = 0
  pendingScreen = []
  pendingChat = []
  pendingLong = []
}
function setSend(fn) {
  sendFn = fn
}
function echoCmd(text) {
  // \x1b014 回显指令: 保证以且仅以一个 \n 结尾
  const s = String(text == null ? '' : text).replace(/[\r\n]+$/, '') + '\n'
  sendFn(s)
}

const HR = HR_LINE

function splitOnce(text, separator) {
  const pos = text.indexOf(separator)
  return pos < 0 ? [text] : [text.slice(0, pos), text.slice(pos + separator.length)]
}

function emptyDirs() {
  return { nw: null, n: null, ne: null, w: null, e: null, sw: null, s: null, se: null }
}

function isHrLine(line) {
  return line.startsWith('一'.repeat(15)) || line.startsWith('line_msg')
}

// ---------- 各协议处理器 (对应原版 writeTo* 函数) ----------

// \x1b002 房间标题
function writeTitle(t) {
  // 同一队列时间片内可能连续切换房间，旧房间尚未提交的场景必须丢弃。
  pendingLong = []
  resetRoom()
  state.title = { segs: parseRich(t) }
  recordGameEvent('here', t)
}

// \x1b003 出口/动作按钮
function writeExits(t) {
  const parts = t.split('$zj#')
  const newActs = []
  for (const part of parts) {
    if (part.length < 2) continue
    const s = part.split(':')
    const cmd = s.length === 3 ? s[2] : s[0]
    const labelText = s[1] || ''
    const d = s[0]
    let slot = null
    if (d === 'east' || d === 'eastup' || d === 'eastdown') slot = 'e'
    else if (d === 'west' || d === 'westup' || d === 'westdown') slot = 'w'
    else if (d === 'north' || d === 'northup' || d === 'northdown') slot = 'n'
    else if (d === 'south' || d === 'southup' || d === 'southdown') slot = 's'
    else if (d === 'southwest') slot = 'sw'
    else if (d === 'southeast') slot = 'se'
    else if (d === 'northwest') slot = 'nw'
    else if (d === 'northeast') slot = 'ne'
    if (slot) {
      state.dirs[slot] = { text: labelText, cmd }
    } else {
      newActs.push({ text: labelText, cmd })
    }
  }
  if (newActs.length) state.acts = state.acts.concat(newActs)
  recordGameEvent('exits', t)
  if (newActs.length) recordGameEvent('actions', t)
}

// \x1b903 移除出口
function removeExit(t) {
  const cmd = t.replace(/[\r\n]/g, '')
  for (const k in state.dirs) {
    if (state.dirs[k] && state.dirs[k].cmd === cmd) {
      state.dirs[k] = null
      recordGameEvent('exits', '移除出口：' + cmd)
      return
    }
  }
}

// \x1b004 场景描述
function writeLong(t) {
  recordGameEvent('long', t)
  const node = displayLine(t)
  if (messageBatchDepth > 0) pendingLong.push(node)
  else state.long.push(node)
}

// \x1b005 物品列表
function writeObjects(t) {
  const parts = t.split('$zj#')
  const objects = []
  for (const part of parts) {
    if (part.length < 2) continue
    const i = splitOnce(part, ':')
    if (!i[0] || i[1] === undefined) continue
    objects.push({ text: i[0], cmd: i[1], qi: 0, hp: 0, hpMax: 0 })
  }
  if (objects.length) state.objects = state.objects.concat(objects)
  if (objects.length) recordGameEvent('gameobj', t)
}

// \x1b905 移除物品
function removeObj(t) {
  const cmd = t.replace(/[\r\n]/g, '')
  const idx = state.objects.findIndex((o) => o.cmd === cmd)
  if (idx >= 0) {
    state.objects.splice(idx, 1)
    recordGameEvent('gameobj', '移除对象：' + cmd)
  }
}

// \x1b022 更新物品状态条
function updateQi(t) {
  const e = t.split('$zj#')
  if (e.length < 2) return
  const key = e[0].replace(/[\r\n]/g, '')
  const o = e[1].split(':')
  if (o.length < 3) return
  const obj = state.objects.find((x) => x.cmd === key)
  if (obj) {
    obj.qi = parseInt(o[0], 10) || 0
    obj.hp = parseInt(o[1], 10) || 0
    obj.hpMax = parseInt(o[2], 10) || 0
    recordGameEvent('gameobj', t)
  }
}

// \x1b100 聊天
function writeChat(t) {
  recordGameEvent('chat', t)
  if (messageBatchDepth > 0) {
    pendingChat.push(t)
  }
  else {
    const node = displayLine(t)
    appendLimited(state.chat, [node], 300)
    state.chatScrollId++
  }
}

// 动作按钮点击后服务器回传的 \x1b020 数据, 需要在客户端直接弹出 (对应原版 cmdsc)
function openPop(data) {
  writePop(data)
}

// \x1b015 / 默认 主输出
function writeScreen(t) {
  recordGameEvent('out', t)
  if (messageBatchDepth > 0) {
    pendingScreen.push(t)
  }
  else {
    const node = displayLine(t)
    appendLimited(state.screen, [node], 100)
    state.screenScrollId++
  }
}

// \x1b021 顶栏按钮
function writeBar(t) {
  const menu = []
  const parts = t.split('$zj#')
  for (const part of parts) {
    const i = splitOnce(part, ':')
    if (i.length < 2) continue
    menu.push({ text: i[0], cmd: i[1] })
  }
  state.tmenu = menu
  recordGameEvent('tmenu', t)
}

// \x1b006 自定菜单 (mycmds 面板)
function writeMyCmds(t) {
  const cmds = []
  const parts = t.split('$zj#')
  for (const part of parts) {
    if (part.length < 2) continue
    const first = part.indexOf(':')
    const second = first < 0 ? -1 : part.indexOf(':', first + 1)
    if (first < 0 || second < 0) continue
    const labelText = part.slice(first + 1, second)
    const cmd = part.slice(second + 1)
    if (!labelText || labelText === '***' || labelText === '暂未设定' || !cmd) continue
    cmds.push({ text: labelText, cmd })
  }
  state.mycmds = cmds
  recordGameEvent('mycmds', t)
  state.mycmdsCustom = false
  state.mycmdsVisible = true
}

// \x1b007 通用文本弹窗
function writeHd(t) {
  const lines = []
  const parts = t.split('$br#')
  for (const part of parts) {
    if (part.startsWith('一'.repeat(15))) {
      lines.push(displayLine(HR_LINE))
    } else {
      lines.push(displayLine(part))
    }
  }
  setDialog({ type: 'hd', title: state.dialogTitle || '', lines })
}

// \x1b011 地图弹窗
function writeMap(t) {
  const lines = []
  const parts = t.split('$br#')
  for (const part of parts) {
    lines.push(displayLine(part))
  }
  setDialog({ type: 'map', title: state.dialogTitle || '', lines })
}

// 解析弹窗头部 $e,o,i#  (返回 [e, o, i])
function parseGridHeader(t, defE, defO, defI, expandSingleRow = false) {
  let e = defE
  let o = defO
  let i = defI
  const m = t.match(/^\$.*?\#/)
  if (m) {
    const s = m[0].split(/[\$,\#]/)
    if (s[1]) {
      const v = parseInt(s[1], 10)
      if (!isNaN(v)) e = expandSingleRow && v === 1 ? 4 : v
    }
    if (s[2]) { const v = parseInt(s[2], 10); if (!isNaN(v)) o = v }
    if (s[3]) { const v = parseInt(s[3], 10); if (!isNaN(v)) i = v }
    t = t.replace(m[0], '')
  }
  return [e, o, i, t]
}

// \x1b008 / \x1b009 动作按钮网格弹窗
function writeAct(t) {
  const [e, o, i, rest] = parseGridHeader(t, 3, 3, 10, true)
  const buttons = []
  const parts = rest.split('$zj#')
  for (const part of parts) {
    const d = splitOnce(part, ':')
    if (d.length < 2) continue
    // 大列表先保留原文，RichText 仅在该按钮进入分批渲染窗口时解析。
    buttons.push({ text: d[0].replace(/\$br\#/g, '\n'), cmd: d[1] })
  }
  // 服务端通常先发 \x1b007 提示正文，下一行再发 \x1b008/009 按钮。
  // 008/009 也可能连续更新同一弹窗，合并时必须继续保留已接收的正文。
  setDialog(buildActionDialog(state.dialog, state.dialogTitle, {
    cols: e,
    widthPct: 97 / o,
    rowsH: i,
    buttons
  }))
}

// \x1b020 弹出按钮网格 (以 | 分隔)
function writePop(t) {
  const [e, o, i, rest] = parseGridHeader(t, 2, 2, 9)
  const buttons = []
  const parts = rest.split('$z2#')
  for (const part of parts) {
    const d = splitOnce(part, '|')
    if (d.length < 2) continue
    buttons.push({ text: d[0].replace(/\$br\#/g, '\n'), cmd: d[1] })
  }
  setDialog({ type: 'pop', title: state.dialogTitle || '', cols: e, widthPct: 100 / o - 1, rowsH: i, buttons })
}

// \x1b012 状态条 (HP)
function writeHp(t) {
  let e = 5
  let o = 5
  let i = 25
  const m = t.match(/^\$.*?\#/)
  if (m) {
    const s = m[0].split(/[\$,\#]/)
    if (s[1]) { const v = parseInt(s[1], 10); if (!isNaN(v)) e = v }
    if (s[2]) { const v = parseInt(s[2], 10); if (!isNaN(v)) o = v }
    if (s[3]) { const v = parseInt(s[3], 10); if (!isNaN(v)) i = v }
    t = t.replace(m[0], '')
  }

  const cells = t.split('║')
  const rows = []
  const perRow = e
  const h = () => {
    const r = []
    rows.push(r)
    return r
  }
  let row = h()

  const sanitizeColor = (c) => {
    if (!c) return null
    if (c.length === 9) c = c.substr(3)
    if (c.charAt(0) === '#') return c
    if (/^[0-9a-fA-F]{6}$/.test(c)) return '#' + c
    if (/^[0-9a-fA-F]{3}$/.test(c)) return '#' + c
    return null
  }

  for (const cell of cells) {
    const r = cell.split(':')
    const label = (r[0] || '').replace(/\$br\#/g, '\n')
    const color = sanitizeColor(r[2])
    const bars = []
    if (r.length > 2) {
      const sss = (r[1] || '').split('/')
      if (sss.length === 3) {
        const u = Math.min(99, (99 * (parseFloat(sss[0]) || 0)) / (parseFloat(sss[1]) || 1))
        const b = Math.min(100, (99 * (parseFloat(sss[1]) || 0)) / (parseFloat(sss[2]) || 1))
        bars.push({ pct: b, color: '#999999' })
        bars.push({ pct: u, color: color || '#00b800' })
      } else if (sss.length === 2) {
        const p = Math.min(99, (99 * (parseFloat(sss[0]) || 0)) / (parseFloat(sss[1]) || 1))
        bars.push({ pct: p, color: color || '#00b800' })
      } else {
        bars.push({ pct: 99, color: color || '#00b800' })
      }
    } else {
      bars.push({ pct: 99, color: color || '#00b800' })
    }
    // hp1.c 的部分状态格在颜色后还携带命令（如 exert recover）。
    // www 只绘制状态条而丢弃该字段；保留下来供移动端点击执行。
    row.push({ label, bars, cmd: r[3] || '', rowsH: i, colsTotal: o })
    if (row.length >= perRow) row = h()
  }
  state.hpRows = rows.filter((r) => r.length > 0)
  recordGameEvent('status', t)
}

// \x1b001 输入弹窗
function writeInput(t) {
  const e = splitOnce(t, '$zj#')
  const prompt = (e[0] || '').replace(/\$br\#/g, '\n')
  setDialog({
    type: 'input',
    title: state.dialogTitle || '',
    prompt: parseRich(prompt),
    cmdId: e[1] || ''
  })
}

// \x1b010 是协议预留的确认框。兼容“提示$zj#文字:指令...”和
// 只有提示两种格式；无按钮时至少完整展示消息，不再把协议前缀画到主屏。
function writeYesNo(t) {
  const parts = t.split('$zj#')
  const prompt = parts.shift() || ''
  const buttons = []
  for (const part of parts) {
    const pair = splitOnce(part, ':')
    if (pair.length === 2 && pair[1]) buttons.push({ label: parseRich(pair[0]), cmd: pair[1] })
  }
  if (buttons.length) {
    setDialog({
      type: 'confirm',
      title: state.dialogTitle || '',
      prompt: parseRich(prompt.replace(/\$br\#/g, '\n')),
      buttons
    })
  } else {
    writeHd(t)
  }
}

// \x1b013 more 分页文本。服务器随后通过 input_to 等待回车/q/b，
// 客户端提供对应按钮，避免移动端无法继续翻页。
function writeMore(t) {
  setDialog({
    type: 'more',
    title: state.dialogTitle || '更多',
    lines: t.split('$br#').map((line) => displayLine(line))
  })
}

function clearExits() {
  state.dirs = emptyDirs()
  state.acts = []
}

// ---------- 入口 ----------
function handleLineInternal(line) {
  if (line.length < 4) {
    dbg('PROTO', '忽略短行(<4):', escapeStr(line))
    return
  }

  if (isDebugEnabled()) dbg('PROTO', '收到行 >>', escapeStr(line))

  // 版本验证
  if (line.startsWith('版本验证成功')) {
    log('PROTO', '→ 版本验证成功, 进入登录阶段 (versionok)')
    if (state.stage !== 'loginok') state.stage = 'versionok'
    return
  }
  // 需要创建角色
  if (line.startsWith(ESC + '0000008')) {
    log('PROTO', '→ 需要创建角色 (charcreate)')
    if (state.stage !== 'loginok') state.stage = 'charcreate'
    return
  }
  // 登录成功, 进入主界面
  if (line.startsWith(ESC + '0000007')) {
    log('PROTO', '→ 登录成功, 进入主界面 (loginok)')
    enterGame()
    return
  }
  const loggedIn = state.stage === 'loginok'
  if (!loggedIn) {
    // 未登录状态下, 只有 \x1b015 开头的错误提示需要处理
    if (line.startsWith(ESC + '015')) {
      log('PROTO', '→ 登录失败提示:', line.substr(4))
      state.stage = 'error'
      state.statusMsg = line.substr(4)
    } else {
      dbg('PROTO', '→ 未登录状态, 忽略此行')
    }
    return
  }

  // 已登录, 按协议前缀分发
  let e = line
  if (isHrLine(line)) {
    dbg('PROTO', '→ 分隔线(hr)')
    e = HR_LINE
  }

  const pre = (p) => e.startsWith(ESC + p)

  if (pre('100')) { dbg('PROTO', '→ 聊天 writeChat'); writeChat(e.substr(4)) }
  else if (pre('001')) { dbg('PROTO', '→ 输入弹窗 writeInput'); writeInput(e.substr(4)) }
  else if (pre('002')) { dbg('PROTO', '→ 房间标题 writeTitle'); writeTitle(e.substr(4)) }
  else if (pre('003')) { dbg('PROTO', '→ 出口/动作 writeExits'); writeExits(e.substr(4)) }
  else if (pre('903')) { dbg('PROTO', '→ 移除出口 removeExit'); removeExit(e.substr(4)) }
  else if (pre('913')) { dbg('PROTO', '→ 清空出口 clearExits'); clearExits() }
  else if (pre('006')) { dbg('PROTO', '→ 自定面板 writeMyCmds'); writeMyCmds(e.substr(4).replace(/\$br\#/g, '\n')) }
  else if (pre('004')) { dbg('PROTO', '→ 场景描述 writeLong'); writeLong(e.substr(4)) }
  else if (pre('005')) { dbg('PROTO', '→ 物品列表 writeObjects'); writeObjects(e.substr(4)) }
  else if (pre('905')) { dbg('PROTO', '→ 移除物品 removeObj'); removeObj(e.substr(4)) }
  else if (pre('007')) { dbg('PROTO', '→ 文本弹窗 writeHd'); writeHd(e.substr(4)) }
  else if (pre('008') || pre('009')) { dbg('PROTO', '→ 动作网格 writeAct'); writeAct(e.substr(4)) }
  else if (pre('010')) { dbg('PROTO', '→ 确认弹窗 writeYesNo'); writeYesNo(e.substr(4)) }
  else if (pre('011')) { dbg('PROTO', '→ 地图弹窗 writeMap'); writeMap(e.substr(4)) }
  else if (pre('012')) { dbg('PROTO', '→ 状态条 writeHp'); writeHp(e.substr(4)) }
  else if (pre('013')) { dbg('PROTO', '→ 分页文本 writeMore'); writeMore(e.substr(4)) }
  else if (pre('014')) { dbg('PROTO', '→ 回显指令 echoCmd'); echoCmd(e.substr(4)) }
  else if (pre('015')) { dbg('PROTO', '→ 主输出 writeScreen'); writeScreen(e.substr(4)) }
  else if (pre('016') || pre('017')) { dbg('PROTO', '→ 战斗消息 writeScreen'); writeScreen(e.substr(4)) }
  else if (pre('020')) { dbg('PROTO', '→ 弹出网格 writePop'); writePop(e.substr(4)) }
  else if (pre('021')) { dbg('PROTO', '→ 顶栏按钮 writeBar'); writeBar(e.substr(4)) }
  else if (pre('022')) { dbg('PROTO', '→ 更新物品血条 updateQi'); updateQi(e.substr(4)) }
  else if (pre('023')) { dbg('PROTO', '→ 扩展场景 writeLong'); writeLong(e.substr(4)) }
  else if (pre('999')) {
    log('PROTO', '→ 服务器要求退出')
    state.statusMsg = e.substr(4) || '服务器已结束会话'
    state.connected = false
  }
  else { dbg('PROTO', '→ 默认主输出 writeScreen'); writeScreen(e) }
}

function handleLine(line, perf = null) {
  const protocol = line && line.charCodeAt(0) === 27 && line.length >= 4
    ? line.slice(1, 4)
    : 'text'
  activeLinePerf = perf ? { ...perf, protocol } : null
  try {
    handleLineInternal(line)
  } finally {
    state.gameRevision++
    activeLinePerf = null
  }
}



return { beginMessageBatch, endMessageBatch, resetMessageBatch, setSend, openPop, handleLine }
}
const defaultProtocol = createProtocol({state: defaultState, enterGame: enterDefaultGame, resetRoom: resetDefaultRoom, recordGameEvent: defaultRecordGameEvent})
export function beginMessageBatch(...args) { return defaultProtocol.beginMessageBatch(...args) }
export function endMessageBatch(...args) { return defaultProtocol.endMessageBatch(...args) }
export function resetMessageBatch(...args) { return defaultProtocol.resetMessageBatch(...args) }
export function setSend(...args) { return defaultProtocol.setSend(...args) }
export function openPop(...args) { return defaultProtocol.openPop(...args) }
export function handleLine(...args) { return defaultProtocol.handleLine(...args) }
export default defaultProtocol
