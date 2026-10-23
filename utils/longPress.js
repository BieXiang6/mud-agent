// App-Plus touch events and desktop pointer events use the same recognizer.
export function pressPoint(event) {
  const touches = event && event.touches
  if (touches && touches.length !== 1) return null
  const point = touches ? touches[0] : event
  if (!point) return null
  const x = Number.isFinite(point.pageX) ? point.pageX : point.clientX
  const y = Number.isFinite(point.pageY) ? point.pageY : point.clientY
  return Number.isFinite(x) && Number.isFinite(y) ? { pageX: x, pageY: y } : null
}

export function createLongPress({ onLongPress, delayMs = 500, tolerance = 12, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null
  let origin = null
  let moved = false
  let fired = false
  let generation = 0
  function clear() {
    generation++
    if (timer != null) clearTimer(timer)
    timer = null
  }
  function end() {
    clear()
    origin = null
    const consumed = moved || fired
    moved = false
    fired = false
    return consumed
  }
  return {
    start(event) {
      clear()
      origin = pressPoint(event)
      moved = false
      fired = false
      if (!origin) return false
      const current = generation
      timer = setTimer(() => {
        if (current !== generation || !origin || moved || fired) return
        timer = null
        fired = true
        onLongPress()
      }, delayMs)
      return true
    },
    move(event) {
      if (!origin) return moved
      const point = pressPoint(event)
      if (!point || Math.hypot(point.pageX - origin.pageX, point.pageY - origin.pageY) > tolerance) {
        moved = true
        clear()
      }
      return moved
    },
    end,
    cancel: end
  }
}
