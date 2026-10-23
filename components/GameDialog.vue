<template>
  <view class="gd-mask" :class="{ light: state.themeMode === 'light' }" :style="dialogAppStyle" @tap="onMask">
    <view class="gd-panel" @tap.stop>
      <text class="gd-close" hover-class="hp" @tap.stop="close">✕</text>
      <scroll-view
        scroll-y
        class="gd-body"
        :class="{ mono: state.dialog.type === 'map' }"
        :lower-threshold="120"
        @scrolltolower="loadMoreContent"
      >
        <view class="gd-content">

        <!-- 文本弹窗 hd / map -->
        <view v-if="type === 'hd' || type === 'map'" class="gd-lines">
          <view v-for="(node, i) in visibleDialogLines" :key="node.id || ('dialog-' + i)" class="gd-line">
            <RichText :node="node" @btn="tapRich" />
          </view>
          <view v-if="hasMoreLines" class="gd-load-more" hover-class="hp" @tap="loadMoreLines">
            继续显示正文（剩余 {{ remainingLines }} 行）
          </view>
        </view>

        <!-- 动作按钮网格 act / pop -->
        <view v-else-if="type === 'act' || type === 'pop'">
          <view v-if="state.dialog.introLines && state.dialog.introLines.length" class="gd-lines gd-act-intro">
            <view v-for="(node, i) in state.dialog.introLines" :key="node.id || ('intro-' + i)" class="gd-line">
              <RichText :node="node" @btn="tapRich" />
            </view>
          </view>
          <view class="gd-grid">
            <view
              v-for="(b, i) in visibleButtons"
              :key="i"
              class="gd-btn" hover-class="hp"
              :style="gridBtnStyle"
              @tap="tapGrid(b)"
            ><RichText :segs="b.label" :text="b.text" /></view>
          </view>
          <view v-if="hasMoreButtons" class="gd-load-more" hover-class="hp" @tap="loadMoreButtons">
            继续加载（剩余 {{ remainingButtons }} 项）
          </view>
        </view>

        <!-- 确认弹窗 -->
        <view v-else-if="type === 'confirm'" class="gd-input">
          <view class="gd-line"><RichText :segs="state.dialog.prompt" @btn="tapRich" /></view>
          <view class="gd-grid gd-confirm-grid">
            <view
              v-for="(b, i) in state.dialog.buttons"
              :key="i"
              class="gd-btn gd-confirm-btn" hover-class="hp"
              @tap="tapConfirm(b)"
            ><RichText :segs="b.label" :text="b.text" /></view>
          </view>
        </view>

        <!-- more 分页文本 -->
        <view v-else-if="type === 'more'" class="gd-lines">
          <view v-for="(node, i) in visibleDialogLines" :key="node.id || ('more-' + i)" class="gd-line">
            <RichText :node="node" @btn="tapRich" />
          </view>
          <view v-if="hasMoreLines" class="gd-load-more" hover-class="hp" @tap="loadMoreLines">
            继续显示正文（剩余 {{ remainingLines }} 行）
          </view>
          <view class="gd-more-btns">
            <view class="gd-submit gray" hover-class="hp" @tap="more('b')">上一页</view>
            <view class="gd-submit" hover-class="hp" @tap="more('')">下一页</view>
            <view class="gd-submit gray" hover-class="hp" @tap="more('q')">退出</view>
          </view>
        </view>

        <!-- 输入弹窗 input / cmd -->
        <view v-else-if="type === 'input' || type === 'cmd'" class="gd-input">
          <view class="gd-line" v-for="(node, i) in promptLines" :key="i">
            <RichText :node="node" @btn="tapRich" />
          </view>
          <textarea
            v-model="input"
            class="gd-textarea"
            :placeholder="type === 'cmd' ? '请输入指令' : ''"
            :auto-height="true"
            :maxlength="-1"
          />
          <view class="gd-input-btns">
            <view class="gd-submit" hover-class="hp" @tap="submitInput">{{ type === 'cmd' ? '执行' : '确定' }}</view>
          </view>
          <view v-if="state.dialog.buttons && state.dialog.buttons.length" class="gd-grid gd-input-actions">
            <view
              v-for="(b, i) in visibleButtons"
              :key="i"
              class="gd-btn" hover-class="hp"
              :style="gridBtnStyle"
              @tap="tapGrid(b)"
            ><RichText :segs="b.label" :text="b.text" /></view>
          </view>
          <view v-if="hasMoreButtons" class="gd-load-more" hover-class="hp" @tap="loadMoreButtons">
            继续加载（剩余 {{ remainingButtons }} 项）
          </view>
        </view>

        <!-- 系统菜单 -->
        <view v-else-if="type === 'config'" class="gd-lines gd-config">
          <view class="gd-conf-btn" hover-class="hp" @tap="toggleLong">{{ state.longVisible ? '场景(开)' : '场景(关)' }}</view>
          <view class="gd-conf-btn" hover-class="hp" @tap="toggleChat">{{ state.chatExpanded ? '聊天(宽)' : '聊天(窄)' }}</view>
          <view class="gd-theme-row">
            <text>亮色主题（重新进入app生效）</text>
            <switch
              :checked="state.themeMode === 'light'"
              :color="appStyle['--app-primary']"
              @change="changeTheme"
            />
          </view>
          <text class="gd-config-title">样式文件</text>
          <view class="gd-config-actions">
            <view class="gd-conf-btn gd-config-half" :class="{ disabled: styleBusy }" hover-class="hp" @tap="exportStyle">导出样式</view>
            <view class="gd-conf-btn gd-config-half" :class="{ disabled: styleBusy }" hover-class="hp" @tap="importStyle">导入样式</view>
          </view>
          <view class="gd-conf-btn danger" :class="{ disabled: styleBusy }" hover-class="hp" @tap="restoreStyle">还原全部样式</view>
          <text class="gd-config-hint">切换、导入或还原样式后重新进入app生效。导入会打开系统文件浏览器，无需“所有文件访问”权限；安卓在基座缺少 chooseFile 时会自动使用 Native.js。导出保存到 Documents/MudAgent。</text>
          <view class="gd-conf-btn danger" hover-class="hp" @tap="quitGame">退出游戏</view>
        </view>

        <!-- 自定按钮: 定义 -->
        <view v-else-if="type === 'setbt'" class="gd-input">
          <view class="gd-line"><RichText :segs="setbtHint" /></view>
          <textarea v-model="input" class="gd-textarea" :auto-height="true" :maxlength="-1" />
          <view class="gd-input-btns">
            <view class="gd-submit" hover-class="hp" @tap="saveSetBt">确定</view>
            <view class="gd-submit gray" hover-class="hp" @tap="close">取消</view>
          </view>
        </view>

        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { state, setThemeMode } from '@/utils/store.js'
