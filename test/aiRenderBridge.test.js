import test from 'node:test'
import assert from 'node:assert/strict'
import { aiRenderState, allocateAiRequestId, registerAiRequest, unregisterAiRequest, publishAiRenderRequest, publishAiRenderCancel, handleAiRenderEvent } from '../utils/ai/renderBridge.js'

test('multiplexes concurrent requests without overwriting same-tick native payloads', () => {
  const a = allocateAiRequestId()
  const b = allocateAiRequestId()
  const receivedA = []
  const receivedB = []
  registerAiRequest(a, event => receivedA.push(event))
  registerAiRequest(b, event => receivedB.push(event))
  publishAiRenderRequest({ id: a, url: 'https://a.invalid' })
  publishAiRenderRequest({ id: b, url: 'https://b.invalid' })
  assert.deepEqual(JSON.parse(aiRenderState.requestPayload).requests.map(request => request.id), [a, b])
  handleAiRenderEvent({ id: b, phase: 'started' })
  assert.deepEqual(JSON.parse(aiRenderState.requestPayload).requests.map(request => request.id), [a])
  handleAiRenderEvent({ id: a, phase: 'chunk', chunk: 'only-A' })
  handleAiRenderEvent({ id: b, phase: 'chunk', chunk: 'only-B' })
  assert.equal(receivedA[0].chunk, 'only-A')
  assert.equal(receivedB[1].chunk, 'only-B')
  unregisterAiRequest(a)
  handleAiRenderEvent({ id: a, phase: 'chunk', chunk: 'late' })
  assert.equal(receivedA.length, 1)
  unregisterAiRequest(b)
})

test('retains all simultaneous cancellations until the bridge acknowledges them', () => {
  const a = allocateAiRequestId()
  const b = allocateAiRequestId()
  publishAiRenderCancel(a)
  publishAiRenderCancel(b)
  assert.deepEqual(JSON.parse(aiRenderState.cancelPayload).ids, [a, b])
  handleAiRenderEvent({ id: a, phase: 'cancelled' })
  assert.deepEqual(JSON.parse(aiRenderState.cancelPayload).ids, [b])
  handleAiRenderEvent({ id: b, phase: 'cancelled' })
  assert.deepEqual(JSON.parse(aiRenderState.cancelPayload).ids, [])
})
