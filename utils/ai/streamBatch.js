export const STREAM_RENDER_INTERVAL_MS = 50

export function createStreamBatch(onFlush, options = {}) {
  const schedule = options.schedule || ((callback) => setTimeout(callback, STREAM_RENDER_INTERVAL_MS))
  const cancelSchedule = options.cancel || clearTimeout
  let timer = null
  let groups = []

  function flush() {
    if (timer != null) cancelSchedule(timer)
    timer = null
    if (!groups.length) return
    const pending = groups
    groups = []
    onFlush(pending.map((item) => ({ ...item, delta: item.chunks.join('') })))
  }

  function push(update) {
    if (!update || !update.turn || !update.type || !update.delta) return
    const last = groups[groups.length - 1]
    if (last && last.turn === update.turn && last.type === update.type && last.limit === update.limit) {
      last.chunks.push(String(update.delta))
    } else {
      groups.push({ turn: update.turn, type: update.type, limit: update.limit, chunks: [String(update.delta)] })
    }
    if (timer == null) timer = schedule(flush)
  }

  function cancel() {
    if (timer != null) cancelSchedule(timer)
    timer = null
    groups = []
  }

  return { push, flush, cancel }
}