import { runtime } from '@/utils/platform/index.js'
import { appStyle, exportAppAppearanceText, importAppAppearanceText, resetAppAppearance } from '@/utils/appearance.js'
import net from '@/utils/net.js'
import { openPop } from '@/utils/proto.js'
import { log, escapeStr } from '@/utils/log.js'
import RichText from '@/components/RichText.vue'

const ESC = String.fromCharCode(27)
const input = ref('')
const styleBusy = ref(false)
const dialogAppStyle = computed(() => Object.fromEntries(Object.entries(appStyle).filter(([name]) => name.startsWith('--') || name === 'colorScheme')))
const BUTTON_RENDER_CHUNK = 48
const LINE_RENDER_CHUNK = 80
const buttonRenderLimit = ref(BUTTON_RENDER_CHUNK)
const lineRenderLimit = ref(LINE_RENDER_CHUNK)
const winInfo = runtime.getWindowInfo()
const winH = winInfo.windowHeight

const type = computed(() => (state.dialog ? state.dialog.type : ''))
const allButtons = computed(() => {
  const d = state.dialog
  return d && Array.isArray(d.buttons) ? d.buttons : []
})
const visibleButtons = computed(() => allButtons.value.slice(0, buttonRenderLimit.value))
const remainingButtons = computed(() => Math.max(0, allButtons.value.length - buttonRenderLimit.value))
const hasMoreButtons = computed(() => remainingButtons.value > 0)
const allDialogLines = computed(() => {
  const d = state.dialog
  return d && Array.isArray(d.lines) ? d.lines : []
})
const visibleDialogLines = computed(() => allDialogLines.value.slice(0, lineRenderLimit.value))
const remainingLines = computed(() => Math.max(0, allDialogLines.value.length - lineRenderLimit.value))
const hasMoreLines = computed(() => remainingLines.value > 0)

watch(
  () => [type.value, allButtons.value, allDialogLines.value],
  () => {
    buttonRenderLimit.value = BUTTON_RENDER_CHUNK
    lineRenderLimit.value = LINE_RENDER_CHUNK
  },
  { immediate: true }
)

