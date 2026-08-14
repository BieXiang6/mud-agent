<template>
  <view class="page" :class="{ light: gameState.themeMode === 'light' }" :style="appStyle">
    <view class="topbar">
      <view class="back" hover-class="hp" @tap="goBack">‹</view>
      <text class="title">游戏脚本</text>
      <view class="add" hover-class="hp" @tap="newScript">新增</view>
    </view>
    <scroll-view scroll-y class="body">
      <text class="section-title">已保存脚本（{{ state.scripts.length }}）</text>
      <view v-if="!state.scripts.length" class="empty">尚未保存脚本</view>
      <view
        v-for="script in state.scripts"
        :key="script.id"
        class="script-row"
        :class="{ active: script.id === state.id }"
        hover-class="hp"
        @tap="selectScript(script.id)"
      >
        <view class="script-info">
          <text class="script-name">{{ script.name }}</text>
          <text class="script-desc">{{ script.description || '无说明' }}</text>
        </view>
        <text class="script-size">{{ script.sourceLength }} 字符</text>
      </view>

      <view class="editor">
        <text class="section-title">{{ state.id ? '编辑脚本' : '新建脚本' }}</text>
        <input v-model="state.name" class="input" maxlength="80" placeholder="脚本名称" />
        <input v-model="state.description" class="input" maxlength="500" placeholder="用途说明" />
        <textarea
          v-model="state.source"
          class="source"
          maxlength="40000"
          placeholder="exports.main = async function () { return game.get('here'); };"
        />
        <text class="hint">通过 exports 导出函数；仅可使用注入的 game/console API。界面试运行会调用无参数 main，带参数或非阻塞调用可由智能体完成。</text>
        <view v-if="state.error" class="error">{{ state.error }}</view>
        <view v-if="state.result" class="result">{{ state.result }}</view>
        <view class="actions">
          <view class="script-button primary" hover-class="hp" @tap="saveScript">保存</view>
          <view class="script-button" :class="{ disabled: !state.id }" hover-class="hp" @tap="runScript">运行 main</view>
          <view class="script-button danger" :class="{ disabled: !state.id }" hover-class="hp" @tap="removeScript">删除</view>
        </view>
      </view>
      <view class="bottom-space" />
    </scroll-view>
  </view>
</template>

<script setup>
import { reactive } from 'vue'
import { onShow } from '@/utils/platform/lifecycle.js'
import { appStyle } from '@/utils/appearance.js'
import { state as gameState } from '@/utils/store.js'
import { runtime } from '@/utils/platform/index.js'
import { runStoredScript, validateScriptSource } from '@/utils/ai/scriptRuntime.js'
import { deleteStoredScript, getStoredScript, listStoredScripts, saveStoredScript } from '@/utils/ai/scriptStore.js'

const EMPTY_SOURCE = "exports.main = async function () {\n  return game.get('here');\n};"
const state = reactive({ scripts: [], id: '', updatedAt: 0, name: '', description: '', source: EMPTY_SOURCE, error: '', result: '' })

