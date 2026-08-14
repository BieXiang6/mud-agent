import test from 'node:test'
import assert from 'node:assert/strict'
import { createModelProfile, validateModelProfile } from '../utils/ai/modelProfiles.js'
import { mapRichColorsForLight } from '../utils/theme.js'
import { finishSummaryFromBlock, markTurnFinished, normalizeConversation } from '../utils/ai/conversation.js'

test('uses supplied provider defaults for a new model profile', () => {
  const profile = createModelProfile({
    model: 'example-model',
    baseUrl: 'https://api.example.test',
    contextWindow: 1000000,
    maxTokens: 384000
  })

  assert.equal(profile.model, 'example-model')
  assert.equal(profile.baseUrl, 'https://api.example.test')
  assert.equal(profile.protocol, 'openai-completions')
  assert.equal(profile.contextWindow, 1000000)
  assert.equal(profile.maxTokens, 384000)
})

test('maps low-contrast ANSI colors for paper backgrounds', () => {
  assert.equal(mapRichColorsForLight('#ffffff', null).fg, '#3f4540')
  assert.notEqual(mapRichColorsForLight('#ffff55', null).fg, '#ffff55')
  assert.equal(mapRichColorsForLight('#ffffff', '#000000').fg, '#ffffff')
  assert.equal(mapRichColorsForLight(null, '#ffffff').bg, '#d8cfb8')
})

test('collapses a finished AI turn around its final summary', () => {
  const finish = {
    type: 'tool',
    name: 'finish',
    args: JSON.stringify({ summary: '已抵达扬州。' }),
    result: JSON.stringify({ summary: '已抵达扬州。' }),
    status: 'done',
    isError: false
  }
  const turn = { role: 'assistant', blocks: [{ type: 'thinking', content: '过程' }, finish] }

  assert.equal(finishSummaryFromBlock(finish), '已抵达扬州。')
  assert.equal(markTurnFinished(turn, finish), true)
  assert.equal(turn.completed, true)
  assert.equal(turn.summary, '已抵达扬州。')
  assert.equal(turn.processExpanded, false)
})

test('recognizes finish blocks in saved conversations', () => {
  const restored = normalizeConversation([{
    role: 'assistant',
    blocks: [{ name: 'finish', args: '{"summary":"任务完成"}', status: 'done', isError: false }]
  }])

  assert.equal(restored[0].completed, true)
  assert.equal(restored[0].summary, '任务完成')
  assert.equal(restored[0].processExpanded, false)
})

test('does not trust a completed flag without a successful finish tool call', () => {
  const [turn] = normalizeConversation([{
    role: 'assistant',
    completed: true,
    summary: '模型自行声称完成',
    blocks: [{ type: 'text', content: '任务完成' }]
  }])
  assert.equal(turn.completed, false)
  assert.equal(turn.summary, '')
})

test('requires every model field except the shared command blacklist', () => {
  const profile = createModelProfile({
    apiKey: 'secret',
    baseUrl: 'https://api.example.test',
    model: 'example-model'
  })
  assert.equal(validateModelProfile(profile), true)

  for (const key of ['name', 'apiKey', 'baseUrl', 'protocol', 'model', 'contextWindow', 'maxTokens', 'compressionThreshold', 'keepRecentTurns']) {
    assert.throws(
      () => validateModelProfile({ ...profile, [key]: '' }),
      /请填写/
    )
  }
})
