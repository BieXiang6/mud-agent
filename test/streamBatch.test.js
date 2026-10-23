import test from 'node:test'
import assert from 'node:assert/strict'
import { createStreamBatch } from '../utils/ai/streamBatch.js'

test('coalesces frequent stream deltas before updating reactive UI', () => {
  let scheduled
  const flushed = []
  const turn = {}
  const batch = createStreamBatch((updates) => flushed.push(updates), {
    schedule(callback) { scheduled = callback; return 1 },
    cancel() {}
  })
  batch.push({ turn, type: 'thinking', delta: 'a', limit: 20000 })
  batch.push({ turn, type: 'thinking', delta: 'b', limit: 20000 })
  batch.push({ turn, type: 'thinking', delta: 'c', limit: 20000 })
  assert.equal(flushed.length, 0)
  scheduled()
  assert.equal(flushed.length, 1)
  assert.equal(flushed[0][0].delta, 'abc')
})

test('flushes text and thinking in their original block order', () => {
  const flushed = []
  const turn = {}
  const batch = createStreamBatch((updates) => flushed.push(...updates), {
    schedule() { return 1 },
    cancel() {}
  })
  batch.push({ turn, type: 'thinking', delta: 'plan', limit: 20000 })
  batch.push({ turn, type: 'text', delta: 'answer', limit: 12000 })
  batch.flush()
  assert.deepEqual(flushed.map((item) => [item.type, item.delta]), [['thinking', 'plan'], ['text', 'answer']])
})
