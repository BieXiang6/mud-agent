import test from 'node:test'
import assert from 'node:assert/strict'
import { estimateTextTokens, mergeTokenUsage } from '../utils/ai/tokenUsage.js'

test('estimates block tokens using the same conservative character ratio as context usage', () => {
  assert.equal(estimateTextTokens(''), 0)
  assert.equal(estimateTextTokens('1234'), 1)
  assert.equal(estimateTextTokens('12345'), 2)
})

test('accumulates provider token usage across agent tool cycles', () => {
  const first = mergeTokenUsage(null, { input: 100, output: 30, reasoning: 10, totalTokens: 130 })
  const total = mergeTokenUsage(first, { input: 80, output: 20, reasoning: 5, totalTokens: 100 })

  assert.deepEqual(total, {
    input: 180,
    output: 50,
    reasoning: 15,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 230
  })
})
