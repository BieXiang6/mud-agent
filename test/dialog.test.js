import test from 'node:test'
import assert from 'node:assert/strict'
import { buildActionDialog } from '../utils/dialog.js'
import { getRegionContent } from '../utils/ai/gameBridge.js'
import { state } from '../utils/store.js'
import { handleLine } from '../utils/proto.js'

const line = { id: 1, raw: '正文' }

test('merges 007 text into the first action packet', () => {
  const dialog = buildActionDialog(
    { type: 'hd', title: '标题', lines: [line] },
    '',
    { buttons: [{ text: '按钮一', cmd: 'one' }] }
  )

  assert.equal(dialog.type, 'act')
  assert.deepEqual(dialog.introLines, [line])
  assert.equal(dialog.title, '标题')
})

test('keeps both 008 and 009 button groups when packets arrive consecutively', () => {
  const first = buildActionDialog(
    { type: 'hd', title: '标题', lines: [line] },
    '',
    { buttons: [{ text: '按钮一', cmd: 'one' }] }
  )
  const second = buildActionDialog(first, '', {
    buttons: [{ text: '按钮二', cmd: 'two' }]
  })

  assert.deepEqual(second.introLines, [line])
  assert.deepEqual(second.buttons, [
    { text: '按钮一', cmd: 'one' },
    { text: '按钮二', cmd: 'two' }
  ])
})

test('keeps an input prompt when an action packet adds choices', () => {
  const prompt = [{ t: '请输入内容' }]
  const dialog = buildActionDialog(
    { type: 'input', title: '输入', prompt, cmdId: 'say $txt#' },
    '',
    { buttons: [{ text: '频道', cmd: 'channel' }] }
  )

  assert.equal(dialog.type, 'input')
  assert.equal(dialog.cmdId, 'say $txt#')
  assert.equal(dialog.prompt, prompt)
})

test('keeps input actions when another 009 packet adds more choices', () => {
  const first = buildActionDialog(
    { type: 'input', title: '输入', prompt: [{ t: '内容' }], cmdId: 'say $txt#' },
    '',
    { buttons: [{ text: '频道', cmd: 'channel' }] }
  )
  const second = buildActionDialog(first, '', {
    buttons: [{ text: '表情', cmd: 'emote' }]
  })

  assert.deepEqual(second.buttons.map((button) => button.cmd), ['channel', 'emote'])
})

test('AI dialog snapshot exposes both merged button groups', () => {
  const previousDialog = state.dialog
  const previousRevision = state.gameRevision
  const previousStage = state.stage
  try {
    const esc = String.fromCharCode(27)
    state.stage = 'loginok'
    state.gameRevision = 42
    handleLine(esc + '007人物信息')
    handleLine(esc + '008$1,4,10,32#询问:ask npc')
    handleLine(esc + '009$3,4,10,32#交易:list')
    const snapshot = getRegionContent('dialog').dialog
    assert.deepEqual(snapshot.actions.map((item) => item.text), ['询问', '交易'])
    assert.ok(snapshot.actions.every((item) => item.action && item.action.id))
  } finally {
    state.dialog = previousDialog
    state.gameRevision = previousRevision
    state.stage = previousStage
  }
})
