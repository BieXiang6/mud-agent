import test from 'node:test'
import assert from 'node:assert/strict'
import { createLongPress, pressPoint } from '../utils/longPress.js'

const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }] })
function fixture() {
  let now = 0
  let count = 0
  let sequence = 0
  const timers = new Map()
  const callbacks = []
  const gesture = createLongPress({
    onLongPress: () => count++,
    setTimer(callback, delay) { const id = sequence++; timers.set(id, { callback, at: now + delay }); callbacks.push(callback); return id },
    clearTimer: id => timers.delete(id)
  })
  return { gesture, callbacks, count: () => count, advance(ms) {
    now += ms
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback() }
  } }
}

test('Android-shaped touch events trigger once at 500ms without a framework longpress event', () => {
  const f = fixture()
  f.gesture.start(touch(100, 200))
  f.advance(499)
  assert.equal(f.count(), 0)
  f.advance(1)
  assert.equal(f.count(), 1)
  f.advance(1000)
  assert.equal(f.count(), 1)
  assert.equal(f.gesture.end(), true, 'release after a long hold must suppress the following tap')
  assert.equal(f.gesture.end(), false, 'finishing twice must not carry suppression into a new gesture')
})

test('small finger jitter preserves the hold; dragging cancels it even after moving back', () => {
  const f = fixture()
  f.gesture.start(touch(100, 200))
  assert.equal(f.gesture.move(touch(106, 206)), false)
  f.advance(500)
  assert.equal(f.count(), 1)
  f.gesture.end()
  f.gesture.start(touch(100, 200))
  assert.equal(f.gesture.move(touch(113, 200)), true)
  assert.equal(f.gesture.move(touch(100, 200)), true)
  f.advance(1000)
  assert.equal(f.count(), 1)
  assert.equal(f.gesture.end(), true)
})

test('short taps, touchcancel, page hiding and stale timers never open a list', () => {
  const f = fixture()
  f.gesture.start(touch(10, 20))
  f.advance(100)
  assert.equal(f.gesture.end(), false)
  f.advance(1000)
  assert.equal(f.count(), 0)
  f.gesture.start(touch(10, 20))
  f.gesture.cancel()
  f.advance(1000)
  f.callbacks[0]()
  assert.equal(f.count(), 0)
  f.gesture.start(touch(10, 20))
  f.callbacks[1]()
  assert.equal(f.count(), 0)
  f.advance(500)
  assert.equal(f.count(), 1)
})

test('uses page or client coordinates and cancels multi-touch', () => {
  assert.deepEqual(pressPoint({ touches: [{ pageX: 1, pageY: 2, clientX: 3, clientY: 4 }] }), { pageX: 1, pageY: 2 })
  assert.deepEqual(pressPoint({ clientX: 3, clientY: 4 }), { pageX: 3, pageY: 4 })
  assert.equal(pressPoint({ touches: [] }), null)
  const f = fixture()
  f.gesture.start(touch(10, 20))
  assert.equal(f.gesture.move({ touches: [{ clientX: 10, clientY: 20 }, { clientX: 30, clientY: 40 }] }), true)
  f.advance(500)
  assert.equal(f.count(), 0)
})
