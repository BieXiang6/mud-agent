import { parseRich } from '../ansi.js'
import { state } from '../store.js'
import net from '../net.js'
import { openPop } from '../proto.js'
import { latestEventSeq, queryGameEvents, waitForGameEvent } from './eventJournal.js'
import { validateCommandBatch } from './commandBatch.js'

const ESC = String.fromCharCode(27)
const DIRS = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
const REGIONS = ['all', 'out', 'chat', 'dialog', 'exits', 'here', 'long', 'gameobj', 'actions', 'tmenu', 'mycmds', 'status']
const EVENT_REGIONS = REGIONS.filter((region) => region !== 'all')
const REGION_ALIASES = {
  screen: 'out',
  output: 'out',
  room: 'here',
  title: 'here',
  description: 'long',
  objects: 'gameobj',
  gameobjects: 'gameobj',
  gameobjs: 'gameobj',
  acts: 'actions',
  menu: 'tmenu',
  hp: 'status',
  snapshot: 'all',
  game: 'all'
}
const MAX_WAIT_MS = 60000
const emptySchema = { type: 'object', properties: {}, additionalProperties: false }
const actionRegistry = new Map()
let commandBlacklist = new Set()

function objectSchema(properties, required = []) {
  return { type: 'object', properties, required, additionalProperties: false }
}

function segsText(segs) {
  return Array.isArray(segs) ? segs.map((seg) => seg && seg.t ? seg.t : '').join('') : ''
}

function plain(value) {
  if (value == null) return ''
  if (typeof value === 'string') return segsText(parseRich(value))
  if (value.hr) return '---'
  if (value.raw != null) return segsText(parseRich(value.raw))
  if (value.segs) return segsText(value.segs)
  if (value.label) return segsText(value.label)
  if (value.text != null) return String(value.text)
  return ''
}

function recent(items, limit) {
  return (Array.isArray(items) ? items : []).slice(-limit).map(plain).filter(Boolean)
}

function registerAction(region, key, item, kind = 'command') {
  if (!item) return null
  const command = item.cmd || ''
  const id = region + ':' + state.gameRevision + ':' + key
  actionRegistry.set(id, { region, key: String(key), command, kind, revision: state.gameRevision })
  if (actionRegistry.size > 1000) {
    const oldest = actionRegistry.keys().next().value
    actionRegistry.delete(oldest)
  }
  return { id, label: plain(item), command: kind === 'input' ? undefined : command }
}

function indexedActions(region, items) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    index,
    text: plain(item),
    action: item && item.cmd ? registerAction(region, index, item) : null
  }))
}

function dialogSnapshot() {
  const dialog = state.dialog
  if (!dialog) return null
  const lines = dialog.lines || dialog.introLines || []
  const buttons = indexedActions('dialog', dialog.buttons)
  if (dialog.type === 'input' && dialog.cmdId) {
    buttons.push({
      index: buttons.length,
      text: '提交输入',
      action: registerAction('dialog', 'submit', { cmd: dialog.cmdId, text: '提交输入' }, 'input')
    })
  }
  return {
    type: dialog.type,
    title: dialog.title || '',
    text: recent(lines, 100),
    prompt: plain({ segs: dialog.prompt }),
    actions: buttons,
    acceptsText: dialog.type === 'input'
  }
}

function exitsSnapshot() {
  const result = {}
  for (const direction of DIRS) {
    const exit = state.dirs[direction]
    if (exit) result[direction] = { text: plain(exit), action: registerAction('exits', direction, exit) }
  }
  return result
}

export function getRegionContent(region, limit = 50) {
  region = String(region || '').trim().toLowerCase()
  region = REGION_ALIASES[region] || region
  const safeLimit = Math.max(1, Math.min(Number(limit || 50), 300))
  const base = { region, revision: state.gameRevision, latestSeq: latestEventSeq() }
  if (region === 'out') return { ...base, messages: recent(state.screen, safeLimit) }
  if (region === 'chat') return { ...base, messages: recent(state.chat, safeLimit) }
  if (region === 'long') return { ...base, messages: recent(state.long, safeLimit) }
  if (region === 'here') return { ...base, text: plain(state.title) }
  if (region === 'exits') return { ...base, exits: exitsSnapshot() }
  if (region === 'gameobj') return { ...base, items: indexedActions('gameobj', state.objects) }
  if (region === 'actions') return { ...base, items: indexedActions('actions', state.acts) }
  if (region === 'tmenu') return { ...base, items: indexedActions('tmenu', state.tmenu) }
  if (region === 'mycmds') return { ...base, items: indexedActions('mycmds', state.mycmds) }
  if (region === 'dialog') return { ...base, dialog: dialogSnapshot() }
  if (region === 'status') {
    return {
      ...base,
      rows: state.hpRows.map((row, rowIndex) => row.map((cell, cellIndex) => ({
        text: cell.label,
        bars: cell.bars,
        action: cell.cmd ? registerAction('status', rowIndex + '-' + cellIndex, cell) : null
      })))
    }
  }
  if (region === 'all') return getGameSnapshot(safeLimit)
  throw new Error('未知游戏区域：' + region)
}

