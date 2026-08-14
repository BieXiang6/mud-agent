import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldInjectAppAppearanceTools } from '../utils/ai/appearanceRouting.js'

test('injects appearance tools for explicit styling and adaptation requests', () => {
  assert.equal(shouldInjectAppAppearanceTools('把应用改成水墨主题，使用 SVG 背景'), true)
  assert.equal(shouldInjectAppAppearanceTools('检查 PC 和 uni-app 的布局适配'), true)
  assert.equal(shouldInjectAppAppearanceTools('优化应用适配'), true)
  assert.equal(shouldInjectAppAppearanceTools('使用 customize-app-style 调整圆角'), true)
})

test('keeps appearance schemas out of ordinary game tasks', () => {
  assert.equal(shouldInjectAppAppearanceTools('去北边看看'), false)
  assert.equal(shouldInjectAppAppearanceTools('查看这个人物的背景故事'), false)
  assert.equal(shouldInjectAppAppearanceTools('整理背包并装备长剑'), false)
})

test('recognizes visual follow-ups without leaking into game follow-ups', () => {
  const history = '工具调用：configure_app_style\n结果：已经应用水墨主题'
  assert.equal(shouldInjectAppAppearanceTools('再调亮一点', history), true, 'style follow-up')
  assert.equal(shouldInjectAppAppearanceTools('把按钮改成蓝色', history), true, 'button follow-up')
  assert.equal(shouldInjectAppAppearanceTools('继续向北走一点', history), false, 'game follow-up')
})
