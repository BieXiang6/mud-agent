export function createAsyncTextStream() {
  const queued = []
  const waiting = []
  let ended = false
  let failure = null

  function settleWaiting() {
    while (waiting.length && queued.length) waiting.shift().resolve({ value: queued.shift(), done: false })
    if (!waiting.length || (!ended && !failure)) return
    const pending = waiting.splice(0)
    if (failure) pending.forEach(({ reject }) => reject(failure))
    else pending.forEach(({ resolve }) => resolve({ value: undefined, done: true }))
  }

  function push(value) {
    if (ended || failure || value == null || value === '') return
    queued.push(String(value))
    settleWaiting()
  }

  function end() {
    if (ended || failure) return
    ended = true
    settleWaiting()
  }

  function fail(error) {
    if (ended || failure) return
    failure = error instanceof Error ? error : new Error(String(error || '流式请求失败'))
    settleWaiting()
  }

  const iterable = {
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (queued.length) return Promise.resolve({ value: queued.shift(), done: false })
          if (failure) return Promise.reject(failure)
          if (ended) return Promise.resolve({ value: undefined, done: true })
          return new Promise((resolve, reject) => waiting.push({ resolve, reject }))
        }
      }
    }
  }

  return { push, end, fail, iterable }
}

export async function collectTextStream(iterable) {
  let result = ''
  for await (const chunk of iterable) result += chunk
  return result
}
