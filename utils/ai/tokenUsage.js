function safeCount(value) {
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 0
}

export function estimateTextTokens(value) {
  return Math.ceil(String(value || '').length / 4)
}

export function mergeTokenUsage(current, usage) {
  const previous = current || {}
  const next = usage || {}
  return {
    input: safeCount(previous.input) + safeCount(next.input),
    output: safeCount(previous.output) + safeCount(next.output),
    reasoning: safeCount(previous.reasoning) + safeCount(next.reasoning),
    cacheRead: safeCount(previous.cacheRead) + safeCount(next.cacheRead),
    cacheWrite: safeCount(previous.cacheWrite) + safeCount(next.cacheWrite),
    totalTokens: safeCount(previous.totalTokens) + safeCount(next.totalTokens)
  }
}

export default { estimateTextTokens, mergeTokenUsage }
