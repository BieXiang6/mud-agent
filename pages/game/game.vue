<template>
  <view class="page" :class="{ light: state.themeMode === 'light' }" :style="appStyle">
    <!-- 已登录主界面 -->
    <template v-if="state.connected && state.stage === 'loginok'">
      <!-- 顶部聊天区 -->
      <view class="chat" :class="{ expanded: state.chatExpanded }">
        <scroll-view scroll-y class="chat-scroll" :scroll-top="1000000 + state.chatScrollId">
          <view v-for="(node, i) in state.chat" :key="node.id || ('chat-' + i)" class="chat-line">
            <RichText :node="node" @btn="onBtn" />
          </view>
        </scroll-view>
      </view>

      <!-- 标题栏: 房间名 + 顶栏按钮 -->
      <view class="tbar">
        <view class="here" hover-class="hp" @tap="toggleLong"><RichText :segs="state.title.segs" @btn="onBtn" /></view>
        <view class="tmenu">
          <view class="tm-btn ai-entry" hover-class="hp" @tap="openAi">AI</view>
          <view v-for="(b, i) in state.tmenu" :key="i" class="tm-btn" hover-class="hp" @tap="tap(b.cmd, labelText(b.label, b.text))">
            <RichText :segs="b.label" :text="b.text" />
          </view>
        </view>
      </view>

      <!-- 中部: 左物品/动作 + 右输出/出口 -->
      <view class="mid">
        <view class="mleft">
          <view class="obj-wrap">
            <scroll-view scroll-y class="obj-scroll">
              <view v-for="(o, i) in state.objects" :key="i" class="obj-item">
                <view class="obj-bar">
                  <view class="obj-hp" :style="{ width: objHpPct(o) + '%' }" />
                  <view class="obj-qi" :style="{ width: objQiPct(o) + '%' }" />
                </view>
                <view class="obj-btn" hover-class="hp" @tap="tap(o.cmd, labelText(o.label, o.text))">
                  <RichText :segs="o.label" :text="o.text" />
                </view>
              </view>
            </scroll-view>
          </view>
          <view class="acts-wrap">
            <scroll-view scroll-y class="acts-scroll">
              <view v-for="(a, i) in state.acts" :key="i" class="act-btn" hover-class="hp" @tap="tap(a.cmd, labelText(a.label, a.text))">
                <RichText :segs="a.label" :text="a.text" />
              </view>
            </scroll-view>
          </view>
        </view>

        <view class="mright">
          <view class="content-wrap">
            <!-- 场景描述: 与输出区同宽，按内容增高，超过上限后滚动 -->
            <view v-if="state.longVisible && state.long.length" class="long-wrap">
              <view v-for="(node, i) in visibleLong" :key="node.id || ('long-' + i)" class="long-line">
                <RichText :node="node" @btn="onBtn" />
              </view>
              <view v-if="hasMoreLong" class="long-more" hover-class="hp" @tap="loadMoreLong">
                继续显示场景（剩余 {{ state.long.length - longRenderLimit }} 行）
              </view>
            </view>

            <view class="out-wrap">
              <scroll-view scroll-y class="out-scroll" :scroll-top="1000000 + state.screenScrollId">
                <view v-for="(node, i) in state.screen" :key="node.id || ('screen-' + i)" class="out-line">
                  <RichText v-if="!node.hr" :node="node" @btn="onBtn" />
                  <view v-else class="hr-line" />
                </view>
              </scroll-view>
            </view>
            <GameDialog v-if="state.dialog" />
            <view
              v-if="aiState.visible"
              class="ai-panel"
              :style="{ left: aiPosition.x + 'px', top: aiPosition.y + 'px' }"
            >
              <view
                class="ai-panel-head ai-drag-handle"
                @touchstart.stop="startAiDrag"
                @touchmove.stop="moveAiDrag"
                @touchend.stop="endAiDrag"
              >
                <text class="ai-panel-title">AI · {{ aiState.selectedProfile ? aiState.selectedProfile.name : '未配置' }}</text>
                <view class="ai-close" hover-class="hp" @tap="closeAi">关闭</view>
              </view>
              <view class="ai-panel-tools">
                <view class="ai-panel-tool" hover-class="hp" @tap="openAiGuide">教程</view>
                <view class="ai-panel-tool" hover-class="hp" @tap="openModelSettings">模型</view>
                <view class="ai-panel-tool" hover-class="hp" @tap="openSkillSettings">Skills</view>
                <view class="ai-panel-tool" hover-class="hp" @tap="openScriptSettings">脚本</view>
                <view class="ai-panel-tool" hover-class="hp" @tap="aiState.taskListVisible = !aiState.taskListVisible">任务</view>
              </view>
              <view v-if="aiState.taskListVisible" class="ai-task-drawer" :style="{ height: aiTaskDrawerHeight + 'rpx' }">
                <view class="ai-task-list-head">
                  <text>任务列表 · {{ aiState.tasks.length }}</text>
                  <view class="ai-task-new" hover-class="hp" @tap="createAiTask">新增任务</view>
                </view>
                <scroll-view scroll-y class="ai-task-scroll">
                  <view v-if="!aiState.tasks.length" class="ai-task-empty">暂无任务</view>
                  <view v-for="item in sortedAiTasks" :key="item.id" class="ai-task-row" :class="{ active: item.id === aiState.activeTaskId }" hover-class="hp" @tap="restoreAiTask(item.id)">
                    <view class="ai-task-marker" />
                    <view class="ai-task-info">
                      <text class="ai-task-title">{{ item.title }}</text>
                      <text class="ai-task-time">{{ formatTaskTime(item.updatedAt) }}</text>
                    </view>
                    <view class="ai-task-delete" hover-class="hp" @tap.stop="confirmDeleteAiTask(item.id)">删除</view>
                  </view>
                </scroll-view>
              </view>
              <scroll-view
                scroll-y
                class="ai-conversation"
                :scroll-top="aiState.conversationScrollTop"
                :lower-threshold="8"
                @touchstart="startAiConversationTouch"
                @touchend="endAiConversationTouch"
                @touchcancel="endAiConversationTouch"
                @scroll="onAiConversationScroll"
                @scrolltolower="resumeAiConversationScroll"
              >
                <view v-if="!aiState.conversation.length" class="ai-empty">输入目标开始多轮对话</view>
                <view v-for="(turn, i) in aiState.conversation" :key="i" class="ai-turn" :class="turn.role">
                  <view class="ai-turn-heading">
                    <view class="ai-turn-role">{{ turn.role === 'user' ? '你' : 'AI' }}</view>
                    <text v-if="turn.role === 'user'" class="ai-token-estimate">≈ {{ estimateContentTokens(turn.text) }} Token</text>
                    <text v-else-if="turn.tokenUsage" class="ai-token-actual">{{ turnTokenUsage(turn) }}</text>
                  </view>
                  <view v-if="turn.role === 'user'" class="ai-turn-text">{{ turn.text }}</view>
                  <view v-else-if="turn.completed" class="ai-finished">
                    <view class="ai-finished-summary">
                      <view class="ai-block-label-row">
                        <view class="ai-flow-label">任务总结</view>
                        <text class="ai-token-estimate">≈ {{ estimateContentTokens(turn.summary) }} Token</text>
                      </view>
                      <MarkdownText :content="turn.summary" />
                    </view>
                    <view class="ai-process-toggle" hover-class="hp" @tap="turn.processExpanded = !turn.processExpanded">
                      <text>{{ turn.processExpanded ? '收起过程' : '查看过程' }}</text>
                      <text class="ai-expand-icon">{{ turn.processExpanded ? '-' : '+' }}</text>
                    </view>
                  </view>
                  <view v-if="turn.role === 'assistant' && (!turn.completed || turn.processExpanded)" class="ai-flow" :class="{ 'with-summary': turn.completed }">
                    <view v-for="(block, bi) in turn.blocks" v-show="block.name !== 'finish'" :key="bi" class="ai-flow-item" :class="block.type">
                      <view v-if="block.type === 'thinking'" class="ai-thinking">
                        <view class="ai-collapsible-head" hover-class="hp" @tap="toggleThinking(block)">
                          <view class="ai-thinking-summary">
                            <view class="ai-flow-label">思考过程</view>
                            <text class="ai-thinking-meta">{{ thinkingMeta(block) }}</text>
                          </view>
                          <text class="ai-expand-icon">{{ block.expanded ? '-' : '+' }}</text>
                        </view>
                        <template v-if="block.expanded">
                          <text class="ai-collapsible-content">{{ visibleThinkingContent(block) }}</text>
                          <view v-if="thinkingPages(block) > 1" class="ai-thinking-pager">
                            <view
                              class="ai-thinking-page-btn"
                              :class="{ disabled: thinkingPageIndex(block) <= 0 }"
                              hover-class="hp"
                              @tap.stop="previousThinkingPage(block)"
                            >上一页</view>
                            <text class="ai-thinking-page-state">{{ thinkingPageIndex(block) + 1 }} / {{ thinkingPages(block) }}</text>
                            <view
                              class="ai-thinking-page-btn"
                              :class="{ disabled: thinkingPageIndex(block) >= thinkingPages(block) - 1 }"
                              hover-class="hp"
                              @tap.stop="nextThinkingPage(block)"
                            >下一页</view>
                          </view>
                        </template>
                      </view>
                      <view v-else-if="block.type === 'tool'" class="ai-tool" :class="{ error: block.isError }">
                        <view class="ai-collapsible-head" hover-class="hp" @tap="block.expanded = !block.expanded">
                          <view class="ai-tool-summary">
                            <view class="ai-flow-label">工具调用</view>
                            <text class="ai-tool-name">{{ block.name }}</text>
                            <text class="ai-tool-state" :class="block.status">
                              {{ block.status === 'running' ? '执行中' : block.isError ? '失败' : '完成' }}
                            </text>
                            <text class="ai-token-estimate">≈ {{ estimateBlockTokens(block) }} Token</text>
                          </view>
                          <text class="ai-expand-icon">{{ block.expanded ? '-' : '+' }}</text>
                        </view>
                        <view v-if="block.expanded">
                          <view class="ai-tool-call">
                            <view class="ai-block-label-row">
                              <view class="ai-flow-label">参数</view>
                              <text class="ai-token-estimate">≈ {{ estimateContentTokens(block.args) }} Token</text>
                            </view>
                            <text class="ai-tool-data">{{ block.args }}</text>
                          </view>
                          <view class="ai-tool-result">
                            <view class="ai-block-label-row">
                              <view class="ai-flow-label">结果</view>
                              <text class="ai-token-estimate">≈ {{ estimateContentTokens(block.result) }} Token</text>
                            </view>
                            <text v-if="block.status === 'running'" class="ai-tool-running">执行中...</text>
                            <text v-else class="ai-tool-data">{{ block.result }}</text>
                          </view>
                        </view>
                      </view>
                      <view v-else class="ai-flow-content ai-answer">
                        <view class="ai-block-label-row">
                          <view class="ai-flow-label">回复</view>
                          <text class="ai-token-estimate">≈ {{ estimateBlockTokens(block) }} Token</text>
                        </view>
                        <MarkdownText :content="block.content" />
                      </view>
                    </view>
                  </view>
                </view>
                <view class="ai-status">{{ aiState.status }}<text v-if="aiState.contextUsage.contextWindow" class="ai-context"> · 上下文 {{ aiState.contextUsage.percent }}%</text><text v-if="aiState.contextUsage.compressionCount" class="ai-context"> · 已压缩 {{ aiState.contextUsage.compressionCount }} 次</text><text v-if="aiState.error" class="ai-error">：{{ aiState.error }}</text></view>
              </scroll-view>
              <view class="ai-composer">
                <textarea v-model="aiState.task" class="ai-task" maxlength="2000" placeholder="输入下一轮目标" />
                <view class="ai-actions">
                  <view v-if="!aiState.busy" class="ai-action primary" hover-class="hp" @tap="runAiTask">发送</view>
                  <view v-else class="ai-action danger" hover-class="hp" @tap="stopAiTask">停止</view>
                  <view class="ai-action" hover-class="hp" @tap="createAiTask">新增任务</view>
                </view>
              </view>
            </view>
            <view class="ai-render-bridge" :payload="aiRenderState.requestPayload" :change:payload="aiRender.onRequest" />
          </view>

          <!-- 方向出口 -->
          <view class="exits">
            <view v-if="state.mycmdsVisible" class="mycmds">
              <view
                v-for="(b, i) in state.mycmds.slice(0, 5)"
                :key="'mycmd-first-' + i"
                class="mycmds-btn" hover-class="hp"
                @tap="myBtnTap(b)"
              >
                <RichText :segs="b.label" :text="b.text" />
              </view>
              <view class="mycmds-btn" hover-class="hp" @tap="closeMyCmds">关闭<br />选项</view>
              <view
                v-for="(b, i) in state.mycmds.slice(5)"
                :key="'mycmd-rest-' + i"
                class="mycmds-btn" hover-class="hp"
                @tap="myBtnTap(b)"
              >
                <RichText :segs="b.label" :text="b.text" />
              </view>
            </view>
            <view v-else class="exits-grid">
              <view v-for="k in dirOrder" :key="k" class="exits-cell">
                <view
                  v-if="k !== 'c' && state.dirs[k]"
                  class="dir-btn" hover-class="hp"
                  @tap="tap(state.dirs[k].cmd, labelText(state.dirs[k].label, state.dirs[k].text))"
                >
                  <RichText :segs="state.dirs[k].label" :text="state.dirs[k].text" />
                </view>
                <view v-else-if="k === 'c'" class="dir-center">
                  <RichText :segs="state.title.segs" @btn="onBtn" />
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 状态条 HP/MP -->
      <view class="hps">
        <view v-for="(row, ri) in state.hpRows" :key="ri" class="hp-row">
          <view
            v-for="(cell, ci) in row"
            :key="ci"
            class="hp-cell"
            :class="{ clickable: !!cell.cmd }"
            :style="{ width: (100 / row.length) + '%' }"
            @tap="cell.cmd && tap(cell.cmd, cell.label)"
          >
            <view class="hp-track" :style="{ width: cell.bars[0].pct + '%', height: hpCellHeight(cell) + 'px' }">
              <view
                class="hp-fill"
                :style="{
                  width: (cell.bars.length > 1 ? cell.bars[1].pct : 100) + '%',
                  background: cell.bars[cell.bars.length - 1].color
                }"
              >
                <text class="hp-label">{{ cell.label }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 底部菜单 -->
      <view class="menu">
        <view class="menu-btn" hover-class="hp" @tap="openCmd">指令</view>
        <view class="menu-btn" hover-class="hp" @tap="menuSend('mycmds ofen', '常用')">常用</view>
        <view class="menu-btn" hover-class="hp" @tap="menuSend('mycmds skill', '技能')">技能</view>
        <view class="menu-btn" hover-class="hp" @tap="menuSend('mycmds fight', '战斗')">战斗</view>
        <view class="menu-btn" hover-class="hp" @tap="menuSend('mycmds quest', '任务')">任务</view>
        <view class="menu-btn" hover-class="hp" @tap="menuSend('mycmds help', '帮助')">帮助</view>
        <view class="menu-btn" hover-class="hp" @tap="menuSend('liaotian', '聊天')">聊天</view>
        <view class="menu-btn" hover-class="hp" @tap="openConfig">系统</view>
      </view>

      <view
        v-if="quickVisible"
        class="quick-panel"
        :style="quickPanelStyle"
      >
        <view
          class="quick-panel-head"
          @touchstart.stop="startQuickPanelDrag"
          @touchmove.stop.prevent="moveQuickPanelDrag"
          @touchend.stop="endQuickPanelDrag"
          @touchcancel.stop="endQuickPanelDrag"
        >
          <text class="quick-panel-title">{{ quickPanelTitle }}</text>
          <view class="quick-panel-close" hover-class="hp" @touchstart.stop @touchmove.stop @tap.stop="closeQuickPanel">关闭</view>
        </view>
        <scroll-view scroll-y class="quick-panel-body">
          <view class="quick-panel-grid">
            <view
              v-for="(b, i) in quickCommands"
              :key="'quick-command-' + i"
              :data-quick-index="i"
              class="mycmds-btn" hover-class="hp"
              @tap="myBtnTap(b)"
              @longpress="editQuickButton(i)"
            >
              <RichText :segs="b.label" :text="b.text" />
            </view>
          </view>
        </scroll-view>
      </view>

      <view
        class="quick-fab"
        :class="{ dragging: quickEntryDrag.active }"
        :style="quickEntryStyle"
        @touchstart.stop="startQuickEntryDrag"
        @touchmove.stop.prevent="moveQuickEntryDrag"
        @touchend.stop="endQuickEntryDrag"
        @touchcancel.stop="endQuickEntryDrag"
        @tap.stop="toggleQuickPanel"
      >
        <text>快捷</text>
      </view>
    </template>

    <!-- 连接断开 -->
    <view v-else class="lost">
      <text class="lost-title">这是江湖智能体</text>
      <text class="lost-t">{{ state.connected ? '' : '连接已断开' }}</text>
      <view class="lost-btn" hover-class="hp" @tap="backToLogin">返回登录</view>
    </view>

  </view>
</template>

<script>
import { handleAiRenderEvent as dispatchAiRenderEvent } from '@/utils/ai/controller.js'
import { log as writeLog } from '@/utils/log.js'

export default {
  methods: {
    onAiRenderEvent(event) {
      dispatchAiRenderEvent(event)
    },
    onAiRenderBridgeReady() {
      writeLog('AI-HTTP', 'renderjs 请求桥已就绪')
    }
  }
}
</script>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onShow } from '@/utils/platform/lifecycle.js'
import { state, resetAll } from '@/utils/store.js'
import { runtime } from '@/utils/platform/index.js'
import { appStyle } from '@/utils/appearance.js'
import net from '@/utils/net.js'
import RichText from '@/components/RichText.vue'
import GameDialog from '@/components/GameDialog.vue'
import MarkdownText from '@/components/MarkdownText.vue'
import { log, escapeStr } from '@/utils/log.js'
import {
  clampThinkingPage,
  thinkingPageContent,
  thinkingPageCount
} from '@/utils/ai/thinkingPagination.js'
import { estimateTextTokens } from '@/utils/ai/tokenUsage.js'
import {
  aiState,
  aiRenderState,
  openAiPanel,
  closeAiPanel,
  refreshAiState,
  createAiTask,
  restoreAiTask,
  deleteAiTask,
  scrollAiConversationToBottom,
  pauseAiConversationAutoScroll,
  resumeAiConversationAutoScroll,
  runAiTask,
  stopAiTask
} from '@/utils/ai/controller.js'