watch(
  () => state.dialog && state.dialog.type === 'setbt'
    ? [state.dialog.n, state.dialog.initialValue]
    : null,
  (value) => {
    if (value) input.value = value[1] || runtime.getStorageSync('mybt' + value[0]) || ''
  },
  { immediate: true }
)

let lastRenderedTrace = ''
watch(
  () => state.dialog && state.dialog._perf,
  async (perf) => {
    if (!perf || perf.traceId === lastRenderedTrace) return
    lastRenderedTrace = perf.traceId
    await nextTick()
    const renderedAt = Date.now()
    const vueRender = renderedAt - perf.dialogReadyAt
    const total = perf.txAt ? renderedAt - perf.txAt : renderedAt - perf.receivedAt
    const phases = [
      perf.txAt && { name: '发送→读取', ms: Math.max(0, perf.readStartedAt - perf.txAt) },
      { name: 'Java读取', ms: perf.nativeReadMs },
      { name: '解码分帧', ms: Math.max(0, perf.framedAt - perf.receivedAt) },
      { name: '队列', ms: Math.max(0, perf.protoStartedAt - perf.enqueuedAt) },
      { name: '协议解析', ms: Math.max(0, perf.dialogReadyAt - perf.protoStartedAt) },
      { name: 'Vue渲染', ms: vueRender }
    ].filter(Boolean)
    const measured = phases.reduce((sum, phase) => sum + phase.ms, 0)
    const slowest = phases.reduce((max, phase) => phase.ms > max.ms ? phase : max, phases[0])
    const slowestPct = measured > 0 ? Math.round(slowest.ms * 100 / measured) : 0
    log(
      'DIALOG',
      perf.traceId + ' 首屏已渲染 类型=' + perf.dialogType + ' 条目=' + perf.itemCount,
      'Vue渲染=' + vueRender + 'ms',
      (perf.txAt ? '发送→首屏=' : '接收→首屏=') + total + 'ms',
      '主要耗时=' + slowest.name + ' ' + slowest.ms + 'ms(' + slowestPct + '%)',
      perf.txId ? '(关联TX#' + perf.txId + ': ' + perf.txText + ')' : ''
    )
  },
  { immediate: true, flush: 'post' }
)

function loadMoreButtons() {
  if (!hasMoreButtons.value) return
  buttonRenderLimit.value = Math.min(
    allButtons.value.length,
    buttonRenderLimit.value + BUTTON_RENDER_CHUNK
  )
}

function loadMoreLines() {
  if (!hasMoreLines.value) return
  lineRenderLimit.value = Math.min(
    allDialogLines.value.length,
    lineRenderLimit.value + LINE_RENDER_CHUNK
  )
}

function loadMoreContent() {
  loadMoreLines()
  loadMoreButtons()
}

const promptLines = computed(() => {
  if (state.dialog && state.dialog.prompt) return [{ segs: state.dialog.prompt }]
  if (type.value === 'cmd') return [{ segs: [{ t: '请输入指令：' }] }]
  return []
})

const setbtHint = computed(() => {
  const n = state.dialog ? state.dialog.n : 0
  return [{ t: '请输入你要对【按钮' + n + '】的定义：\n[ 按钮名字,要执行的指令 ]\n' }]
})

const gridBtnStyle = computed(() => {
  const d = state.dialog
  if (!d) return {}
  const w = (d.widthPct !== undefined ? d.widthPct : 96) + '%'
  const h = Math.max(30, Math.round(winH / (2 * (d.rowsH || 9)) + 5)) + 'px'
  return { width: w, height: h }
})

function onMask() {
  // 点击遮罩不关闭 (与原版 modal 一致)
}

function close() {
  log('BTN', '点击 关闭弹窗')
  if (type.value === 'more') net.sendLine('q')
  state.dialog = null
}

function tapGrid(b) {
  const cmd = b && b.cmd
  if (cmd == null || cmd === '') return
  log('BTN', '点击网格按钮, 分配指令:', escapeStr(cmd))
  if (type.value === 'act') {
    state.dialog = null
    if (cmd.charAt(0) === ESC && cmd.indexOf(ESC + '020') === 0) {
      log('BTN', '该指令为弹出式(\\x1b020), 打开新弹窗而非发送')
      openPop(cmd.substr(4))
    } else {
      net.sendLine(cmd)
    }
  } else {
    state.dialog = null
    net.sendLine(cmd)
  }
}

function tapConfirm(b) {
  const cmd = b && b.cmd
  if (cmd == null || cmd === '') return
  state.dialog = null
  log('BTN', '点击确认按钮, 分配指令:', escapeStr(cmd))
  net.sendLine(cmd)
}

