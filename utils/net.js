// Foreground commands delegate to one account; background callbacks retain their own clients.
import { activeNetworkClient, configureSessionNetworkPlatform } from './gameSessions.js'
import { getActiveGameState } from './store.js'
import { setSend } from './proto.js'
export function connect(host, port, handlers = {}) {
  const gameState = getActiveGameState()
  const guarded = { ...handlers }
  for (const name of ['onOpen', 'onClose', 'onError']) {
    if (handlers[name]) guarded[name] = (...args) => {
      if (getActiveGameState() === gameState) handlers[name](...args)
    }
  }
  return activeNetworkClient().connect(host, port, guarded)
}
export function send(...args) { return activeNetworkClient().send(...args) }
export function sendLine(...args) { return activeNetworkClient().sendLine(...args) }
export function sendHandshake(...args) { return activeNetworkClient().sendHandshake(...args) }
export function close(...args) { return activeNetworkClient().close(...args) }
export function quit(...args) { return activeNetworkClient().quit(...args) }
export const configureNetworkPlatform = configureSessionNetworkPlatform
setSend(send)
export default { connect, send, sendLine, sendHandshake, close, quit, configureNetworkPlatform }