function refresh() {
  state.scripts = listStoredScripts()
  if (state.id && !state.scripts.some((item) => item.id === state.id)) newScript()
}
function edit(script) {
  state.id = script.id
  state.updatedAt = script.updatedAt
  state.name = script.name
  state.description = script.description
  state.source = script.source
  state.error = ''
  state.result = ''
}
function selectScript(id) {
  const script = getStoredScript(id)
  if (script) edit(script)
}
function newScript() {
  state.id = ''
  state.updatedAt = 0
  state.name = ''
  state.description = ''
  state.source = EMPTY_SOURCE
  state.error = ''
  state.result = ''
}
function saveScript() {
  state.error = ''
  try {
    validateScriptSource(state.source)
    const saved = saveStoredScript({ id: state.id, expectedUpdatedAt: state.id ? state.updatedAt : undefined, name: state.name, description: state.description, source: state.source })
    edit(saved)
    refresh()
    runtime.showToast({ title: '已保存', icon: 'success' })
  } catch (error) { state.error = error && error.message ? error.message : String(error) }
}
async function runScript() {
  if (!state.id) return
  state.error = ''
  state.result = '运行中…'
  try {
    const result = await runStoredScript({ scriptId: state.id, functionName: 'main', args: [], waitForResult: true, timeoutMs: 60000 })
    state.result = JSON.stringify(result, null, 2)
  } catch (error) {
    state.result = ''
    state.error = error && error.message ? error.message : String(error)
  }
}
function removeScript() {
  if (!state.id) return
  runtime.showModal({
    title: '删除脚本',
    content: '确认删除“' + state.name + '”？此操作无法撤销。',
    success: ({ confirm }) => {
      if (!confirm) return
      deleteStoredScript(state.id)
      newScript()
      refresh()
    }
  })
}
function goBack() { runtime.navigateBack() }
onShow(refresh)
</script>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; background: #0c0f12; color: #edf1f4; }
.topbar { flex: none; height: calc(68rpx + var(--status-bar-height)); padding: var(--status-bar-height) 18rpx 0; display: flex; align-items: center; box-sizing: border-box; border-bottom: 1rpx solid #303840; background: #151a1f; }
.back { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; font-size: 48rpx; }
.title { flex: 1; font-size: 28rpx; font-weight: bold; }
.add { padding: 10rpx 16rpx; border: 1rpx solid #3f78aa; color: #b9daf5; font-size: 20rpx; }
.body { flex: 1; min-height: 0; padding: 18rpx; box-sizing: border-box; }
.section-title { display: block; margin-bottom: 10rpx; color: #a9c7e8; font-size: 21rpx; }
.empty { padding: 36rpx 0; text-align: center; color: #74818b; font-size: 21rpx; }
.script-row { min-height: 72rpx; margin-bottom: 8rpx; padding: 10rpx 12rpx; display: flex; align-items: center; gap: 12rpx; box-sizing: border-box; border: 1rpx solid #303840; background: #12171b; }
.script-row.active { border-color: #3f86b8; background: #142532; }
.script-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.script-name { font-size: 21rpx; }
.script-desc, .script-size, .hint { color: #8f9ca6; font-size: 18rpx; }
.script-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor { margin-top: 20rpx; padding-top: 16rpx; border-top: 1rpx solid #303840; }
.input { width: 100%; height: 58rpx; margin-bottom: 8rpx; padding: 0 10rpx; box-sizing: border-box; border: 1rpx solid #3b454e; background: #0d1114; color: #edf1f4; font-size: 20rpx; }
.source { width: 100%; height: 420rpx; padding: 12rpx; box-sizing: border-box; border: 1rpx solid #3b454e; background: #0d1114; color: #dbe7ef; font-family: monospace; font-size: 19rpx; line-height: 1.45; }
.hint { display: block; margin-top: 8rpx; line-height: 1.45; }
.error, .result { margin-top: 10rpx; padding: 10rpx; white-space: pre-wrap; word-break: break-word; font-size: 18rpx; }
.error { border-left: 3rpx solid #b75c55; color: #ef9999; }
.result { max-height: 240rpx; overflow: auto; border-left: 3rpx solid #4d9670; color: #a9d6bc; font-family: monospace; }
.actions { display: flex; gap: 8rpx; margin-top: 12rpx; }
.script-button { flex: 1; min-height: 58rpx; display: flex; align-items: center; justify-content: center; border: 1rpx solid #56616a; color: #d7dfe5; font-size: 20rpx; }
.script-button.primary { background: #24699e; border-color: #3d83b8; color: #ffffff; }
.script-button.danger { border-color: #824646; color: #eaa4a4; }
.script-button.disabled { opacity: 0.4; pointer-events: none; }
.bottom-space { height: 40rpx; }
.page.light { background: #e8dfc8; color: #2e352f; }
.page.light .topbar { background: #d5cab1; border-bottom-color: #948a74; }
.page.light .section-title, .page.light .add { color: #356b70; }
.page.light .script-row { background: #f1e8d2; border-color: #a29881; }
.page.light .script-row.active { background: #dce5d8; border-color: #527f77; }
.page.light .script-desc, .page.light .script-size, .page.light .hint { color: #687269; }
.page.light .input, .page.light .source { background: #fff8e7; border-color: #9e947d; color: #29312b; }
.page.light .editor { border-top-color: #a29881; }
.page.light .script-button { border-color: #918875; color: #364038; }
.page.light .script-button.primary { background: #3f706b; border-color: #527f77; color: #ffffff; }
.page.light .script-button.danger { border-color: #9b5750; color: #963d38; }
</style>