const winInfo = runtime.getWindowInfo()
const winH = winInfo.windowHeight
const winW = winInfo.windowWidth
const dirOrder = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']
const LONG_RENDER_CHUNK = 80
const aiPosition = reactive({
  x: Math.max(12, winW * 0.12),
  y: Math.max(50, winH * 0.12)
})
const aiDrag = reactive({ active: false, offsetX: 0, offsetY: 0 })
const quickEntrySize = 44
const quickPanelHeight = Math.min(winH - 16, Math.max(120, Math.min(240, 228 * winW / 750)))
const quickPanelSize = {
  width: Math.min(winW - 16, Math.max(280, winW * 0.76), 520),
  height: quickPanelHeight
}
const quickEntryPosition = reactive({
  x: Math.max(8, winW - quickEntrySize - 8),
  y: Math.max(8, (winH - quickEntrySize) / 2)
})
const quickPanelPosition = reactive({
  x: Math.max(8, winW - quickPanelSize.width - 12),
  y: Math.max(8, winH - quickPanelSize.height - 92)
})
const quickEntryDrag = reactive({ active: false, moved: false, offsetX: 0, offsetY: 0, startX: 0, startY: 0 })
const quickPanelDrag = reactive({ active: false, offsetX: 0, offsetY: 0 })
const quickVisible = ref(false)
const quickCommands = ref([])
let suppressQuickEntryTapUntil = 0
let suppressQuickButtonTapUntil = 0
let aiConversationTouching = false
let aiConversationTouchTimer = null
let aiConversationLastScrollTop = 0
const longRenderLimit = ref(LONG_RENDER_CHUNK)
const visibleLong = computed(() => state.long.slice(0, longRenderLimit.value))
const hasMoreLong = computed(() => state.long.length > longRenderLimit.value)
const sortedAiTasks = computed(() => [...aiState.tasks].sort((a, b) => b.updatedAt - a.updatedAt))
const aiTaskDrawerHeight = computed(() => 52 + (aiState.tasks.length ? Math.min(aiState.tasks.length, 5) * 66 : 72))
const quickPanelTitle = '自定快捷 · 长按设置'
const quickEntryStyle = computed(() => ({
  left: quickEntryPosition.x + 'px',
  top: quickEntryPosition.y + 'px',
  width: quickEntrySize + 'px',
  height: quickEntrySize + 'px'
}))
const quickPanelStyle = computed(() => ({
  left: quickPanelPosition.x + 'px',
  top: quickPanelPosition.y + 'px',
  width: quickPanelSize.width + 'px',
  height: quickPanelSize.height + 'px'
}))