function more(cmd) {
  log('BTN', '分页操作, 分配指令:', cmd || '<ENTER>')
  state.dialog = null
  net.sendLine(cmd)
}

function tapRich(e) {
  if (!e || e.cmd == null || e.cmd === '') return
  if (e.label) state.dialogTitle = e.label
  log('BTN', '点击弹窗行内按钮, 分配指令:', escapeStr(e.cmd))
  net.sendLine(e.cmd)
}

function submitInput() {
  const d = state.dialog
  if (!d) return
  if (type.value === 'input') {
    if (input.value !== '') {
      const cmd = d.cmdId.replace('$txt#', input.value)
      log('BTN', '输入弹窗确定, 分配指令:', escapeStr(cmd))
      net.sendLine(cmd)
      state.dialog = null
      input.value = ''
    }
  } else {
    if (input.value !== '') {
      log('BTN', '指令弹窗执行, 分配指令:', escapeStr(input.value))
      net.sendLine(input.value)
      state.dialog = null
      input.value = ''
    }
  }
}

function toggleLong() {
  log('BTN', '系统菜单: 切换场景显示')
  state.longVisible = !state.longVisible
}

function toggleChat() {
  log('BTN', '系统菜单: 切换聊天宽度')
  state.chatExpanded = !state.chatExpanded
}

function changeTheme(event) {
  const enabled = Boolean(event && event.detail && event.detail.value)
  log('BTN', '系统菜单: 切换主题为' + (enabled ? '亮色' : '暗色'))
  setThemeMode(enabled ? 'light' : 'dark')
  runtime.showToast({ title: '重新进入app生效', icon: 'none' })
}

function styleError(title, error) {
  runtime.showModal({ title, content: error && error.message ? error.message : String(error), showCancel: false })
}

async function exportStyle() {
  if (styleBusy.value) return
  styleBusy.value = true
  try {
    const result = await runtime.exportTextFile({
      suggestedName: 'mud-agent-style.json',
      mimeType: 'application/json',
      text: exportAppAppearanceText()
    })
    if (result) runtime.showModal({ title: '样式已导出', content: result.path || result.name || '导出完成', showCancel: false })
  } catch (error) { styleError('导出失败', error) } finally { styleBusy.value = false }
}

async function importStyle() {
  if (styleBusy.value) return
  styleBusy.value = true
  try {
    const file = await runtime.importTextFile({ suggestedName: 'mud-agent-style.json', accept: '.json,application/json', maxBytes: 1024 * 1024 })
    if (!file) return
    importAppAppearanceText(file.text)
    runtime.showModal({ title: '样式已导入', content: '重新进入app生效。', showCancel: false })
  } catch (error) { styleError('导入失败', error) } finally { styleBusy.value = false }
}

function restoreStyle() {
  if (styleBusy.value) return
  runtime.showModal({
    title: '还原全部样式',
    content: '将清除暗色和亮色两套自定义样式，恢复应用默认主题；重新进入app生效。是否继续？',
    confirmText: '还原',
    success: ({ confirm }) => {
      if (!confirm) return
      resetAppAppearance('both')
      runtime.showModal({ title: '已还原默认样式', content: '重新进入app生效。', showCancel: false })
    }
  })
}

function quitGame() {
  log('BTN', '系统菜单: 点击退出游戏')
  state.dialog = null
  runtime.showModal({
    title: '退出游戏',
    content: '确定要退出游戏吗？',
    confirmColor: appStyle['--app-danger'],
    success: (res) => {
      if (res.confirm) {
        // 与原版 relogin 一致: 退出后清除自动登录标记
        runtime.removeStorageSync('mud_auto')
        net.quit()
        setTimeout(() => {
          runtime.navigateTo({ url: '/pages/login/login' })
        }, 200)
      }
    }
  })
}

function saveSetBt() {
  const n = state.dialog.n
  const val = input.value
  if (!val) {
    runtime.showToast({ title: '请输入定义内容！', icon: 'none' })
    return
  }
  const parts = val.split(',')
  if (parts.length !== 2) {
    runtime.showToast({ title: '格式错误！请输入：名称和指令，用英文逗号隔开。', icon: 'none' })
    return
  }
  log('BTN', '保存自定按钮' + n + ':', escapeStr(val))
  runtime.setStorageSync('mybt' + n, val)
  input.value = ''
  state.dialog = null
  state.screen.push({ segs: [{ t: '按钮' + n + '自定义完毕。\n' }] })
  state.screenScrollId++
}
</script>

