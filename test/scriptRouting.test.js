import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldInjectScriptTools } from '../utils/ai/scriptRouting.js'

test('injects script tools for authoring, management, and function execution', () => {
  assert.equal(shouldInjectScriptTools('帮我编写并保存一个 JS 游戏脚本'), true)
  assert.equal(shouldInjectScriptTools('运行脚本里的 main 函数并传参'), true)
  assert.equal(shouldInjectScriptTools('使用 write-game-script 监听聊天'), true)
  assert.equal(shouldInjectScriptTools('停止 run-m123-1'), true)
})

test('keeps script schemas out of ordinary game tasks and supports follow-ups', () => {
  assert.equal(shouldInjectScriptTools('向北走并查看房间'), false)
  assert.equal(shouldInjectScriptTools('再运行一次并传参', '刚才通过 save_game_script 保存了脚本'), true)
})