function loadMoreLong() {
  if (!hasMoreLong.value) return
  longRenderLimit.value = Math.min(state.long.length, longRenderLimit.value + LONG_RENDER_CHUNK)
}

watch(() => state.title, () => { longRenderLimit.value = LONG_RENDER_CHUNK })

function labelText(label, raw = '') {
  if (!label) return raw || ''
  return label.map((s) => s.t).join('')
}

// 通用按钮点击 (顶栏/物品/动作/方向): 记录分配到的指令, 再发送
function tap(cmd, label) {
  if (label) state.dialogTitle = label
  log('BTN', '点击按钮, 分配指令:', escapeStr(cmd))
  net.sendLine(cmd)
}

// 行内命令按钮 (u:cmds)
function onBtn(e) {
  if (e && e.label) state.dialogTitle = e.label
  log('BTN', '点击行内命令按钮, 分配指令:', escapeStr(e && e.cmd))
  net.sendLine(e.cmd)
}

// 底部菜单: 记录分配到的指令, 再发送
function menuSend(cmd, label) {
  state.dialogTitle = label || ''
  log('BTN', '点击菜单(' + (label || '') + '), 分配指令:', escapeStr(cmd))
  net.sendLine(cmd)
}

// 指令 (本地弹窗)
function openCmd() {
  log('BTN', '点击 指令 → 打开指令输入弹窗')
  state.dialogTitle = '执行指令'
  state.dialog = { type: 'cmd', title: '执行指令' }
}

// 系统菜单
function openConfig() {
  log('BTN', '点击 系统 → 打开系统菜单')
  state.dialogTitle = '系统菜单'
  state.dialog = { type: 'config', title: '系统菜单' }
}

function loadQuickCommands() {
  const commands = []
  for (let i = 1; i <= 10; i++) {
    const v = runtime.getStorageSync('mybt' + i)
    if (v) {
      const parts = v.split(',')
      commands.push({ label: [{ t: parts[0] }], cmd: parts[1] })
    } else {
      commands.push({ label: [{ t: '***' }], cmd: '' })
    }
  }
  quickCommands.value = commands
}

