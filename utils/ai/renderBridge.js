import { reactive } from 'vue'

// The native renderjs host is shared, while every request retains its own owner.
export const aiRenderState = reactive({ requestPayload: '', cancelPayload: '' })
const handlers = new Map()
const requests = new Map()
const cancellations = new Set()
let requestId = 0
let sequence = 0

export function allocateAiRequestId() { return ++requestId }
export function registerAiRequest(id, handler) { handlers.set(id, handler) }
export function unregisterAiRequest(id) {
  handlers.delete(id)
  if (requests.delete(id)) refreshAiRenderBridge()
}
export function refreshAiRenderBridge() {
  aiRenderState.requestPayload = JSON.stringify({ requests: Array.from(requests.values()), sequence: ++sequence })
  aiRenderState.cancelPayload = JSON.stringify({ ids: Array.from(cancellations), sequence: ++sequence })
}
export function publishAiRenderRequest(request) {
  requests.set(request.id, request)
  refreshAiRenderBridge()
}
export function publishAiRenderCancel(id) {
  cancellations.add(id)
  refreshAiRenderBridge()
}
export function handleAiRenderEvent(event) {
  if (!event || !event.id) return
  if (event.phase === 'started' && requests.delete(event.id)) refreshAiRenderBridge()
  if (event.phase === 'cancelled') {
    if (cancellations.delete(event.id)) refreshAiRenderBridge()
    return
  }
  const handler = handlers.get(event.id)
  if (handler) handler(event)
}
