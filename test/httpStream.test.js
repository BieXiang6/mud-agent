import test from 'node:test'
import assert from 'node:assert/strict'
import { collectTextStream, createAsyncTextStream } from '../utils/ai/httpStream.js'

test('delivers model response chunks before the stream ends', async () => {
  const stream = createAsyncTextStream()
  const iterator = stream.iterable[Symbol.asyncIterator]()
  stream.push('reasoning-1')
  assert.deepEqual(await iterator.next(), { value: 'reasoning-1', done: false })
  const pending = iterator.next()
  stream.push('reasoning-2')
  assert.deepEqual(await pending, { value: 'reasoning-2', done: false })
  stream.end()
  assert.deepEqual(await iterator.next(), { value: undefined, done: true })
})

test('collects buffered chunks and propagates stream failures', async () => {
  const complete = createAsyncTextStream()
  complete.push('a')
  complete.push('b')
  complete.end()
  assert.equal(await collectTextStream(complete.iterable), 'ab')

  const failed = createAsyncTextStream()
  const reading = collectTextStream(failed.iterable)
  failed.fail(new Error('network lost'))
  await assert.rejects(reading, /network lost/)
})
