import test, { beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createAccountAiController } from '../utils/ai/accountController.js'
import { createGameState } from '../utils/store.js'
import { getGameSessionContext } from '../utils/gameSessions.js'
import { configurePlatform } from '../utils/platform/index.js'
import { createModelProfile, saveModelProfile } from '../utils/ai/modelProfiles.js'
import { createStoredTask, loadStoredTasks, saveStoredTasks } from '../utils/ai/taskStore.js'
import { saveStoredScript } from '../utils/ai/scriptStore.js'
import { computed } from 'vue'
import { aiAccountStates, getAccountAiController } from '../utils/ai/controller.js'

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const controllers = []
class ControlledAgent {
  static instances = []
  constructor(options) {
    this.options = options
    this.state = options.initialState
    this.listeners = []
    this.signal = new AbortController()
    ControlledAgent.instances.push(this)
  }
  subscribe(listener) { this.listeners.push(listener) }
  emit(event) { this.listeners.forEach(listener => listener(event)) }
  prompt(text) { this.promptText = text; return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject }) }
  async tool(name, args) {
    const before = await this.options.beforeToolCall({ toolCall: { name }, args })
    assert.ok(!before || !before.block)
    const tool = this.state.tools.find(tool => tool.name === name)
    assert.ok(tool, name + ' must be available')
    const id = name + '-test'
    this.emit({ type: 'tool_execution_start', toolCallId: id, toolName: name, args })
    const result = await tool.execute(id, args, this.signal.signal)
    this.emit({ type: 'tool_execution_end', toolCallId: id, toolName: name, result, isError: false })
    return result.details
  }
  async finish(summary) { await this.tool('finish', { summary }); this.emit({ type: 'agent_end' }); this.resolve() }
  abort() { this.signal.abort(); if (this.reject) this.reject(new Error('operation aborted')) }
  clearFollowUpQueue() {}
  followUp() {}
}

beforeEach(() => {
  const storage = new Map()
  configurePlatform({ openSocket() {}, getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) })
  saveModelProfile(createModelProfile({ id: 'shared-model', model: 'test-model', apiKey: 'test-key', baseUrl: 'https://test.invalid' }))
  ControlledAgent.instances = []
})
afterEach(() => { controllers.splice(0).forEach(controller => controller.dispose()) })

function account(id) {
  const gameState = createGameState(id)
  gameState.connected = true
  gameState.stage = 'loginok'
  gameState.title = { segs: [{ t: 'room-' + id }] }
  const session = getGameSessionContext(gameState)
  const controller = createAccountAiController(session, { Agent: ControlledAgent })
  controllers.push(controller)
  return { controller, session }
}

test('account list status remains reactive when background agents complete', () => {
  const gameState = createGameState('status-account')
  const controller = getAccountAiController(gameState)
  controllers.push(controller)
  const label = computed(() => aiAccountStates.get(gameState.sessionId).busy ? '运行中' : aiAccountStates.get(gameState.sessionId).status)
  controller.aiState.busy = true
  assert.equal(label.value, '运行中')
  controller.aiState.busy = false
  controller.aiState.status = '已完成'
  assert.equal(label.value, '已完成')
})
async function start(controller, text) {
  controller.aiState.task = text
  const completion = controller.runAiTask()
  await pause(0)
  const agent = ControlledAgent.instances[ControlledAgent.instances.length - 1]
  assert.ok(agent.resolve)
  return { agent, completion }
}

