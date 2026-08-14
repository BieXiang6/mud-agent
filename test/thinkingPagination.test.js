import test from 'node:test'
import assert from 'node:assert/strict'
import { clampThinkingPage, thinkingPageContent, thinkingPageCount } from '../utils/ai/thinkingPagination.js'

test('paginates long thinking content without rendering the whole value', () => {
  const content = 'a'.repeat(1000) + 'b'.repeat(1000) + 'tail'

  assert.equal(thinkingPageCount(content), 3)
  assert.equal(thinkingPageContent(content, 0), 'a'.repeat(1000))
  assert.equal(thinkingPageContent(content, 1), 'b'.repeat(1000))
  assert.equal(thinkingPageContent(content, 2), 'tail')
})

test('clamps thinking pages when content or requested page changes', () => {
  assert.equal(thinkingPageCount(''), 1)
  assert.equal(clampThinkingPage('short', -3), 0)
  assert.equal(clampThinkingPage('x'.repeat(1500), 99), 1)
  assert.equal(thinkingPageContent('short', 99), 'short')
})
