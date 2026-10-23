import { reactive } from 'vue'
import { getActiveGameState } from '../store.js'
import { getGameSessionContext } from '../gameSessions.js'
import { createAccountAiController } from './accountController.js'
export { aiRenderState, handleAiRenderEvent, refreshAiRenderBridge } from './renderBridge.js'
const controllers = new WeakMap()
export const aiAccountStates = reactive(new Map())
export function getAccountAiController(gameState = getActiveGameState()) {
  if (!controllers.has(gameState)) {
    const controller = createAccountAiController(getGameSessionContext(gameState))
    controllers.set(gameState, controller)
    aiAccountStates.set(gameState.sessionId || 'unassigned', controller.aiState)
  }
  return controllers.get(gameState)
}
export const aiState = new Proxy({}, {
  get: (_target, key) => getAccountAiController().aiState[key],
  set: (_target, key, value) => { getAccountAiController().aiState[key] = value; return true },
  has: (_target, key) => key in getAccountAiController().aiState,
  ownKeys: () => Reflect.ownKeys(getAccountAiController().aiState),
  getOwnPropertyDescriptor: (_target, key) => key in getAccountAiController().aiState ? { enumerable: true, configurable: true, value: getAccountAiController().aiState[key] } : undefined
})
export function scrollAiConversationToBottom(...args) { return getAccountAiController().scrollAiConversationToBottom(...args) }
export function pauseAiConversationAutoScroll(...args) { return getAccountAiController().pauseAiConversationAutoScroll(...args) }
export function resumeAiConversationAutoScroll(...args) { return getAccountAiController().resumeAiConversationAutoScroll(...args) }
export function loadAiConfig(...args) { return getAccountAiController().loadAiConfig(...args) }
export function refreshAiState(...args) { return getAccountAiController().refreshAiState(...args) }
export function createAiTask(...args) { return getAccountAiController().createAiTask(...args) }
export function restoreAiTask(...args) { return getAccountAiController().restoreAiTask(...args) }
export function deleteAiTask(...args) { return getAccountAiController().deleteAiTask(...args) }
export function openAiPanel(...args) { return getAccountAiController().openAiPanel(...args) }
export function closeAiPanel(...args) { return getAccountAiController().closeAiPanel(...args) }
export function addAiAttachment(...args) { return getAccountAiController().addAiAttachment(...args) }
export function removeAiAttachment(...args) { return getAccountAiController().removeAiAttachment(...args) }
export function runAiTask(...args) { return getAccountAiController().runAiTask(...args) }
export function stopAiTask(...args) { return getAccountAiController().stopAiTask(...args) }
export default { aiState, scrollAiConversationToBottom, pauseAiConversationAutoScroll, resumeAiConversationAutoScroll, loadAiConfig, refreshAiState, createAiTask, restoreAiTask, deleteAiTask, openAiPanel, closeAiPanel, addAiAttachment, removeAiAttachment, runAiTask, stopAiTask }
