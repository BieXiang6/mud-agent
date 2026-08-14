import test from 'node:test'
import assert from 'node:assert/strict'
import { createSkillTool, getBuiltinAiSkills, getAiSkills, importCustomAiSkill } from '../utils/ai/skills.js'

test('registers the built-in appearance and scripting skills', async () => {
  const builtins = getBuiltinAiSkills()
  assert.deepEqual(builtins.map((skill) => skill.name), ['customize-app-style', 'adapt-app-layout', 'write-game-script'])
  assert.equal(getAiSkills().length >= 3, true)

  const tool = createSkillTool()
  assert.deepEqual(tool.parameters.properties.name.enum.slice(0, 2), ['customize-app-style', 'adapt-app-layout'])
  const result = await tool.execute('test', { name: 'customize-app-style' })
  assert.match(result.content[0].text, /configure_app_style/)
  assert.match(result.content[0].text, /primaryButton/)
  assert.match(result.content[0].text, /backgroundSlots/)
  assert.match(result.content[0].text, /aiConversation/)

  const scriptResult = await tool.execute('test', { name: 'write-game-script' })
  assert.match(scriptResult.content[0].text, /run_game_script/)
  assert.match(scriptResult.content[0].text, /game\.keepAlive/)
  assert.match(scriptResult.content[0].text, /Script container API/)

  const activationTool = createSkillTool({ onLoad: async (skill) => skill.name === 'write-game-script' ? ['run_game_script'] : [] })
  const activated = await activationTool.execute('test', { name: 'write-game-script' })
  assert.deepEqual(activated.details.activatedTools, ['run_game_script'])
  assert.match(activated.content[0].text, /<activated_tools>run_game_script<\/activated_tools>/)
  assert.equal(activated.details.alreadyLoaded, false)
  const repeated = await activationTool.execute('test', { name: 'write-game-script' })
  assert.equal(repeated.details.alreadyLoaded, true)
  assert.match(repeated.content[0].text, /already-loaded="true"/)
  assert.doesNotMatch(repeated.content[0].text, /Script container API/)
})

test('does not allow imported skills to overwrite a built-in skill', () => {
  assert.throws(() => importCustomAiSkill(JSON.stringify({
    name: 'customize-app-style', description: 'override', content: 'not allowed'
  })), /不能覆盖内置 Skill/)
})
