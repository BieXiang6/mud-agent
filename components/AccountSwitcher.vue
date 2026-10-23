<template>
  <view v-if="visible" class="session-mask" @tap.self="$emit('close')">
    <view class="session-panel">
      <view class="session-head">
        <text>已登录账号（{{ gameSessions.length }}/5）</text>
        <text class="session-action" @tap="$emit('close')">关闭</text>
      </view>
      <text class="session-hint">切换账号保持其他账号连接；长按“快捷”可再次打开</text>
      <scroll-view scroll-y class="session-list">
        <view v-for="session in gameSessions" :key="session.id" class="session-row" :class="{ selected: session.active }" @tap="choose(session)">
          <view class="session-info">
            <text class="session-name">{{ session.account }}{{ session.active ? ' · 当前' : '' }}</text>
            <text class="session-server">{{ session.host }}:{{ session.port }} · {{ session.status }}</text>
            <text v-if="aiAccountStates.has(session.id)" class="session-server">智能体：{{ aiAccountStates.get(session.id).busy ? '运行中' : aiAccountStates.get(session.id).status }}</text>
          </view>
          <text class="session-disconnect" @tap.stop="disconnect(session)">{{ session.connected ? '断开' : '移除' }}</text>
        </view>
        <text v-if="!gameSessions.length" class="session-hint">暂无已登录账号</text>
      </scroll-view>
      <view class="session-add" :class="{ disabled: onlineCount >= 5 }" @tap="addAccount">登录其他账号</view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { gameSessions, closeGameSession, showAccountLogin, switchGameSession } from '@/utils/gameSessions.js'
import { runtime } from '@/utils/platform/index.js'
import { aiAccountStates } from '@/utils/ai/controller.js'

defineProps({ visible: Boolean })
const emit = defineEmits(['close', 'switched', 'add'])
const onlineCount = computed(() => gameSessions.value.filter(session => session.connected).length)
function report(error) { runtime.showToast({ title: error.message, icon: 'none' }) }
function choose(session) {
  try { switchGameSession(session.id); emit('switched') } catch (error) { report(error) }
}
function addAccount() {
  try { showAccountLogin(); emit('add') } catch (error) { report(error) }
}
function disconnect(session) {
  runtime.showModal({
    title: '断开账号', content: '确定断开“' + session.account + '”吗？其他账号继续保持连接。',
    success({ confirm }) {
      if (!confirm) return
      closeGameSession(session.id)
      if (session.active) {
        const next = gameSessions.value.find(item => item.connected && item.loggedIn)
        if (next) choose(next)
        else addAccount()
      }
    }
  })
}
</script>

<style scoped>
.session-mask { position: fixed; inset: 0; z-index: 25000; display: flex; align-items: center; justify-content: center; padding: 28rpx; background: var(--app-overlay, rgba(0,0,0,.65)); }
.session-panel { width: 640rpx; max-width: 100%; padding: 24rpx; border: 1rpx solid var(--app-border, #465049); border-radius: 12rpx; background: var(--app-surface, #151917); color: var(--app-text, #edf1f4); box-sizing: border-box; }
.session-head { display: flex; justify-content: space-between; align-items: center; font-size: 28rpx; font-weight: bold; }
.session-action { padding: 12rpx; font-size: 23rpx; color: var(--app-primary, #a7c6b4); }
.session-hint { display: block; margin: 12rpx 0; color: var(--app-text-muted, #84938b); font-size: 22rpx; }
.session-list { max-height: 50vh; height: 440rpx; }
.session-row { display: flex; align-items: center; padding: 20rpx 12rpx; border-bottom: 1rpx solid var(--app-border, #465049); }
.session-row.selected { background: var(--app-primary-soft, #253a30); }
.session-info { flex: 1; min-width: 0; }
.session-name { display: block; font-size: 27rpx; overflow-wrap: anywhere; }
.session-server { display: block; margin-top: 6rpx; font-size: 20rpx; color: var(--app-text-muted, #84938b); overflow-wrap: anywhere; }
.session-disconnect { flex: none; padding: 16rpx 10rpx; font-size: 23rpx; color: var(--app-danger, #cd8279); }
.session-add { margin-top: 20rpx; padding: 20rpx; text-align: center; font-size: 26rpx; border: 1rpx solid var(--app-border, #465049); color: var(--app-primary, #a7c6b4); }
.session-add.disabled { opacity: .5; }
</style>
