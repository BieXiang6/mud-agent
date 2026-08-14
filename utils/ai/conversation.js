function jsonObject(value) {
  if (!value) return null
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (_) {
    return null
  }
}

export function finishSummaryFromBlock(block) {
  if (!block || block.name !== 'finish') return ''
  const args = jsonObject(block.args)
  const result = jsonObject(block.result)
  return String((args && args.summary) || (result && result.summary) || '').trim()
}

export function markTurnFinished(turn, block) {
  if (!turn || !block || block.name !== 'finish' || block.status !== 'done' || block.isError) return false
  turn.completed = true
  turn.summary = finishSummaryFromBlock(block) || '任务已完成'
  turn.processExpanded = false
  return true
}

export function normalizeConversation(conversation) {
  return (Array.isArray(conversation) ? conversation : []).map((turn) => {
    if (!turn || turn.role !== 'assistant' || !Array.isArray(turn.blocks)) return turn
    const finish = [...turn.blocks].reverse().find((block) => (
      block && block.name === 'finish' && block.status === 'done' && !block.isError
    ))
    if (!finish) {
      if (!turn.completed) return turn
      return { ...turn, completed: false, summary: '' }
    }
    return {
      ...turn,
      completed: true,
      summary: String(turn.summary || finishSummaryFromBlock(finish) || '任务已完成'),
      processExpanded: Boolean(turn.processExpanded)
    }
  })
}