<style>
.gd-mask {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: var(--app-overlay, rgba(0, 0, 0, 0.65));
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx;
  box-sizing: border-box;
}

.gd-panel {
  position: relative;
  width: 100%;
  height: 100%;
  max-height: 100%;
  background: var(--app-dialog-background-color, var(--app-surface));
  border: var(--app-border-width, 1rpx) solid var(--app-border);
  border-radius: var(--app-radius-medium, 8rpx);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}
.gd-close {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  z-index: 3;
  width: 56rpx;
  height: 56rpx;
  color: var(--app-text-muted);
  background: var(--app-surface-muted);
  border: var(--app-border-width, 1rpx) solid var(--app-border);
  border-radius: var(--app-radius-small, 4rpx);
  font-size: 28rpx;
  line-height: 56rpx;
  text-align: center;
}
.gd-body {
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
}
.gd-content {
  padding: 16rpx 20rpx 28rpx;
  box-sizing: border-box;
}
.gd-body.mono {
  font-size: 20rpx;
}
.gd-line {
  margin-bottom: 4rpx;
}
.gd-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
}
.gd-btn {
  border: var(--app-border-width, 1rpx) solid var(--app-border);
  border-radius: var(--app-radius-small, 4rpx);
  background: var(--app-secondary-button-background-color, var(--app-surface-muted));
  color: var(--app-text);
  font-size: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: left;
  min-height: 56rpx;
  padding: 8rpx;
  margin-bottom: 8rpx;
  box-sizing: border-box;
}
.gd-btn:active {
  background: var(--app-surface-raised);
}
.gd-textarea {
  width: 100%;
  min-height: 70rpx;
  background: var(--app-input-background-color, var(--app-input-background));
  color: var(--app-text);
  font-size: 28rpx;
  padding: 12rpx;
  border: var(--app-border-width, 1rpx) solid var(--app-border);
  border-radius: var(--app-radius-small, 4rpx);
  margin-top: 12rpx;
  box-sizing: border-box;
}
.gd-input-btns {
  display: flex;
  margin-top: 16rpx;
  justify-content: flex-end;
}
.gd-submit {
  width: 24%;
  min-height: 70rpx;
  background: var(--app-primary-button-background-color, var(--app-primary));
  color: var(--app-primary-contrast);
  border-radius: var(--app-radius-small, 4rpx);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  margin-left: 12rpx;
}
.gd-submit.gray {
  background: var(--app-surface-muted);
}
.gd-conf-btn {
  min-height: 80rpx;
  background: var(--app-secondary-button-background-color, var(--app-surface-muted));
  border: var(--app-border-width, 1rpx) solid var(--app-border);
  border-radius: var(--app-radius-small, 4rpx);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text);
  font-size: 26rpx;
  margin-bottom: 16rpx;
}
.gd-conf-btn.danger {
  color: var(--app-danger);
}
.gd-config {
  padding-top: 12rpx;
}
.gd-confirm-grid {
  margin-top: 20rpx;
}
.gd-act-intro {
  margin-bottom: 14rpx;
}
.gd-input-actions {
  margin-top: 16rpx;
}
.gd-confirm-btn {
  width: 48%;
  min-height: 70rpx;
}
.gd-more-btns {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  margin-top: 16rpx;
  padding: 12rpx 0 4rpx;
  border-top: var(--app-border-width, 1rpx) solid var(--app-border);
  background: var(--app-dialog-background-color, var(--app-surface));
}
.gd-theme-row {
  min-height: 80rpx;
  margin-bottom: 16rpx;
  padding: 0 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--app-secondary-button-background-color, var(--app-surface-muted));
  border: var(--app-border-width, 1rpx) solid var(--app-border);
  border-radius: var(--app-radius-small, 4rpx);
  color: var(--app-text);
  font-size: 26rpx;
}
.gd-config-title { display: block; margin: 6rpx 0 10rpx; color: var(--app-text-muted); font-size: 20rpx; }
.gd-config-actions { display: flex; gap: 12rpx; }
.gd-config-half { flex: 1; min-width: 0; }
.gd-config-hint { display: block; margin: -4rpx 0 16rpx; color: var(--app-text-muted); font-size: 18rpx; line-height: 1.5; }
.gd-conf-btn.disabled { opacity: 0.45; pointer-events: none; }
.gd-load-more {
  height: 64rpx;
  margin: 8rpx 0 4rpx;
  border: var(--app-border-width, 1rpx) solid var(--app-primary);
  border-radius: var(--app-radius-small, 4rpx);
  color: var(--app-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
}
</style>