// 自定快捷使用独立浮窗，不与服务器 mycmds 菜单共享状态。
function userBT() {
  log('BTN', '点击 快捷 → 打开自定快捷浮窗')
  loadQuickCommands()
  quickVisible.value = true
}

function toggleLong() {
  state.longVisible = !state.longVisible
  log('BTN', '点击房间名: 场景' + (state.longVisible ? '打开' : '关闭'))
}

function openAi() {
  aiConversationLastScrollTop = 0
  openAiPanel()
}

function openModelSettings() {
  runtime.navigateTo({ url: '/pages/ai-settings/ai-settings' })
}

function openAiGuide() {
  runtime.navigateTo({ url: '/pages/ai-guide/ai-guide' })
}

function openSkillSettings() {
  runtime.navigateTo({ url: '/pages/ai-skills/ai-skills' })
}

function openScriptSettings() {
  runtime.navigateTo({ url: '/pages/ai-scripts/ai-scripts' })
}

function formatTaskTime(value) {
  const date = new Date(Number(value) || Date.now())
  const pad = (item) => String(item).padStart(2, '0')
  return pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function confirmDeleteAiTask(id) {
  const task = aiState.tasks.find((item) => item.id === id)
  runtime.showModal({ title: '删除任务', content: '确认删除“' + (task ? task.title : '此任务') + '”？', success: ({ confirm }) => { if (confirm) deleteAiTask(id) } })
}

function startAiConversationTouch() {
  if (aiConversationTouchTimer) clearTimeout(aiConversationTouchTimer)
  aiConversationTouching = true
}

function endAiConversationTouch() {
  if (aiConversationTouchTimer) clearTimeout(aiConversationTouchTimer)
  aiConversationTouchTimer = setTimeout(() => {
    aiConversationTouching = false
    aiConversationTouchTimer = null
  }, 250)
}

function onAiConversationScroll(event) {
  const nextTop = Number(event && event.detail ? event.detail.scrollTop : 0)
  if (aiConversationTouching && nextTop < aiConversationLastScrollTop - 3) {
    pauseAiConversationAutoScroll()
  }
  aiConversationLastScrollTop = nextTop
}

function resumeAiConversationScroll() {
  resumeAiConversationAutoScroll()
}

function thinkingPages(block) {
  return thinkingPageCount(block && block.content)
}

function thinkingPageIndex(block) {
  const lastPage = thinkingPages(block) - 1
  if (!block || block.thinkingFollowLatest !== false) return lastPage
  return clampThinkingPage(block.content, block.thinkingPage)
}

function visibleThinkingContent(block) {
  return thinkingPageContent(block && block.content, thinkingPageIndex(block))
}

function thinkingMeta(block) {
  const length = String(block && block.content || '').length
  const pages = thinkingPages(block)
  return length + ' 字' + (pages > 1 ? ' · ' + pages + ' 页' : '') + ' · ≈ ' + estimateBlockTokens(block) + ' Token'
}

function estimateContentTokens(content) {
  return estimateTextTokens(content)
}

function estimateBlockTokens(block) {
  if (!block) return 0
  if (block.type === 'tool') return estimateTextTokens((block.name || '') + (block.args || '') + (block.result || ''))
  return estimateTextTokens(block.content)
}

function formatTokenCount(value) {
  const count = Math.max(0, Math.round(Number(value) || 0))
  if (count < 1000) return String(count)
  if (count < 1000000) return (count / 1000).toFixed(count < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k'
  return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'm'
}

function turnTokenUsage(turn) {
  const usage = turn && turn.tokenUsage ? turn.tokenUsage : {}
  const total = Number(usage.totalTokens) || (
    Number(usage.input || 0) + Number(usage.output || 0) + Number(usage.cacheRead || 0) + Number(usage.cacheWrite || 0)
  )
  const parts = [
    '实际 输入 ' + formatTokenCount(usage.input),
    '输出 ' + formatTokenCount(usage.output)
  ]
  if (Number(usage.reasoning) > 0) parts.push('思考 ' + formatTokenCount(usage.reasoning))
  if (Number(usage.cacheRead) > 0) parts.push('缓存 ' + formatTokenCount(usage.cacheRead))
  parts.push('总计 ' + formatTokenCount(total) + ' Token')
  return parts.join(' · ')
}

function toggleThinking(block) {
  if (!block) return
  block.expanded = !block.expanded
  if (block.expanded && block.thinkingPage == null) {
    block.thinkingFollowLatest = true
    block.thinkingPage = thinkingPages(block) - 1
  }
}

function previousThinkingPage(block) {
  const current = thinkingPageIndex(block)
  if (current <= 0) return
  block.thinkingFollowLatest = false
  block.thinkingPage = current - 1
  pauseAiConversationAutoScroll()
}

function nextThinkingPage(block) {
  const current = thinkingPageIndex(block)
  const lastPage = thinkingPages(block) - 1
  if (current >= lastPage) return
  const next = current + 1
  block.thinkingPage = next
  block.thinkingFollowLatest = next === lastPage
}

function closeAi() {
  closeAiPanel()
}

function startAiDrag(event) {
  const point = event && event.touches && event.touches[0]
  if (!point) return
  aiDrag.active = true
  aiDrag.offsetX = point.pageX - aiPosition.x
  aiDrag.offsetY = point.pageY - aiPosition.y
}

function moveAiDrag(event) {
  if (!aiDrag.active) return
  const point = event && event.touches && event.touches[0]
  if (!point) return
  const panelW = Math.min(winW * 0.86, 620)
  const panelH = Math.min(winH * 0.78, 720)
  aiPosition.x = Math.max(0, Math.min(winW - panelW, point.pageX - aiDrag.offsetX))
  aiPosition.y = Math.max(0, Math.min(winH - panelH, point.pageY - aiDrag.offsetY))
}

function endAiDrag() {
  aiDrag.active = false
}

function touchPoint(event) {
  if (!event) return null
  return (event.touches && event.touches[0]) ||
    (event.changedTouches && event.changedTouches[0]) ||
    (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? { pageX: event.clientX, pageY: event.clientY }
      : null)
}

function currentViewport() {
  if (typeof window !== 'undefined') return { width: window.innerWidth, height: window.innerHeight }
  return { width: winW, height: winH }
}

function startQuickEntryDrag(event) {
  const point = touchPoint(event)
  if (!point) return
  quickEntryDrag.active = true
  quickEntryDrag.moved = false
  quickEntryDrag.startX = point.pageX
  quickEntryDrag.startY = point.pageY
  quickEntryDrag.offsetX = point.pageX - quickEntryPosition.x
  quickEntryDrag.offsetY = point.pageY - quickEntryPosition.y
}

function moveQuickEntryDrag(event) {
  if (!quickEntryDrag.active) return
  const point = touchPoint(event)
  if (!point) return
  if (Math.abs(point.pageX - quickEntryDrag.startX) + Math.abs(point.pageY - quickEntryDrag.startY) > 6) {
    quickEntryDrag.moved = true
  }
  if (!quickEntryDrag.moved) return
  const viewport = currentViewport()
  quickEntryPosition.x = Math.max(0, Math.min(viewport.width - quickEntrySize, point.pageX - quickEntryDrag.offsetX))
  quickEntryPosition.y = Math.max(0, Math.min(viewport.height - quickEntrySize, point.pageY - quickEntryDrag.offsetY))
}

function endQuickEntryDrag() {
  if (quickEntryDrag.moved) suppressQuickEntryTapUntil = Date.now() + 300
  quickEntryDrag.active = false
}

function toggleQuickPanel() {
  if (Date.now() < suppressQuickEntryTapUntil) return
  if (quickVisible.value) closeQuickPanel()
  else userBT()
}

function startQuickPanelDrag(event) {
  const point = touchPoint(event)
  if (!point) return
  quickPanelDrag.active = true
  quickPanelDrag.offsetX = point.pageX - quickPanelPosition.x
  quickPanelDrag.offsetY = point.pageY - quickPanelPosition.y
}

function moveQuickPanelDrag(event) {
  if (!quickPanelDrag.active) return
  const point = touchPoint(event)
  if (!point) return
  const viewport = currentViewport()
  quickPanelPosition.x = Math.max(0, Math.min(viewport.width - quickPanelSize.width, point.pageX - quickPanelDrag.offsetX))
  quickPanelPosition.y = Math.max(0, Math.min(viewport.height - quickPanelSize.height, point.pageY - quickPanelDrag.offsetY))
}

function endQuickPanelDrag() {
  quickPanelDrag.active = false
}

// #ifdef H5
let removeElectronQuickPointerEvents = null

function installElectronQuickPointerEvents() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.mudElectron || !window.mudElectron.isElectron) return null
  let pointerId = null
  let dragTarget = ''
  let pressTimer = null
  let pressStart = null

  const clearPress = () => {
    if (pressTimer) clearTimeout(pressTimer)
    pressTimer = null
    pressStart = null
  }
  const finishPointer = () => {
    clearPress()
    if (dragTarget === 'entry') endQuickEntryDrag()
    else if (dragTarget === 'panel') endQuickPanelDrag()
    pointerId = null
    dragTarget = ''
  }
  const onPointerDown = (event) => {
    if (!event.isPrimary || event.button !== 0) return
    const element = event.target instanceof Element ? event.target : null
    if (!element) return
    const entry = element.closest('.quick-fab')
    const panelHead = element.closest('.quick-panel-head')
    const quickButton = element.closest('.quick-panel .mycmds-btn')
    if (entry) {
      pointerId = event.pointerId
      dragTarget = 'entry'
      startQuickEntryDrag(event)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (panelHead && !element.closest('.quick-panel-close')) {
      pointerId = event.pointerId
      dragTarget = 'panel'
      startQuickPanelDrag(event)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (quickButton) {
      const index = Number(quickButton.getAttribute('data-quick-index'))
      pressStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      pressTimer = setTimeout(() => {
        suppressQuickButtonTapUntil = Date.now() + 700
        editQuickButton(index)
        pressTimer = null
      }, 450)
    }
  }
  const onPointerMove = (event) => {
    if (pressStart && event.pointerId === pressStart.pointerId && (
      Math.abs(event.clientX - pressStart.x) > 8 || Math.abs(event.clientY - pressStart.y) > 8
    )) clearPress()
    if (event.pointerId !== pointerId) return
    if (dragTarget === 'entry') moveQuickEntryDrag(event)
    else if (dragTarget === 'panel') moveQuickPanelDrag(event)
    if (dragTarget) event.preventDefault()
  }
  const onPointerEnd = (event) => {
    if (pressStart && event.pointerId === pressStart.pointerId) clearPress()
    if (event.pointerId === pointerId) finishPointer()
  }
  const onWindowBlur = () => finishPointer()

  document.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointermove', onPointerMove, { passive: false, capture: true })
  window.addEventListener('pointerup', onPointerEnd, true)
  window.addEventListener('pointercancel', onPointerEnd, true)
  window.addEventListener('blur', onWindowBlur)
  return () => {
    finishPointer()
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointermove', onPointerMove, true)
    window.removeEventListener('pointerup', onPointerEnd, true)
    window.removeEventListener('pointercancel', onPointerEnd, true)
    window.removeEventListener('blur', onWindowBlur)
  }
}

onMounted(() => { removeElectronQuickPointerEvents = installElectronQuickPointerEvents() })
onBeforeUnmount(() => {
  if (removeElectronQuickPointerEvents) removeElectronQuickPointerEvents()
  removeElectronQuickPointerEvents = null
})

const electronScrollJobs = new Map()

function isElectronRenderer() {
  return typeof window !== 'undefined' && window.mudElectron && window.mudElectron.isElectron
}

function cancelElectronScrollJob(selector) {
  const job = electronScrollJobs.get(selector)
  if (!job || typeof window === 'undefined') return
  for (const frame of job.frames) window.cancelAnimationFrame(frame)
  for (const timer of job.timers) clearTimeout(timer)
  electronScrollJobs.delete(selector)
}

function electronScrollToBottom(selector) {
  if (!isElectronRenderer() || typeof document === 'undefined') return
  nextTick(() => {
    cancelElectronScrollJob(selector)
    const job = { frames: [], timers: [] }
    electronScrollJobs.set(selector, job)
    const apply = () => {
      const host = document.querySelector(selector)
      if (!host) return
      const candidates = [host, ...host.querySelectorAll('*')]
      const scroller = candidates.reduce((best, element) => {
        const overflow = element.scrollHeight - element.clientHeight
        const bestOverflow = best.scrollHeight - best.clientHeight
        return overflow > bestOverflow ? element : best
      }, host)
      scroller.scrollTop = scroller.scrollHeight
    }
    job.frames.push(window.requestAnimationFrame(() => {
      apply()
      job.frames.push(window.requestAnimationFrame(apply))
    }))
    job.timers.push(setTimeout(apply, 80))
    job.timers.push(setTimeout(() => {
      apply()
      electronScrollJobs.delete(selector)
    }, 180))
  })
}

function scrollChatToBottom() {
  electronScrollToBottom('.chat-scroll')
}

function scrollOutputToBottom() {
  electronScrollToBottom('.out-scroll')
}

watch(() => state.chatScrollId, scrollChatToBottom, { flush: 'post' })
watch(() => state.screenScrollId, scrollOutputToBottom, { flush: 'post' })
watch(() => state.chatExpanded, scrollChatToBottom, { flush: 'post' })

onMounted(() => {
  scrollChatToBottom()
  scrollOutputToBottom()
})

onBeforeUnmount(() => {
  for (const selector of [...electronScrollJobs.keys()]) cancelElectronScrollJob(selector)
})
// #endif

function myCmdTap(cmd) {
  // 自定快捷浮窗由用户手动关闭；执行移动等触发房间更新的指令后也保持显示。
  log('BTN', '点击自定按钮, 分配指令:', escapeStr(cmd))
  net.sendLine(cmd)
}

function myBtnTap(b) {
  if (Date.now() < suppressQuickButtonTapUntil) return
  if (b && b.cmd) myCmdTap(b.cmd)
}

function editQuickButton(index) {
  const n = Number(index) + 1
  suppressQuickButtonTapUntil = Date.now() + 500
  log('BTN', '长按 自定' + n + ' → 编辑按钮')
  state.dialogTitle = '定义按钮' + n
  state.dialog = {
    type: 'setbt',
    title: '定义按钮' + n,
    n,
    initialValue: runtime.getStorageSync('mybt' + n) || ''
  }
}

function closeMyCmds() {
  log('BTN', '点击 关闭选项')
  state.mycmdsVisible = false
}

function closeQuickPanel() {
  log('BTN', '点击 关闭自定快捷浮窗')
  quickVisible.value = false
}

// 物品血条
function objHpPct(o) {
  if (!o.hpMax) return 0
  return Math.min(100, (94 * o.hp) / o.hpMax)
}
function objQiPct(o) {
  if (!o.hp) return 0
  return Math.min(100, (100 * o.qi) / o.hp)
}

// HP 条高度
function hpCellHeight(cell) {
  return Math.max(10, Math.round(winH / (2 * (cell.rowsH || 25))))
}

// 断开后回到登录
function backToLogin() {
  log('BTN', '点击 返回登录')
  net.close()
  resetAll()
  runtime.reLaunch({ url: '/pages/login/login' })
}

watch(
  () => state.connected,
  (v) => {
    // 连接断开时清掉弹窗
    if (!v) {
      state.dialog = null
      quickVisible.value = false
      stopAiTask()
    }
  }
)

watch(
  () => state.dialog,
  (next, previous) => {
    if (!next && previous && previous.type === 'setbt') loadQuickCommands()
  }
)

onShow(() => {
  log('GAME', '游戏页显示, stage =', state.stage, 'connected =', state.connected)
  refreshAiState()
  // 若已不在登录状态 (被重置), 回登录页
  if (state.stage !== 'loginok') {
    runtime.reLaunch({ url: '/pages/login/login' })
  }
})
</script>

<style>
.page {
  height: 100vh;
  position: relative;
  padding-top: var(--status-bar-height);
  display: flex;
  flex-direction: column;
  background: #000000;
  color: #dddddd;
  overflow: hidden;
}

/* ---- 聊天区 ---- */
.chat {
  height: 48rpx;
  flex: none;
  border-bottom: 1rpx solid rgba(150, 150, 150, 0.5);
  transition: height 0.2s;
}
.chat.expanded {
  height: 280rpx;
}
.chat-scroll {
  height: 100%;
}
.chat-line {
  padding: 2rpx 6rpx;
  font-size: 24rpx;
  white-space: normal;
  word-break: break-all;
}

/* ---- 标题栏 ---- */
.tbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8rpx 10rpx;
  border-bottom: 1rpx solid rgba(150, 150, 150, 0.5);
}
.here {
  font-size: 30rpx;
  font-weight: bold;
  color: #e0e0e0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
}
.tmenu {
  display: flex;
  flex: none;
}
.tm-btn {
  background: rgba(200, 200, 200, 0.1);
  border: 1rpx solid rgba(150, 150, 150, 0.3);
  border-radius: 4rpx;
  color: #dddddd;
  font-size: 20rpx;
  padding: 6rpx 16rpx;
  margin-left: 8rpx;
}

/* ---- 场景描述 ---- */
.long-wrap {
  flex: none;
  max-height: 40%;
  border-bottom: 1rpx solid rgba(150, 150, 150, 0.5);
  overflow-y: auto;
}
.long-line {
  padding: 4rpx 8rpx;
  font-size: 22rpx;
  color: #bbbbbb;
}
.long-more {
  height: 52rpx;
  color: #7fb2ff;
  font-size: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- 中部 ---- */
.mid {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
}
.mleft {
  width: 18%;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1rpx solid rgba(150, 150, 150, 0.5);
}
.obj-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.obj-scroll {
  height: 100%;
}
.acts-wrap {
  flex: none;
  max-height: 40%;
  min-height: 0;
  overflow: hidden;
  border-top: 1rpx solid rgba(150, 150, 150, 0.3);
}
.acts-scroll {
  height: 100%;
}
.obj-item {
  margin-top: 6rpx;
  padding: 0 4rpx;
}
.obj-bar {
  position: relative;
  height: 4rpx;
  background: #444444;
  margin: 2rpx 4rpx;
}
.obj-hp {
  position: absolute;
  left: 0;
  top: 0;
  height: 4rpx;
  background: #777777;
}
.obj-qi {
  position: absolute;
  left: 0;
  top: 0;
  height: 4rpx;
  background: #aa0000;
}
.obj-btn {
  background: rgba(200, 200, 200, 0.08);
  border: 1rpx solid rgba(150, 150, 150, 0.3);
  border-radius: 4rpx;
  color: #dddddd;
  font-size: 22rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6rpx;
  margin: 0 4rpx 6rpx;
}
.act-btn {
  background: rgba(200, 200, 200, 0.08);
  border: 1rpx solid rgba(150, 150, 150, 0.3);
  border-radius: 4rpx;
  color: #dddddd;
  font-size: 22rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6rpx;
  margin: 6rpx 4rpx;
}

.mright {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.content-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ai-panel {
  position: fixed;
  width: 86vw;
  max-width: 620px;
  height: 78vh;
  max-height: 720px;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  background: #171c21;
  border: 1rpx solid #71808c;
  box-shadow: 0 8rpx 30rpx rgba(0, 0, 0, 0.72);
  box-sizing: border-box;
}
.ai-render-bridge {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  opacity: 0.01;
  pointer-events: none;
  overflow: hidden;
}
.ai-panel-head {
  flex: none;
  height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10rpx;
  border-bottom: 1rpx solid #46515a;
  background: #232a30;
}
.ai-drag-handle {
  touch-action: none;
}
.ai-panel-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #eeeeee;
  font-size: 24rpx;
  font-weight: bold;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-close {
  min-width: 64rpx;
  height: 42rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dddddd;
  border: 1rpx solid #555555;
  font-size: 20rpx;
}
.ai-panel-tools {
  flex: none;
  height: 48rpx;
  display: flex;
  border-bottom: 1rpx solid #3b454d;
  background: #1d2328;
}
.ai-panel-tool {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1rpx solid #3b454d;
  color: #bcd3e5;
  font-size: 20rpx;
}
.ai-panel-tool:last-child {
  border-right: none;
}
.ai-task-drawer {
  flex: none;
  min-height: 124rpx;
  max-height: 382rpx;
  border-bottom: 1rpx solid #46515a;
  background: #11161a;
  box-sizing: border-box;
}
.ai-task-list-head {
  flex: none;
  height: 52rpx;
  padding: 0 10rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1rpx solid #303941;
  color: #aebcc7;
  font-size: 20rpx;
  box-sizing: border-box;
}
.ai-task-scroll {
  height: calc(100% - 52rpx);
}
.ai-task-new {
  padding: 7rpx 10rpx;
  border: 1rpx solid #3976a4;
  color: #b9d9ef;
  font-size: 18rpx;
}
.ai-task-empty {
  padding: 24rpx 10rpx;
  text-align: center;
  color: #78858e;
  font-size: 19rpx;
}
.ai-task-row {
  height: 66rpx;
  padding: 7rpx 8rpx 7rpx 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
  border-bottom: 1rpx solid #293139;
  box-sizing: border-box;
}
.ai-task-row.active {
  background: #183246;
}
.ai-task-marker {
  flex: none;
  width: 4rpx;
  height: 34rpx;
  background: transparent;
}
.ai-task-row.active .ai-task-marker {
  background: #69afe0;
}
.ai-task-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.ai-task-title {
  overflow: hidden;
  color: #e6edf2;
  font-size: 19rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-task-time {
  color: #7f8d97;
  font-size: 17rpx;
}
.ai-task-delete {
  flex: none;
  padding: 7rpx 8rpx;
  border: 1rpx solid transparent;
  color: #d98f8f;
  font-size: 18rpx;
}
.ai-task-delete:active {
  border-color: #764848;
}
.ai-task {
  width: 100%;
  box-sizing: border-box;
  height: 84rpx;
  padding: 8rpx;
  border: 1rpx solid #4b5862;
  background: #0e1215;
  color: #eeeeee;
  font-size: 22rpx;
  line-height: 1.4;
}
.ai-conversation {
  flex: 1;
  min-height: 0;
  padding: 10rpx;
  box-sizing: border-box;
  background: #0d1114;
}
.ai-empty {
  color: #777777;
  text-align: center;
  padding: 60rpx 0;
  font-size: 21rpx;
}
.ai-turn {
  margin-bottom: 12rpx;
  padding: 8rpx;
  border: 1rpx solid #333333;
  background: #181818;
}
.ai-turn.user {
  border-color: #315479;
  background: #17202a;
}
.ai-turn-heading {
  margin-bottom: 4rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
}
.ai-turn-role {
  flex: none;
  color: #8fb9e6;
  font-size: 19rpx;
}
.ai-token-estimate,
.ai-token-actual {
  color: #71818d;
  font-size: 16rpx;
  line-height: 1.25;
}
.ai-token-estimate {
  white-space: nowrap;
}
.ai-token-actual {
  min-width: 0;
  text-align: right;
}
.ai-block-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10rpx;
}
.ai-block-label-row .ai-flow-label {
  margin-bottom: 0;
}
.ai-turn-text {
  color: #eeeeee;
  font-size: 21rpx;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-composer {
  flex: none;
  padding: 8rpx 10rpx 10rpx;
  border-top: 1rpx solid #444444;
  background: #111111;
}
.ai-actions {
  display: flex;
  gap: 8rpx;
}
.ai-action {
  flex: 1;
  height: 50rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid #555555;
  color: #dddddd;
  font-size: 21rpx;
}
.ai-action.primary {
  background: #245da8;
  border-color: #3976c5;
  color: #ffffff;
}
.ai-action.danger {
  background: #7e2f2f;
  border-color: #a44a4a;
  color: #ffffff;
}
.ai-status {
  margin-top: 8rpx;
  color: #a9c7e8;
  font-size: 21rpx;
}
.ai-error {
  color: #ed8f8f;
}
.ai-context {
  color: #7f99ad;
}
.ai-flow {
  overflow: hidden;
  border: 1rpx solid #343b42;
  background: #14171a;
}
.ai-finished {
  overflow: hidden;
  border: 1rpx solid #365b4a;
  background: #151c18;
}
.ai-finished-summary {
  padding: 10rpx;
  color: #e8eee9;
  font-size: 21rpx;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-process-toggle {
  min-height: 46rpx;
  padding: 6rpx 8rpx 6rpx 10rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1rpx solid #34463d;
  color: #8eaa9b;
  font-size: 19rpx;
  box-sizing: border-box;
}
.ai-flow.with-summary {
  margin-top: 8rpx;
}
.ai-flow-item + .ai-flow-item {
  border-top: 1rpx solid #343b42;
}
.ai-flow-content,
.ai-tool-call,
.ai-tool-result {
  padding: 9rpx 10rpx;
}
.ai-collapsible-head {
  min-height: 48rpx;
  padding: 7rpx 8rpx 7rpx 10rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}
.ai-collapsible-head .ai-flow-label {
  margin-bottom: 0;
}
.ai-collapsible-content {
  display: block;
  padding: 5rpx 10rpx 10rpx;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-thinking-summary {
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: baseline;
  gap: 10rpx;
}
.ai-thinking-meta {
  min-width: 0;
  overflow: hidden;
  color: #73818c;
  font-size: 17rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-thinking-pager {
  height: 54rpx;
  padding: 6rpx 10rpx 9rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  border-top: 1rpx solid #30383f;
  box-sizing: border-box;
}
.ai-thinking-page-btn {
  min-width: 84rpx;
  height: 38rpx;
  padding: 0 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid #465867;
  color: #9db7cc;
  font-size: 18rpx;
  box-sizing: border-box;
}
.ai-thinking-page-btn.disabled {
  opacity: 0.35;
}
.ai-thinking-page-state {
  min-width: 78rpx;
  color: #8697a4;
  font-size: 18rpx;
  text-align: center;
}
.ai-expand-icon {
  flex: none;
  width: 34rpx;
  text-align: center;
  color: #9cb4ca;
  font-size: 24rpx;
}
.ai-flow-label {
  margin-bottom: 5rpx;
  color: #87a9c9;
  font-size: 18rpx;
  line-height: 1.2;
}
.ai-thinking,
.ai-answer,
.ai-tool-data {
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-thinking {
  background: #151a1e;
  color: #b7c1ca;
  font-size: 20rpx;
  line-height: 1.45;
}
.ai-answer {
  background: #181818;
  color: #eeeeee;
  font-size: 21rpx;
  line-height: 1.45;
}
.ai-tool {
  background: #17191b;
}
.ai-tool.error {
  background: #211718;
}
.ai-tool-call,
.ai-tool-result {
  display: flex;
  flex-direction: column;
}
.ai-tool-summary {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9rpx;
}
.ai-tool-result {
  border-top: 1rpx dashed #3d4348;
}
.ai-tool-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #d8e7f5;
  font-size: 20rpx;
  font-weight: bold;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-tool-state {
  flex: none;
  color: #91b28d;
  font-size: 18rpx;
}
.ai-tool-state.running {
  color: #d0b16f;
}
.ai-tool-state.error {
  color: #e49a9a;
}
.ai-tool-data,
.ai-tool-running {
  color: #aeb7bf;
  font-size: 19rpx;
  line-height: 1.4;
}
.ai-tool.error .ai-tool-result .ai-flow-label,
.ai-tool.error .ai-tool-data {
  color: #e49a9a;
}
.ai-tool-running {
  color: #d0b16f;
}
.out-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.out-scroll {
  height: 100%;
}
.out-line {
  padding: 3rpx 8rpx;
  font-size: 24rpx;
  line-height: 1.4;
}
.hr-line {
  height: 1rpx;
  margin: 8rpx 6rpx;
  background: #555555;
}

/* ---- 出口 ---- */
.exits {
  flex: none;
  height: 204rpx;
  border-top: 1rpx solid rgba(150, 150, 150, 0.5);
  padding: 4rpx;
  box-sizing: border-box;
  overflow: hidden;
}
.exits-grid {
  display: flex;
  flex-wrap: wrap;
  height: 100%;
}
.exits-cell {
  width: 33.33%;
  height: 33.33%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dir-btn {
  width: 92%;
  height: 48rpx;
  background: rgba(200, 200, 200, 0.08);
  border: 1rpx solid rgba(150, 150, 150, 0.35);
  border-radius: 4rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22rpx;
  color: #dddddd;
}
.dir-center {
  font-size: 24rpx;
  color: #aaaaaa;
  white-space: nowrap;
  max-width: 96%;
  overflow: hidden;
}

/* ---- HP 状态条 ---- */
.hps {
  flex: none;
  background: #333333;
  padding: 2rpx 0;
}
.hp-row {
  display: flex;
}
.hp-cell {
  background: #444444;
  border-right: 1rpx solid #333333;
}
.hp-cell.clickable:active {
  opacity: 0.72;
}
.hp-track {
  background: #999999;
  position: relative;
}
.hp-fill {
  height: 100%;
  position: relative;
  overflow: hidden;
}
.hp-label {
  position: absolute;
  left: 2rpx;
  top: 0;
  font-size: 16rpx;
  color: #ffffff;
  white-space: nowrap;
  line-height: 1;
}

/* ---- 底部菜单 ---- */
.menu {
  flex: none;
  display: flex;
  background: #1a1a1a;
  border-top: 1rpx solid #333333;
}
.menu-btn {
  flex: 1;
  height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #dddddd;
  font-size: 24rpx;
  border-right: 1rpx solid #333333;
}
.menu-btn:last-child {
  border-right: none;
}
.menu-btn:active {
  background: #333333;
}

/* ---- 自定按钮面板 ---- */
.mycmds {
  width: 100%;
  height: 100%;
  background: #141414;
  border-radius: 6rpx;
  display: flex;
  flex-wrap: wrap;
  padding: 6rpx;
  overflow: hidden;
  box-sizing: border-box;
}
.mycmds-btn {
  flex: 0 0 calc((100% - 72rpx) / 6);
  width: calc((100% - 72rpx) / 6);
  height: 80rpx;
  margin: 6rpx;
  background: rgba(200, 200, 200, 0.08);
  border: 1rpx solid rgba(150, 150, 150, 0.3);
  border-radius: 4rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  color: #dddddd;
  box-sizing: border-box;
  text-align: center;
}

/* ---- 可拖动自定快捷入口与窗口 ---- */
.quick-fab {
  position: fixed;
  z-index: 1060;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1rpx solid #6d7882;
  border-radius: 50%;
  background: rgba(38, 47, 54, 0.94);
  box-shadow: 0 4rpx 14rpx rgba(0, 0, 0, 0.58);
  color: #e5edf2;
  font-size: 18rpx;
  font-weight: bold;
  touch-action: none;
  user-select: none;
}
.quick-fab.dragging {
  opacity: 0.82;
  transform: scale(1.04);
}
.quick-panel {
  position: fixed;
  z-index: 1050;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  border: 1rpx solid #69757e;
  border-radius: 10rpx;
  background: #14191d;
  box-shadow: 0 8rpx 30rpx rgba(0, 0, 0, 0.7);
}
.quick-panel-head {
  flex: none;
  height: 58rpx;
  padding-left: 18rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
  border-bottom: 1rpx solid #46515a;
  background: #252c32;
  touch-action: none;
  user-select: none;
}
.quick-panel-title {
  color: #e5edf2;
  font-size: 23rpx;
  font-weight: bold;
}
.quick-panel-close {
  align-self: stretch;
  min-width: 82rpx;
  padding: 0 14rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 1rpx solid #46515a;
  color: #ccd5db;
  font-size: 20rpx;
  box-sizing: border-box;
}
.quick-panel-body {
  flex: 1;
  min-height: 0;
  height: 100%;
}
.quick-panel-grid {
  padding: 8rpx;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10rpx;
  box-sizing: border-box;
}
.quick-panel .mycmds-btn {
  width: auto;
  height: 72rpx;
  margin: 0;
  padding: 4rpx;
  font-size: 22rpx;
}

/* ---- 断开页面 ---- */
.lost {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.lost-title {
  font-size: 80rpx;
  font-weight: bold;
  color: #e8e8e8;
  letter-spacing: 6rpx;
}
.lost-t {
  margin-top: 30rpx;
  color: #888888;
  font-size: 28rpx;
}
.lost-btn {
  margin-top: 60rpx;
  width: 280rpx;
  height: 88rpx;
  background: #2a6bd4;
  border-radius: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 30rpx;
}

/* ---- 宣纸亮色模式 ---- */
.page.light { background: #e8dfc8; color: #2d342f; }
.page.light .chat { background: #ded5bd; border-bottom-color: #9d947d; }
.page.light .chat-line { color: #343b35; }
.page.light .tbar { background: #d4cab2; border-bottom-color: #968b73; }
.page.light .here { color: #27312b; }
.page.light .tm-btn,
.page.light .obj-btn,
.page.light .act-btn,
.page.light .dir-btn,
.page.light .mycmds-btn { background: rgba(70, 82, 73, 0.08); border-color: rgba(74, 80, 71, 0.34); color: #303832; }
.page.light .long-wrap,
.page.light .mleft,
.page.light .exits { border-color: rgba(93, 89, 76, 0.46); }
.page.light .long-line,
.page.light .dir-center { color: #4b554e; }
.page.light .long-more { color: #316e73; }
.page.light .obj-bar { background: #aaa38f; }
.page.light .obj-hp { background: #777b70; }
.page.light .out-line { color: #2f3630; }
.page.light .hr-line { background: #9c927b; }
.page.light .hps { background: #9b927e; }
.page.light .hp-cell { background: #bbb19a; border-right-color: #918873; }
.page.light .hp-track { background: #c7bea8; }
.page.light .menu { background: #d0c5ac; border-top-color: #918772; }
.page.light .menu-btn { color: #303730; border-right-color: #9f957f; }
.page.light .menu-btn:active { background: #bdb39d; }
.page.light .mycmds { background: #ded5bd; }
.page.light .quick-fab { background: rgba(64, 91, 88, 0.95); border-color: #75918a; color: #ffffff; box-shadow: 0 5rpx 18rpx rgba(61, 52, 39, 0.3); }
.page.light .quick-panel { background: #eee5cf; border-color: #847b69; box-shadow: 0 8rpx 30rpx rgba(61, 52, 39, 0.3); }
.page.light .quick-panel-head { background: #d2c7af; border-bottom-color: #958b75; }
.page.light .quick-panel-title,
.page.light .quick-panel-close { color: #2d352f; }
.page.light .quick-panel-close { border-left-color: #958b75; }
.page.light .ai-panel { background: #eee5cf; border-color: #847b69; box-shadow: 0 8rpx 30rpx rgba(61, 52, 39, 0.28); }
.page.light .ai-panel-head { background: #d2c7af; border-bottom-color: #958b75; }
.page.light .ai-panel-title,
.page.light .ai-close,
.page.light .ai-task-title,
.page.light .ai-turn-text,
.page.light .ai-action,
.page.light .ai-answer { color: #2d352f; }
.page.light .ai-close,
.page.light .ai-action { border-color: #918875; }
.page.light .ai-action.primary { background: #3f706b; border-color: #527f77; color: #ffffff; }
.page.light .ai-panel-tools { background: #ddd3ba; border-bottom-color: #a09780; }
.page.light .ai-panel-tool { color: #315f60; border-right-color: #a09780; }
.page.light .ai-task-drawer,
.page.light .ai-conversation,
.page.light .ai-composer { background: #e6dcc4; border-color: #9d937c; }
.page.light .ai-task-list-head,
.page.light .ai-task-row { border-color: #b4aa92; color: #4d5851; }
.page.light .ai-task-row.active { background: #c9d4c7; }
.page.light .ai-task-row.active .ai-task-marker { background: #3f7774; }
.page.light .ai-task-time,
.page.light .ai-empty,
.page.light .ai-context { color: #667168; }
.page.light .ai-token-estimate,
.page.light .ai-token-actual { color: #69766e; }
.page.light .ai-task-new,
.page.light .ai-turn-role,
.page.light .ai-status,
.page.light .ai-flow-label,
.page.light .ai-expand-icon { color: #356b70; border-color: #4e7e7d; }
.page.light .ai-task { background: #fff8e7; border-color: #918875; color: #29312b; }
.page.light .ai-turn,
.page.light .ai-answer { background: #f4ecd8; border-color: #aaa087; }
.page.light .ai-turn.user { background: #dce5d9; border-color: #718c7b; }
.page.light .ai-flow { background: #e4dac2; border-color: #a59b84; }
.page.light .ai-finished { background: #e4e7d8; border-color: #718978; }
.page.light .ai-finished-summary { color: #2e3831; }
.page.light .ai-process-toggle { color: #42685a; border-top-color: #9eac9c; }
.page.light .ai-flow-item + .ai-flow-item,
.page.light .ai-tool-result { border-color: #aea48e; }
.page.light .ai-thinking,
.page.light .ai-tool { background: #ddd5c0; color: #4c564f; }
.page.light .ai-thinking-meta,
.page.light .ai-thinking-page-state { color: #69766e; }
.page.light .ai-thinking-pager { border-top-color: #aea48e; }
.page.light .ai-thinking-page-btn { color: #356b70; border-color: #78918c; }
.page.light .ai-tool.error { background: #ecd7ce; }
.page.light .ai-tool-name { color: #2d4f55; }
.page.light .ai-tool-data,
.page.light .ai-tool-running { color: #4c564f; }
.page.light .lost-title { color: #2e3731; }
.page.light .lost-t { color: #5e6961; }
.page.light .lost-btn { background: #3f706b; }
</style>

<script module="aiRender" lang="renderjs">
export default {
  mounted() {
    this.$ownerInstance.callMethod('onAiRenderBridgeReady')
  },
  methods: {
    async onRequest(payload, oldPayload, ownerInstance) {
      if (!payload || payload === oldPayload) return
      const request = JSON.parse(payload)
      try {
        ownerInstance.callMethod('onAiRenderEvent', {
          id: request.id,
          phase: 'started'
        })
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body || undefined
        })
        ownerInstance.callMethod('onAiRenderEvent', {
          id: request.id,
          phase: 'headers',
          status: response.status,
          statusText: response.statusText
        })
        const body = await response.text()
        ownerInstance.callMethod('onAiRenderEvent', {
          id: request.id,
          status: response.status,
          statusText: response.statusText,
          body
        })
      } catch (error) {
        ownerInstance.callMethod('onAiRenderEvent', {
          id: request.id,
          error: error && error.message ? error.message : String(error)
        })
      }
    }
  }
}
</script>
