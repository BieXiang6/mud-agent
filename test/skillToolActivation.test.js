import test from 'node:test'
import assert from 'node:assert/strict'
import { createSkillToolActivation } from '../utils/ai/skillToolActivation.js'

test('adds skill tools to agent state and the next provider-turn context', async () => {
  const scriptTools = [{ name: 'list_game_scripts' }, { name: 'run_game_script' }]
  const activation = createSkillToolActivation(async (skill) => skill.name === 'write-game-script' ? scriptTools : [])
  const loadTool = { name: 'load_skill' }
  const gameTool = { name: 'get_region_content' }
  const agent = { state: { tools: [loadTool, gameTool] } }
  activation.attachAgent(agent)

  const activated = await activation.onLoad({ name: 'write-game-script' })
  assert.deepEqual(activated, ['list_game_scripts', 'run_game_script'])
  assert.deepEqual(agent.state.tools.map((tool) => tool.name), ['load_skill', 'get_region_content', 'list_game_scripts', 'run_game_script'])

  const currentContext = { systemPrompt: 'test', messages: [], tools: [loadTool, gameTool] }
  const update = activation.prepareNextTurn({ context: currentContext })
  assert.deepEqual(update.context.tools.map((tool) => tool.name), ['load_skill', 'get_region_content', 'list_game_scripts', 'run_game_script'])
  assert.equal(activation.prepareNextTurn({ context: update.context }), undefined)

  await activation.onLoad({ name: 'write-game-script' })
  assert.equal(agent.state.tools.filter((tool) => tool.name === 'run_game_script').length, 1)
})
