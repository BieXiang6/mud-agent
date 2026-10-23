<template>
  <view class="page" :class="{ light: gameState.themeMode === 'light' }" :style="appStyle">
    <view class="topbar">
      <view class="back" hover-class="hp" @tap="goBack">‹</view>
      <text class="title">游戏脚本</text>
      <view class="market-open" @tap="openMarket">脚本市场</view>
      <view class="runs-open" hover-class="hp" @tap="openRunControl">运行控制<text v-if="activeRunCount" class="runs-badge">{{ activeRunCount }}</text></view>
      <view class="add" hover-class="hp" @tap="newScript">新增</view>
    </view>
    <scroll-view scroll-y class="body">
      <view class="script-list-head">
        <text class="section-title">已保存脚本（{{ state.scripts.length }}）</text>
        <view class="script-transfer-actions">
          <view class="script-transfer" :class="{ disabled: state.transferBusy }" hover-class="hp" @tap="importScripts">导入</view>
          <view class="script-transfer" :class="{ disabled: state.transferBusy || !state.id }" hover-class="hp" @tap="exportScript">导出当前</view>
        </view>
      </view>
      <scroll-view scroll-y class="saved-script-list">
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
      </scroll-view>

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
          <view v-if="!state.running" class="script-button" :class="{ disabled: !state.id }" hover-class="hp" @tap="runScript">运行 main</view>
          <view v-else class="script-button warning" hover-class="hp" @tap="stopScript">停止运行</view>
          <view class="script-button danger" :class="{ disabled: !state.id }" hover-class="hp" @tap="removeScript">删除</view>
        </view>
      </view>
      <view class="bottom-space" />
    </scroll-view>
    <view v-if="state.runControlVisible" class="run-mask" @tap="closeRunControl">
      <view class="run-dialog" @tap.stop>
        <view class="run-dialog-head">
          <view>
            <text class="run-dialog-title">脚本运行控制</text>
            <text class="run-dialog-subtitle">活动 {{ activeRunCount }} · 最近 {{ state.runs.length }}</text>
          </view>
          <view class="run-dialog-close" hover-class="hp" @tap="closeRunControl">关闭</view>
        </view>
        <scroll-view scroll-y class="run-list">
          <view v-if="!state.runs.length" class="empty">暂无脚本运行记录</view>
          <view v-for="run in state.runs" :key="run.id" class="run-row" :class="run.status">
            <view class="run-row-head">
              <view class="run-main">
                <text class="run-name">{{ run.scriptName }}.{{ run.functionName }}</text>
                <text class="run-meta">{{ originLabel(run.origin) }} · {{ statusLabel(run.status) }} · {{ runDuration(run) }}</text>
              </view>
              <view v-if="isActiveRun(run)" class="run-stop" hover-class="hp" @tap="stopRun(run.id)">终止</view>
            </view>
            <text class="run-id">{{ run.id }}</text>
            <text v-if="run.sessionId" class="run-id">账号：{{ run.sessionId }}</text>
            <text v-if="run.latestLog" class="run-log">最新日志：{{ run.latestLog }}</text>
            <text v-if="run.error" class="run-error">{{ run.error }}</text>
          </view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue'
import { onShow } from '@/utils/platform/lifecycle.js'
import { appStyle } from '@/utils/appearance.js'
import { state as gameState } from '@/utils/store.js'
import { runtime } from '@/utils/platform/index.js'
import { cancelScriptRun, listScriptRuns, runStoredScript, validateScriptSource } from '@/utils/ai/scriptRuntime.js'
import { deleteStoredScript, getStoredScript, listStoredScripts, saveStoredScript } from '@/utils/ai/scriptStore.js'
import { exportStoredScriptText, importStoredScriptText } from '@/utils/ai/scriptTransfer.js'

const EMPTY_SOURCE = "exports.main = async function () {\n  return game.get('here');\n};"
const state = reactive({ scripts: [], runs: [], runControlVisible: false, transferBusy: false, id: '', updatedAt: 0, name: '', description: '', source: EMPTY_SOURCE, error: '', result: '', running: false })
const activeRunCount = computed(() => state.runs.filter(isActiveRun).length)
let runController = null
let runRefreshTimer = null

