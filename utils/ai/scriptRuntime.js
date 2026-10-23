import { validateScriptSource } from './scriptValidation.js'
export { validateScriptSource } from './scriptValidation.js'
import { getStoredScript } from './scriptStore.js'
import { getActiveGameBridge, getActiveSessionJournal } from '../gameSessions.js'
import { state } from '../store.js'

const MAX_RESULT_CHARS = 100000
const MAX_LOGS = 100
const jobs = new Map()
let nextRun = 0

function abortError(message = '脚本运行已取消') {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function jsonClone(value, field = '值') {
  if (value === undefined) return null
  let text
  try {
    text = JSON.stringify(value, (_key, item) => {
      if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
        throw new Error(field + ' 只能包含 JSON 数据')
      }
      return item
    })
  } catch (error) {
    throw new Error(field + ' 无法序列化：' + error.message)
  }
  if (text == null) return null
  if (text.length > MAX_RESULT_CHARS) throw new Error(field + ' 超过 ' + MAX_RESULT_CHARS + ' 字符')
  return JSON.parse(text)
}

function sleep(ms, signal) {
  const delay = Math.max(0, Math.min(Number(ms) || 0, 60000))
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const timer = setTimeout(done, delay)
    function done() {
      signal.removeEventListener('abort', cancel)
      resolve()
    }
    function cancel() {
      clearTimeout(timer)
      reject(abortError())
    }
    signal.addEventListener('abort', cancel, { once: true })
  })
}

function safeJob(job) {
  return jsonClone({
    id: job.id,
    scriptId: job.scriptId,
    scriptName: job.scriptName,
    functionName: job.functionName,
    origin: job.origin || 'manual',
    sessionId: job.sessionId || '',
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || 0,
    result: job.status === 'completed' ? job.result : undefined,
    error: job.error || '',
    logs: job.logs.slice()
  }, '运行结果')
}

function safeJobSummary(job) {
  return jsonClone({
    id: job.id,
    scriptId: job.scriptId,
    scriptName: job.scriptName,
    functionName: job.functionName,
    origin: job.origin || 'manual',
    sessionId: job.sessionId || '',
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt || 0,
    error: job.error || '',
    logCount: job.logs.length,
    latestLog: job.logs.length ? job.logs[job.logs.length - 1] : ''
  }, '运行摘要')
}

function buildGameApi(job, signal, cleanups) {
  function ensureActive() {
    if (signal.aborted) throw abortError()
  }
  const log = (...values) => {
    if (job.logs.length >= MAX_LOGS) return
    job.logs.push(values.map((value) => typeof value === 'string' ? value : JSON.stringify(jsonClone(value, '日志'))).join(' ').slice(0, 2000))
  }
  const api = {
    get(region = 'all', limit = 50) {
      ensureActive()
      return jsonClone(job.bridge.getRegionContent(region, limit), '游戏区域')
    },
    events(options = {}) {
      ensureActive()
      return jsonClone(job.journal.queryGameEvents(jsonClone(options, '事件查询参数')), '游戏事件')
    },
    latestSeq() {
      ensureActive()
      return job.journal.latestEventSeq()
    },
    async wait(options = {}) {
      ensureActive()
      return jsonClone(await job.journal.waitForGameEvent(jsonClone(options, '等待参数'), signal), '等待结果')
    },
    async send(command, options = {}) {
      ensureActive()
      return jsonClone(await job.bridge.sendGameCommand(String(command || ''), jsonClone(options, '发送参数'), signal), '发送结果')
    },
    async invoke(actionId, text = '') {
      ensureActive()
      return jsonClone(await job.bridge.invokeGameAction(String(actionId || ''), String(text || ''), signal), '动作结果')
    },
    sleep(ms) {
      ensureActive()
      return sleep(ms, signal)
    },
    on(regions, handler) {
      ensureActive()
      if (typeof handler !== 'function') throw new Error('game.on 的 handler 必须是函数')
      const values = Array.isArray(regions) ? regions : [regions]
      const regionSet = new Set(values.map((item) => String(item || '').trim()).filter(Boolean))
      if (!regionSet.size) throw new Error('game.on 至少需要一个区域')
      const unsubscribe = job.journal.subscribeGameEvents((event) => {
        if (signal.aborted || !regionSet.has(event.region)) return
        Promise.resolve().then(() => handler(jsonClone(event, '监听事件'))).catch((error) => log('监听器错误:', error && error.message || String(error)))
      })
      cleanups.push(unsubscribe)
      return () => {
        const index = cleanups.indexOf(unsubscribe)
        if (index >= 0) cleanups.splice(index, 1)
        return unsubscribe()
      }
    },
    keepAlive() {
      ensureActive()
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(abortError()), { once: true }))
    },
    log
  }
  return Object.freeze(api)
}

export function compileScript(source) {
  const checked = validateScriptSource(source)
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  return new AsyncFunction(
    'game', 'console', 'exports', 'module',
    'globalThis', 'window', 'document', 'self', 'global', 'process', 'require',
    'uni', 'plus', 'wx', 'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage',
    'sessionStorage', 'indexedDB', 'Worker', 'SharedWorker', 'WebAssembly', 'Function',
    'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
    '"use strict";\n' + checked + '\n'
  )
}