export function getGameSnapshot(limit = 50) {
  return {
    revision: state.gameRevision,
    latestSeq: latestEventSeq(),
    connected: state.connected && state.stage === 'loginok',
    here: getRegionContent('here', limit),
    long: getRegionContent('long', limit),
    out: getRegionContent('out', limit),
    chat: getRegionContent('chat', limit),
    exits: getRegionContent('exits', limit),
    gameobj: getRegionContent('gameobj', limit),
    actions: getRegionContent('actions', limit),
    tmenu: getRegionContent('tmenu', limit),
    mycmds: getRegionContent('mycmds', limit),
    dialog: getRegionContent('dialog', limit),
    status: getRegionContent('status', limit)
  }
}

export function configureCommandBlacklist(value) {
  const entries = Array.isArray(value) ? value : String(value || '').split(/[\s,，]+/)
  commandBlacklist = new Set(entries.map((item) => String(item).trim().toLowerCase()).filter(Boolean))
  return Array.from(commandBlacklist)
}

function abortError() {
  const error = new Error('操作已取消')
  error.name = 'AbortError'
  return error
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError())
    const timer = setTimeout(done, ms)
    function done() {
      if (signal) signal.removeEventListener('abort', cancel)
      resolve()
    }
    function cancel() {
      clearTimeout(timer)
      reject(abortError())
    }
    if (signal) signal.addEventListener('abort', cancel, { once: true })
  })
}

async function waitForSettledUpdate(after, timeoutMs, signal) {
  const started = Date.now()
  while (state.gameRevision <= after) {
    if (signal && signal.aborted) throw abortError()
    if (Date.now() - started >= timeoutMs) return false
    await delay(60, signal)
  }
  let revision = state.gameRevision
  const settleStarted = Date.now()
  while (Date.now() - settleStarted < 900) {
    await delay(180, signal)
    if (state.gameRevision === revision) return true
    revision = state.gameRevision
  }
  return true
}

function success(data, terminate = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    details: data,
    ...(terminate ? { terminate: true } : {})
  }
}

async function sendAndObserve(command, signal, commandCount = 1) {
  if (!state.connected || state.stage !== 'loginok') throw new Error('游戏未连接')
  const beforeRevision = state.gameRevision
  const beforeSeq = latestEventSeq()
  net.sendLine(command)
  const changed = await waitForSettledUpdate(beforeRevision, 5000, signal)
  return { accepted: true, commandCount, changed, sentAt: Date.now(), beforeSeq, latestSeq: latestEventSeq(), revision: state.gameRevision }
}

function currentAction(registration) {
  const key = registration.key
  if (registration.region === 'exits') return state.dirs[key]
  if (registration.region === 'gameobj') return state.objects[Number(key)]
  if (registration.region === 'actions') return state.acts[Number(key)]
  if (registration.region === 'tmenu') return state.tmenu[Number(key)]
  if (registration.region === 'mycmds') return state.mycmds[Number(key)]
  if (registration.region === 'dialog') return state.dialog && registration.kind === 'input'
    ? { cmd: state.dialog.cmdId }
    : state.dialog && state.dialog.buttons && state.dialog.buttons[Number(key)]
  if (registration.region === 'status') {
    const parts = key.split('-').map(Number)
    return state.hpRows[parts[0]] && state.hpRows[parts[0]][parts[1]]
  }
  return null
}

export async function invokeGameAction(actionId, text, signal) {
  const registration = actionRegistry.get(actionId)
  if (!registration) throw new Error('动作不存在或已过期，请重新读取区域')
  const current = currentAction(registration)
  if (!current || current.cmd !== registration.command) throw new Error('动作已失效，请重新读取区域')
  let command = registration.command
  if (registration.kind === 'input') {
    if (!String(text || '').trim()) throw new Error('该动作需要提供 text')
    command = command.replace('$txt#', String(text).slice(0, 500))
  }
  const dialog = state.dialog
  if (registration.region === 'dialog') state.dialog = null
  if (dialog && dialog.type === 'act' && command.startsWith(ESC + '020')) {
    openPop(command.slice(4))
    return { accepted: true, changed: true, revision: state.gameRevision, latestSeq: latestEventSeq() }
  }
  return sendAndObserve(command, signal)
}

export async function sendGameCommand(command, options = {}, signal) {
  if (options.expectedRevision != null && Number(options.expectedRevision) !== state.gameRevision) {
    throw new Error('游戏状态已变化，请重新读取区域')
  }
  const validated = validateCommandBatch(command, commandBlacklist)
  return sendAndObserve(validated.command, signal, validated.commands.length)
}

