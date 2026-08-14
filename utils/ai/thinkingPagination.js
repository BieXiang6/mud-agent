export const THINKING_PAGE_CHARS = 1000

export function thinkingPageCount(content, pageSize = THINKING_PAGE_CHARS) {
  const length = String(content || '').length
  const size = Math.max(1, Number(pageSize) || THINKING_PAGE_CHARS)
  return Math.max(1, Math.ceil(length / size))
}

export function clampThinkingPage(content, page, pageSize = THINKING_PAGE_CHARS) {
  const count = thinkingPageCount(content, pageSize)
  return Math.max(0, Math.min(count - 1, Math.floor(Number(page) || 0)))
}

export function thinkingPageContent(content, page, pageSize = THINKING_PAGE_CHARS) {
  const text = String(content || '')
  const size = Math.max(1, Number(pageSize) || THINKING_PAGE_CHARS)
  const index = clampThinkingPage(text, page, size)
  return text.slice(index * size, (index + 1) * size)
}

export default { THINKING_PAGE_CHARS, thinkingPageCount, clampThinkingPage, thinkingPageContent }
