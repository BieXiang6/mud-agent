import { computed, shallowReactive } from 'vue'
import { createGameState, enterGame, getActiveGameState, resetRoom, setActiveGameState } from './store.js'
import { createProtocol } from './proto.js'
import { createNetworkClient } from './networkClient.js'
import { createEventJournal, setActiveEventJournal } from './ai/eventJournal.js'
import { configurePlatform } from './platform/index.js'
import { profileId } from './loginProfiles.js'
import { createGameBridge } from './ai/gameBridge.js'

export const MAX_GAME_SESSIONS = 5
const sessions = shallowReactive(new Map())
const clients = new WeakMap()
const journals = new WeakMap()
const protocols = new WeakMap()
const bridges = new WeakMap()

function journalFor(gameState) {
  if (!journals.has(gameState)) journals.set(gameState, createEventJournal())
  return journals.get(gameState)
}

function networkClientFor(gameState) {
  if (!clients.has(gameState)) {
    const journal = journalFor(gameState)
    const protocol = createProtocol({
      state: gameState,
      enterGame: () => enterGame(gameState, journal.clearGameEvents),
      resetRoom: () => resetRoom(gameState),
      recordGameEvent: journal.recordGameEvent
    })
    protocols.set(gameState, protocol)
    clients.set(gameState, createNetworkClient(gameState, protocol, { sessionId: gameState.sessionId || 'default' }))
  }
  return clients.get(gameState)
}

export function activeNetworkClient() {
  const gameState = getActiveGameState()
  setActiveEventJournal(journalFor(gameState))
  return networkClientFor(gameState)
}

export function getActiveSessionJournal() { return journalFor(getActiveGameState()) }
export function getActiveGameBridge() {
  setActiveEventJournal(journalFor(getActiveGameState()))
  return getGameSessionContext().bridge
}

export function getGameSessionContext(gameState = getActiveGameState()) {
  const net = networkClientFor(gameState)
  if (!bridges.has(gameState)) bridges.set(gameState, createGameBridge({ state: gameState, net, openPop: protocols.get(gameState).openPop, ...journalFor(gameState) }))
  return { gameState, bridge: bridges.get(gameState), journal: journalFor(gameState) }
}

function activate(gameState) {
  setActiveGameState(gameState)
  setActiveEventJournal(journalFor(gameState))
}

export const gameSessions = computed(() => Array.from(sessions.values()).map(session => ({
  id: session.id,
  account: session.account,
  host: session.host,
  port: session.port,
  captcha: session.captcha,
  connected: session.state.connected,
  loggedIn: session.state.stage === 'loginok',
  active: getActiveGameState() === session.state,
  status: session.state.connected ? (session.state.stage === 'loginok' ? '在线' : '登录中') : '已断开'
})))
export const hasConnectedGameSession = computed(() => Array.from(sessions.values()).some(session => session.state.connected))

export function getActiveLoginAccount() {
  const session = sessions.get(getActiveGameState().sessionId)
  if (!session || !session.state.connected || session.state.stage !== 'loginok') return null
  return { host: session.host, port: session.port, account: session.account, captcha: session.captcha }
}

export function beginAccountLogin(profile) {
  const id = profileId(profile)
  const existing = sessions.get(id)
  if (existing && existing.state.connected && existing.state.stage === 'loginok') {
    activate(existing.state)
    return true
  }
  const occupied = Array.from(sessions.values()).filter(session => session.id !== id && (session.state.connected || session.state.stage === 'connecting'))
  if (occupied.length >= MAX_GAME_SESSIONS) throw new Error('最多同时登录 5 个账号，请先断开一个账号')
  for (const session of Array.from(sessions.values())) {
    if (session.id === id || (!session.state.connected && session.state.stage !== 'connecting')) {
      const client = clients.get(session.state)
      if (client) client.close()
      sessions.delete(session.id)
    }
  }
  const gameState = createGameState(id)
  gameState.stage = 'connecting'
  sessions.set(id, { id, account: profile.account.trim(), host: profile.host.trim(), port: String(profile.port), captcha: String(profile.captcha || '').trim(), state: gameState })
  activate(gameState)
  return false
}

export function switchGameSession(id) {
  const session = sessions.get(id)
  if (!session || !session.state.connected || session.state.stage !== 'loginok') throw new Error('该账号已断开，请重新登录')
  activate(session.state)
}

export function showAccountLogin() {
  const occupied = Array.from(sessions.values()).filter(session => session.state.connected || session.state.stage === 'connecting')
  if (occupied.length >= MAX_GAME_SESSIONS) throw new Error('最多同时登录 5 个账号，请先断开一个账号')
  activate(createGameState('login-form'))
}

export function closeGameSession(id) {
  const session = sessions.get(id)
  if (!session) return
  const client = clients.get(session.state)
  if (client) client.close()
  sessions.delete(id)
}

export function configureSessionNetworkPlatform(platform) {
  for (const session of sessions.values()) {
    const client = clients.get(session.state)
    if (client) client.close()
  }
  const client = clients.get(getActiveGameState())
  if (client) client.close()
  sessions.clear()
  clients.delete(getActiveGameState())
  bridges.delete(getActiveGameState())
  return configurePlatform(platform)
}