export function createMudTools() {
  return [
    {
      name: 'get_region_content',
      label: '读取游戏区域',
      description: '读取指定游戏区域的当前内容。out、chat、long 可通过 limit 获取近期历史；返回的 action.id 可交给 invoke_game_action。',
      parameters: objectSchema({
        region: { type: 'string', minLength: 1, maxLength: 30, description: '支持 all/out/chat/dialog/exits/here/long/gameobj/actions/tmenu/mycmds/status，以及常见英文别名' },
        limit: { type: 'integer', minimum: 1, maximum: 300 }
      }, ['region']),
      executionMode: 'sequential',
      execute: async (_id, params) => success(getRegionContent(params.region, params.limit))
    },
    {
      name: 'get_region_events',
      label: '读取消息记录',
      description: '按递增序号、时间和区域读取接收事件。优先使用 sinceSeq 防止重复或遗漏。',
      parameters: objectSchema({
        sinceSeq: { type: 'integer', minimum: 0 },
        sinceTime: { type: 'integer', minimum: 0 },
        regions: { type: 'array', items: { type: 'string', enum: EVENT_REGIONS }, maxItems: EVENT_REGIONS.length },
        limit: { type: 'integer', minimum: 1, maximum: 500 }
      }),
      executionMode: 'sequential',
      execute: async (_id, params) => success(queryGameEvents(params))
    },
    {
      name: 'wait_for_region_match',
      label: '等待指定文本',
      description: '严格用于等待刚执行动作后的新消息。mode=match 时必须提供具体正则；只有明确目的是持续监听某区域任意变化时才允许 mode=any_change。调用前必须填写 trigger 和 sinceSeq；普通状态读取必须使用 get_region_content。',
      parameters: objectSchema({
        regions: { type: 'array', items: { type: 'string', enum: EVENT_REGIONS }, minItems: 1, maxItems: EVENT_REGIONS.length },
        mode: { type: 'string', enum: ['match', 'any_change'] },
        pattern: { type: 'string', minLength: 1, maxLength: 300 },
        flags: { type: 'string', pattern: '^[im]*$', maxLength: 2 },
        sinceSeq: { type: 'integer', minimum: 0 },
        trigger: { type: 'string', minLength: 3, maxLength: 300 },
        timeoutMs: { type: 'integer', minimum: 200, maximum: MAX_WAIT_MS }
      }, ['regions', 'mode', 'sinceSeq', 'trigger']),
      executionMode: 'sequential',
      execute: async (_id, params, signal) => {
        const pattern = String(params.pattern || '')
        if (params.mode === 'match' && (/^(?:\\?\.\*|\\?\.\+|\\?\.|\[\\s\\S\]|\[\\s\\S\]\*)$/.test(pattern) || pattern.length < 2)) {
          throw new Error('等待模式过于宽泛，请使用 get_region_content 读取当前状态')
        }
        if (params.mode === 'any_change' && pattern) throw new Error('any_change 不需要 pattern，请明确填写监听目的 trigger')
        return success(await waitForGameEvent(params, signal))
      }
    },
    {
      name: 'send_game_command',
      label: '发送游戏指令',
      description: '发送一条或多条游戏指令。多条指令使用换行符（\\n）分隔；每条指令都会按第一个空格前的命令词匹配用户黑名单。禁止空指令、分号和协议控制字符。',
      parameters: objectSchema({
        command: { type: 'string', minLength: 1, maxLength: 500, description: '要发送的指令；多条指令以换行符（\\n）分隔' },
        expectedRevision: { type: 'integer', minimum: 0 }
      }, ['command']),
      executionMode: 'sequential',
      execute: async (_id, params, signal) => {
        if (params.expectedRevision != null && params.expectedRevision !== state.gameRevision) throw new Error('游戏状态已变化，请重新读取区域')
        return success(await sendGameCommand(params.command, { expectedRevision: params.expectedRevision }, signal))
      }
    },
    {
      name: 'invoke_game_action',
      label: '执行界面动作',
      description: '执行 get_region_content 返回的 action.id，可处理出口、对象、动作、菜单、状态和弹窗输入。',
      parameters: objectSchema({
        actionId: { type: 'string', minLength: 1, maxLength: 200 },
        text: { type: 'string', maxLength: 500 }
      }, ['actionId']),
      executionMode: 'sequential',
      execute: async (_id, params, signal) => success(await invokeGameAction(params.actionId, params.text, signal))
    },
    {
      name: 'finish',
      label: '结束任务',
      description: '结束本次任务的唯一方式。目标完成、确认无法继续或需要用户接管时必须调用，并在 summary 中总结结果、关键状态和未完成事项；禁止仅用普通回答结束任务。',
      parameters: objectSchema({
        summary: { type: 'string', minLength: 1, maxLength: 1000, description: '给用户的最终中文总结，说明完成结果；未完成时说明原因和下一步。' }
      }, ['summary']),
      executionMode: 'sequential',
      execute: async (_id, params) => {
        const summary = String(params.summary || '').trim()
        if (!summary) throw new Error('finish.summary 不能为空')
        return success({ summary }, true)
      }
    }
  ]
}

export default { createMudTools, getGameSnapshot, getRegionContent, configureCommandBlacklist }