test('five agents run concurrently with independent drafts, conversations, tasks and game tools', async () => {
  const accounts = Array.from({ length: 5 }, (_, index) => account('server:4000|account-' + index))
  const runs = []
  for (let index = 0; index < accounts.length; index++) runs.push(await start(accounts[index].controller, '目标-' + index))
  assert.ok(accounts.every(({ controller }) => controller.aiState.busy))
  for (let index = 0; index < accounts.length; index++) {
    const { controller, session } = accounts[index]
    assert.equal(controller.aiState.conversation[0].text, '目标-' + index)
    assert.equal(controller.aiState.tasks.length, 1)
    assert.equal(controller.aiState.selectedProfile.id, 'shared-model')
    assert.equal((await runs[index].agent.tool('get_region_content', { region: 'here' })).text, 'room-' + session.gameState.sessionId)
  }
  assert.equal(new Set(accounts.map(({ controller }) => controller.aiState.activeTaskId)).size, 5)
  await runs[0].agent.finish('账号0完成')
  await runs[0].completion
  assert.equal(accounts[0].controller.aiState.busy, false)
  assert.ok(accounts.slice(1).every(({ controller }) => controller.aiState.busy))
  for (let index = 1; index < accounts.length; index++) await runs[index].agent.finish('完成-' + index)
  await Promise.all(runs.map(run => run.completion))
  for (let index = 0; index < accounts.length; index++) {
    const tasks = loadStoredTasks(accounts[index].session.gameState.sessionId)
    assert.equal(tasks.length, 1)
    assert.equal(tasks[0].conversation[0].text, '目标-' + index)
    assert.ok(!JSON.stringify(tasks).includes('目标-' + ((index + 1) % 5)))
  }
})

test('stopping or disconnecting one account does not stop other agents', async () => {
  const a = account('A')
  const b = account('B')
  const runA = await start(a.controller, 'A任务')
  const runB = await start(b.controller, 'B任务')
  a.controller.stopAiTask()
  await runA.completion
  assert.equal(runA.agent.signal.signal.aborted, true)
  assert.equal(b.controller.aiState.busy, true)
  assert.equal(runB.agent.signal.signal.aborted, false)
  const again = await start(a.controller, 'A第二轮')
  a.session.gameState.connected = false
  await again.completion
  assert.equal(a.controller.aiState.busy, false)
  assert.equal(b.controller.aiState.busy, true)
  await runB.agent.finish('B完成')
  await runB.completion
})

test('task deletion and reload are scoped by server and account; legacy shared history is not copied', async () => {
  const legacy = createStoredTask('shared-model')
  legacy.conversation = [{ role: 'user', text: '旧共享记录' }]
  saveStoredTasks([legacy])
  const a = account('server-a:4000|same-account')
  const b = account('server-b:4000|same-account')
  a.controller.openAiPanel()
  b.controller.openAiPanel()
  assert.equal(a.controller.aiState.tasks.length, 1)
  assert.equal(a.controller.aiState.conversation.length, 0)
  const run = await start(a.controller, '仅属于服务器A')
  await run.agent.finish('完成')
  await run.completion
  const restored = account('server-a:4000|same-account')
  restored.controller.openAiPanel()
  assert.equal(restored.controller.aiState.conversation[0].text, '仅属于服务器A')
  assert.equal(b.controller.aiState.conversation.length, 0)
  restored.controller.deleteAiTask(restored.controller.aiState.activeTaskId)
  assert.equal(loadStoredTasks('server-b:4000|same-account').length, 1)
  assert.equal(loadStoredTasks()[0].conversation[0].text, '旧共享记录')
})

test('background agent script tools use their own account and cannot inspect or stop another account run', async () => {
  const a = account('A')
  const b = account('B')
  const script = saveStoredScript({ name: 'shared-script', source: 'exports.main = () => game.get("here").text; exports.listen = async () => { await game.keepAlive(); };' })
  const runA = await start(a.controller, '运行脚本')
  const runB = await start(b.controller, '运行脚本')
  const result = await runA.agent.tool('run_game_script', { scriptId: script.id, waitForResult: true })
  assert.equal(result.result, 'room-A')
  const background = await runB.agent.tool('run_game_script', { scriptId: script.id, functionName: 'listen', waitForResult: false })
  await assert.rejects(runA.agent.tool('get_script_run', { runId: background.id }), /其他账号/)
  await assert.rejects(runA.agent.tool('cancel_script_run', { runId: background.id }), /其他账号/)
  assert.ok(['queued', 'running'].includes((await runB.agent.tool('get_script_run', { runId: background.id })).status))
  await runB.agent.tool('cancel_script_run', { runId: background.id })
  a.controller.stopAiTask()
  b.controller.stopAiTask()
  await Promise.all([runA.completion, runB.completion])
})