async function executeJob(job, script, args) {
  if (job.status === 'cancelled') {
    job.finishedAt = Date.now()
    return safeJob(job)
  }
  const controller = new AbortController()
  const cleanups = []
  job.controller = controller
  job.status = 'running'
  job.startedAt = Date.now()
  try {
    const exports = Object.create(null)
    const module = { exports }
    const game = buildGameApi(job, controller.signal, cleanups)
    const consoleApi = Object.freeze({ log: game.log, info: game.log, warn: game.log, error: game.log })
    const executor = compileScript(script.source)
    const blockedGlobals = Array(25).fill(undefined)
    await executor(game, consoleApi, exports, module, ...blockedGlobals)
    const exposed = module.exports
    const fn = exposed && exposed[job.functionName]
    if (typeof fn !== 'function') throw new Error('脚本未导出函数：' + job.functionName)
    const result = await fn(...jsonClone(args, '函数参数'))
    job.result = jsonClone(result, '函数返回值')
    job.status = 'completed'
  } catch (error) {
    if (controller.signal.aborted) {
      job.status = 'cancelled'
      job.error = '脚本运行已取消'
    } else {
      job.status = 'failed'
      job.error = error && error.message ? error.message : String(error)
    }
  } finally {
    for (const cleanup of cleanups.splice(0)) {
      try { cleanup() } catch (_) {}
    }
    job.finishedAt = Date.now()
    delete job.controller
    if (jobs.size > 100) {
      const finished = Array.from(jobs.values()).filter((item) => !['queued', 'running'].includes(item.status)).sort((a, b) => a.startedAt - b.startedAt)
      for (const old of finished.slice(0, jobs.size - 100)) jobs.delete(old.id)
    }
  }
  return safeJob(job)
}

export async function runStoredScript(options = {}) {
  const script = getStoredScript(options.scriptId || options.name)
  if (!script) throw new Error('脚本不存在：' + (options.scriptId || options.name || ''))
  const functionName = String(options.functionName || 'main').trim()
  if (!/^[A-Za-z_$][\w$]{0,79}$/.test(functionName)) throw new Error('函数名无效')
  const args = options.args == null ? [] : options.args
  if (!Array.isArray(args) || args.length > 20) throw new Error('args 必须是最多 20 项的数组')
  validateScriptSource(script.source)
  const id = 'run-' + Date.now().toString(36) + '-' + (++nextRun).toString(36)
  const job = {
    id, scriptId: script.id, scriptName: script.name, functionName,
    bridge: options.session ? options.session.bridge : getActiveGameBridge(),
    journal: options.session ? options.session.journal : getActiveSessionJournal(),
    sessionId: options.session ? options.session.gameState.sessionId : state.sessionId,
    origin: options.origin === 'agent' ? 'agent' : 'manual',
    status: 'queued', startedAt: 0, finishedAt: 0, result: null, error: '', logs: []
  }
  jobs.set(id, job)
  const completion = Promise.resolve().then(() => executeJob(job, script, args))
  job.completion = completion
  const externalSignal = options.signal
  if (externalSignal) {
    const abort = () => cancelScriptRun(id)
    if (externalSignal.aborted) abort()
    else {
      externalSignal.addEventListener('abort', abort, { once: true })
      const cleanup = () => externalSignal.removeEventListener('abort', abort)
      completion.then(cleanup, cleanup)
    }
  }
  if (options.waitForResult === false) return { id, status: 'queued', nonBlocking: true }
  return completion
}

export function getScriptRun(runId, sessionId) {
  const job = jobs.get(String(runId || ''))
  if (!job) throw new Error('脚本运行不存在或已过期：' + runId)
  if (sessionId != null && job.sessionId !== sessionId) throw new Error('该脚本运行属于其他账号')
  return safeJob(job)
}

export function listScriptRuns(options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 50, 100))
  return Array.from(jobs.values())
    .sort((left, right) => {
      const leftActive = ['queued', 'running'].includes(left.status) ? 1 : 0
      const rightActive = ['queued', 'running'].includes(right.status) ? 1 : 0
      return rightActive - leftActive || Math.max(right.startedAt, right.finishedAt) - Math.max(left.startedAt, left.finishedAt)
    })
    .slice(0, limit)
    .map(safeJobSummary)
}

export function cancelScriptRun(runId, sessionId) {
  const job = jobs.get(String(runId || ''))
  if (!job) throw new Error('脚本运行不存在或已过期：' + runId)
  if (sessionId != null && job.sessionId !== sessionId) throw new Error('该脚本运行属于其他账号')
  if (!['queued', 'running'].includes(job.status)) return safeJob(job)
  job.abortReason = 'cancelled'
  if (job.controller) job.controller.abort()
  else job.status = 'cancelled'
  return safeJob(job)
}

export default { validateScriptSource, runStoredScript, getScriptRun, listScriptRuns, cancelScriptRun }
