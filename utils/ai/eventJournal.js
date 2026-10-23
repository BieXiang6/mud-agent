export function createEventJournal() {
const MAX_EVENTS = 2000

let nextSeq = 0
const events = []
const subscribers = new Set()

function recordGameEvent(region, text, details = null) {
  const event = {
    seq: ++nextSeq,
    timestamp: Date.now(),
    region: String(region || 'unknown'),
    text: String(text == null ? '' : text),
    ...(details ? { details } : {})
  }
  events.push(event)
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS)
  for (const subscriber of Array.from(subscribers)) {
    try { subscriber(event) } catch (_) {}
  }
  return event
}

function subscribeGameEvents(listener) {
  if (typeof listener !== 'function') throw new Error('事件监听器必须是函数')
  subscribers.add(listener)
  return () => subscribers.delete(listener)
}

function latestEventSeq() {
  return nextSeq
}

function queryGameEvents(options = {}) {
  const regionSet = options.regions && options.regions.length ? new Set(options.regions) : null
  const sinceSeq = Number(options.sinceSeq || 0)
  const sinceTime = Number(options.sinceTime || 0)
  const limit = Math.max(1, Math.min(Number(options.limit || 100), 500))
  const matched = events.filter((event) => (
    event.seq > sinceSeq &&
    event.timestamp >= sinceTime &&
    (!regionSet || regionSet.has(event.region))
  ))
  return {
    events: matched.slice(0, limit),
    latestSeq: nextSeq,
    hasMore: matched.length > limit,
    droppedBeforeSeq: events.length ? events[0].seq - 1 : 0
  }
}

function abortError() {
  const error = new Error('操作已取消')
  error.name = 'AbortError'
  return error
}

function waitForGameEvent(options = {}, signal) {
  const timeoutMs = Math.max(200, Math.min(Number(options.timeoutMs || 10000), 60000))
  const regions = options.regions && options.regions.length ? options.regions : null
  const regionSet = regions ? new Set(regions) : null
  const sinceSeq = Number(options.sinceSeq == null ? nextSeq : options.sinceSeq)
  let matcher = null
  if (options.mode !== 'any_change') {
    try {
      matcher = new RegExp(options.pattern, options.flags || '')
    } catch (error) {
      throw new Error('无效正则表达式：' + error.message)
    }
  }
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const poll = () => {
      if (signal && signal.aborted) return reject(abortError())
      const event = events.find((item) => item.seq > sinceSeq && (!regionSet || regionSet.has(item.region)) && (!matcher || matcher.test(item.text)))
      if (event) return resolve({ matched: true, event, latestSeq: nextSeq })
      if (Date.now() - startedAt >= timeoutMs) return resolve({ matched: false, latestSeq: nextSeq })
      timer = setTimeout(poll, 60)
    }
    let timer = setTimeout(poll, 0)
    if (signal) signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(abortError())
    }, { once: true })
  })
}

function clearGameEvents() {
  events.splice(0, events.length)
}

return { recordGameEvent, subscribeGameEvents, latestEventSeq, queryGameEvents, waitForGameEvent, clearGameEvents }
}
let activeJournal = createEventJournal()
export function setActiveEventJournal(journal) { activeJournal = journal }
export function recordGameEvent(...args) { return activeJournal.recordGameEvent(...args) }
export function subscribeGameEvents(...args) { return activeJournal.subscribeGameEvents(...args) }
export function latestEventSeq(...args) { return activeJournal.latestEventSeq(...args) }
export function queryGameEvents(...args) { return activeJournal.queryGameEvents(...args) }
export function waitForGameEvent(...args) { return activeJournal.waitForGameEvent(...args) }
export function clearGameEvents(...args) { return activeJournal.clearGameEvents(...args) }