function refresh() {
  state.scripts = listStoredScripts()
  refreshRuns()
  if (state.id && !state.scripts.some((item) => item.id === state.id)) newScript()
}
function isActiveRun(run) { return run && (run.status === 'queued' || run.status === 'running') }
function refreshRuns() { state.runs = listScriptRuns({ limit: 50 }) }
function openRunControl() { refreshRuns(); state.runControlVisible = true }
function closeRunControl() { state.runControlVisible = false }
function originLabel(origin) { return origin === 'agent' ? '智能体启动' : '手动启动' }
function statusLabel(status) {
  return ({ queued: '排队中', running: '运行中', completed: '已完成', failed: '失败', cancelled: '已终止' })[status] || status
}
function runDuration(run) {
  const start = Number(run && run.startedAt) || Date.now()
  const end = Number(run && run.finishedAt) || Date.now()
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  if (seconds < 60) return seconds + ' 秒'
  const minutes = Math.floor(seconds / 60)
  return minutes < 60 ? minutes + ' 分 ' + seconds % 60 + ' 秒' : Math.floor(minutes / 60) + ' 小时 ' + minutes % 60 + ' 分'
}
function stopRun(id) {
  try { cancelScriptRun(id) } catch (error) { state.error = error && error.message ? error.message : String(error) }
  refreshRuns()
}
function transferError(title, error) {
  runtime.showModal({ title, content: error && error.message ? error.message : String(error), showCancel: false })
}
function exportFileName() {
  const name = String(state.name || 'script').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'script'
  return 'mud-agent-script-' + name + '.json'
}
async function exportScript() {
  if (state.transferBusy || !state.id) return
  state.transferBusy = true
  try {
    const result = await runtime.exportTextFile({
      title: '导出当前游戏脚本',
      filterName: 'Mud Agent 单脚本包',
      suggestedName: exportFileName(),
      mimeType: 'application/json',
      maxBytes: 8 * 1024 * 1024,
      text: exportStoredScriptText(state.id)
    })
    if (result) runtime.showModal({ title: '脚本已导出', content: result.path || result.name || '导出完成', showCancel: false })
  } catch (error) { transferError('导出失败', error) } finally { state.transferBusy = false }
}
async function importScripts() {
  if (state.transferBusy) return
  state.transferBusy = true
  try {
    const file = await runtime.importTextFile({
      title: '导入单个游戏脚本',
      filterName: 'Mud Agent 单脚本包',
      suggestedName: 'mud-agent-script.json',
      accept: '.json,application/json',
      extensions: ['json'],
      mimeType: 'application/json',
      maxBytes: 8 * 1024 * 1024
    })
    if (!file) return
    const summary = importStoredScriptText(file.text)
    refresh()
    selectScript(summary.scriptId)
    runtime.showModal({
      title: '脚本已导入',
      content: (summary.created ? '已新增：' : '已更新：') + summary.name,
      showCancel: false
    })
  } catch (error) { transferError('导入失败', error) } finally { state.transferBusy = false }
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
  if (!state.id || state.running) return
  state.error = ''
  state.result = '运行中…'
  state.running = true
  const controller = new AbortController()
  runController = controller
  try {
    const result = await runStoredScript({ scriptId: state.id, functionName: 'main', args: [], waitForResult: true, signal: controller.signal, origin: 'manual' })
    state.result = JSON.stringify(result, null, 2)
  } catch (error) {
    state.result = ''
    state.error = error && error.message ? error.message : String(error)
  } finally {
    if (runController === controller) runController = null
    state.running = false
    refreshRuns()
  }
}
function stopScript() {
  if (runController) runController.abort()
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
function openMarket() { runtime.navigateTo({ url: '/pages/ai-market/ai-market?type=script' }) }
onShow(refresh)
onMounted(() => { runRefreshTimer = setInterval(refreshRuns, 1000) })
onBeforeUnmount(() => {
  stopScript()
  if (runRefreshTimer) clearInterval(runRefreshTimer)
})
</script>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; background: #0c0f12; color: #edf1f4; }
.topbar { flex: none; height: calc(68rpx + var(--status-bar-height)); padding: var(--status-bar-height) 18rpx 0; display: flex; align-items: center; box-sizing: border-box; border-bottom: 1rpx solid #303840; background: #151a1f; }
.back { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; font-size: 48rpx; }
.title { flex: 1; font-size: 28rpx; font-weight: bold; }
.market-open { margin-right: 8rpx; padding: 10rpx 14rpx; border: 1rpx solid #3f78aa; color: var(--app-primary); font-size: 20rpx; }
.add, .runs-open { padding: 10rpx 14rpx; border: 1rpx solid #3f78aa; color: #b9daf5; font-size: 20rpx; }
.runs-open { position: relative; margin-right: 8rpx; }
.runs-badge { min-width: 24rpx; height: 24rpx; margin-left: 6rpx; padding: 0 5rpx; display: inline-flex; align-items: center; justify-content: center; border-radius: 12rpx; background: #b5534f; color: #fff; font-size: 15rpx; box-sizing: border-box; }
.body { flex: 1; min-height: 0; padding: 18rpx; box-sizing: border-box; }
.section-title { display: block; margin-bottom: 10rpx; color: #a9c7e8; font-size: 21rpx; }
.script-list-head { min-height: 48rpx; display: flex; align-items: flex-start; justify-content: space-between; gap: 12rpx; }
.script-transfer-actions { flex: none; display: flex; gap: 7rpx; }
.script-transfer { padding: 7rpx 12rpx; border: 1rpx solid #3f78aa; color: #a9cfee; font-size: 18rpx; }
.script-transfer.disabled { opacity: 0.4; pointer-events: none; }
.saved-script-list { width: 100%; height: 300rpx; padding: 2rpx; border: 1rpx solid #28343c; box-sizing: border-box; background: #0d1216; }
.empty { height: 100%; display: flex; align-items: center; justify-content: center; text-align: center; color: #74818b; font-size: 21rpx; }
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
.script-button.warning { border-color: #a4793f; color: #efc27e; }
.script-button.disabled { opacity: 0.4; pointer-events: none; }
.bottom-space { height: 40rpx; }
.run-mask { position: fixed; z-index: 80; inset: 0; padding: calc(var(--status-bar-height) + 48rpx) 20rpx 28rpx; display: flex; align-items: center; justify-content: center; box-sizing: border-box; background: rgba(0, 0, 0, 0.68); }
.run-dialog { width: 100%; max-width: 760rpx; height: min(78vh, 900rpx); display: flex; flex-direction: column; border: 1rpx solid #45525c; background: #10161b; box-shadow: 0 14rpx 50rpx rgba(0, 0, 0, 0.45); }
.run-dialog-head { flex: none; min-height: 76rpx; padding: 12rpx 14rpx; display: flex; align-items: center; justify-content: space-between; border-bottom: 1rpx solid #35414a; box-sizing: border-box; }
.run-dialog-title, .run-dialog-subtitle { display: block; }
.run-dialog-title { color: #e6eef4; font-size: 24rpx; font-weight: bold; }
.run-dialog-subtitle { margin-top: 3rpx; color: #8295a3; font-size: 17rpx; }
.run-dialog-close { padding: 10rpx 12rpx; color: #a9c7e8; font-size: 19rpx; }
.run-list { flex: 1; min-height: 0; padding: 10rpx; box-sizing: border-box; }
.run-row { margin-bottom: 9rpx; padding: 11rpx; border: 1rpx solid #34414a; border-left: 4rpx solid #65727b; background: #151c21; }
.run-row.running, .run-row.queued { border-left-color: #4e9b72; background: #14231c; }
.run-row.failed { border-left-color: #b85d58; }
.run-row.cancelled { border-left-color: #aa8149; }
.run-row-head { display: flex; align-items: center; gap: 10rpx; }
.run-main { flex: 1; min-width: 0; }
.run-name, .run-meta, .run-id, .run-log, .run-error { display: block; }
.run-name { overflow: hidden; color: #e5edf2; font-size: 21rpx; text-overflow: ellipsis; white-space: nowrap; }
.run-meta { margin-top: 3rpx; color: #91a2ad; font-size: 17rpx; }
.run-id { margin-top: 7rpx; color: #647682; font-family: monospace; font-size: 15rpx; }
.run-log { margin-top: 6rpx; color: #aab9c2; font-size: 16rpx; word-break: break-word; }
.run-error { margin-top: 6rpx; color: #e4938e; font-size: 16rpx; }
.run-stop { flex: none; padding: 9rpx 13rpx; border: 1rpx solid #a95d56; color: #ef9f98; font-size: 18rpx; }
.page.light { background: #e8dfc8; color: #2e352f; }
.page.light .topbar { background: #d5cab1; border-bottom-color: #948a74; }
.page.light .section-title, .page.light .add, .page.light .runs-open, .page.light .script-transfer { color: #356b70; }
.page.light .script-row { background: #f1e8d2; border-color: #a29881; }
.page.light .saved-script-list { border-color: #a29881; background: #e0d6be; }
.page.light .script-row.active { background: #dce5d8; border-color: #527f77; }
.page.light .script-desc, .page.light .script-size, .page.light .hint { color: #687269; }
.page.light .input, .page.light .source { background: #fff8e7; border-color: #9e947d; color: #29312b; }
.page.light .editor { border-top-color: #a29881; }
.page.light .script-button { border-color: #918875; color: #364038; }
.page.light .script-button.primary { background: #3f706b; border-color: #527f77; color: #ffffff; }
.page.light .script-button.danger { border-color: #9b5750; color: #963d38; }
.page.light .run-mask { background: rgba(48, 43, 34, 0.58); }
.page.light .run-dialog { border-color: #8e846e; background: #eee5cf; }
.page.light .run-dialog-head { border-bottom-color: #a29881; }
.page.light .run-dialog-title, .page.light .run-name { color: #29312b; }
.page.light .run-dialog-subtitle, .page.light .run-meta, .page.light .run-id { color: #69746b; }
.page.light .run-row { border-color: #a39982; background: #f8efd9; }
.page.light .run-row.running, .page.light .run-row.queued { background: #e0e9dc; }
.page.light .run-log { color: #59655d; }
</style>
