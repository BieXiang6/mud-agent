<template>
  <view class="page" :class="{ light: gameState.themeMode === 'light' }" :style="appStyle">
    <view class="topbar">
      <view class="back" hover-class="hp" @tap="goBack">‹</view>
      <text class="title">模型设置</text>
      <view class="add" hover-class="hp" @tap="newProfile">新增</view>
    </view>

    <scroll-view scroll-y class="body">
      <view class="guide-link" hover-class="hp" @tap="openGuide">
        <view>
          <text class="guide-title">第一次配置 DeepSeek？</text>
          <text class="guide-desc">查看 API Key 获取、模型配置和使用教程</text>
        </view>
        <text class="guide-arrow">›</text>
      </view>

      <view class="section-title">模型列表</view>
      <view class="profiles">
        <view
          v-for="profile in state.profiles"
          :key="profile.id"
          class="profile-row"
          :class="{ selected: profile.id === state.selectedId }"
          hover-class="hp"
          @tap="chooseProfile(profile)"
        >
          <view class="selector"><view v-if="profile.id === state.selectedId" class="selector-dot" /></view>
          <view class="profile-info">
            <text class="profile-name">{{ profile.name }}</text>
            <text class="profile-meta">{{ profile.model }} · {{ profile.contextWindow }} tokens</text>
          </view>
          <view class="edit" @tap.stop="editProfile(profile)">编辑</view>
        </view>
      </view>

      <view class="section-title">{{ state.isNew ? '新增模型' : '编辑模型' }}</view>
      <view class="form">
        <text class="label required">配置名称</text>
        <input v-model="state.draft.name" class="input" maxlength="40" placeholder="例如：DeepSeek 主模型" />

        <text class="label required">API Key</text>
        <input v-model="state.draft.apiKey" class="input" password placeholder="API Key" />

        <text class="label required">Base URL</text>
        <input v-model="state.draft.baseUrl" class="input" placeholder="https://api.deepseek.com" />

        <text class="label required">协议</text>
        <picker :range="protocolOptions" range-key="label" @change="changeProtocol">
          <view class="picker">{{ protocolLabel }}</view>
        </picker>

        <text class="label required">模型 ID</text>
        <input v-model="state.draft.model" class="input" placeholder="deepseek-v4-flash" />

        <view class="field-grid">
          <view class="field">
            <text class="label required">上下文窗口</text>
            <input v-model="state.draft.contextWindow" class="input" type="number" placeholder="1000000" />
          </view>
          <view class="field">
            <text class="label required">最大输出</text>
            <input v-model="state.draft.maxTokens" class="input" type="number" placeholder="384000" />
          </view>
        </view>

        <view class="field-grid">
          <view class="field">
            <text class="label required">压缩阈值（%）</text>
            <input v-model="state.draft.compressionThreshold" class="input" type="number" placeholder="80" />
          </view>
          <view class="field">
            <text class="label required">保留最近轮数</text>
            <input v-model="state.draft.keepRecentTurns" class="input" type="number" placeholder="3" />
          </view>
        </view>

        <text class="label">指令黑名单（所有模型共用）</text>
        <input v-model="state.commandBlacklist" class="input" placeholder="quit,drop" />

        <view v-if="state.error" class="error">{{ state.error }}</view>
        <view class="actions">
          <view class="button primary" hover-class="hp" @tap="saveDraft">保存并选用</view>
          <view v-if="!state.isNew" class="button danger" hover-class="hp" @tap="removeDraft">删除</view>
        </view>
      </view>
      <view class="bottom-space" />
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { onShow } from '@/utils/platform/lifecycle.js'
import { state as gameState } from '@/utils/store.js'
import { runtime } from '@/utils/platform/index.js'
import { appStyle } from '@/utils/appearance.js'
import {
  createModelProfile,
  deleteModelProfile,
  loadModelConfig,
  saveCommandBlacklist,
  saveModelProfile,
  selectModelProfile
} from '@/utils/ai/modelProfiles.js'

const protocolOptions = [
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'openai-completions', label: 'OpenAI Chat Completions' }
]
const state = reactive({ profiles: [], selectedId: '', commandBlacklist: '', draft: createModelProfile(), isNew: true, error: '' })
const protocolLabel = computed(() => (protocolOptions.find((item) => item.value === state.draft.protocol) || protocolOptions[0]).label)

function refresh(preferredId = '') {
  const config = loadModelConfig()
  state.profiles = config.profiles
  state.selectedId = config.selectedId
  state.commandBlacklist = config.commandBlacklist
  const profile = config.profiles.find((item) => item.id === preferredId) || config.profiles.find((item) => item.id === config.selectedId) || config.profiles[0]
  state.draft = { ...profile }
  state.isNew = false
  state.error = ''
}

function chooseProfile(profile) {
  selectModelProfile(profile.id)
  refresh(profile.id)
}

function editProfile(profile) {
  state.draft = { ...profile }
  state.isNew = false
  state.error = ''
}

function newProfile() {
  state.draft = createModelProfile({ name: '新模型' })
  state.isNew = true
  state.error = ''
}

function changeProtocol(event) {
  const option = protocolOptions[Number(event && event.detail && event.detail.value)]
  if (option) state.draft.protocol = option.value
}

function saveDraft() {
  try {
    const saved = saveModelProfile(state.draft, true)
    saveCommandBlacklist(state.commandBlacklist)
    refresh(saved.id)
    runtime.showToast({ title: '已保存', icon: 'success' })
  } catch (error) {
    state.error = error && error.message ? error.message : String(error)
  }
}

function removeDraft() {
  runtime.showModal({
    title: '删除模型',
    content: '确认删除“' + state.draft.name + '”？',
    success: ({ confirm }) => {
      if (!confirm) return
      try { deleteModelProfile(state.draft.id); refresh() } catch (error) { state.error = error.message }
    }
  })
}

function openGuide() { runtime.navigateTo({ url: '/pages/ai-guide/ai-guide' }) }
function goBack() { runtime.navigateBack() }
onShow(() => refresh(state.draft && state.draft.id))
</script>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; background: #0c0f12; color: #edf1f4; }
.topbar { flex: none; height: calc(68rpx + var(--status-bar-height)); padding: var(--status-bar-height) 18rpx 0; display: flex; align-items: center; box-sizing: border-box; border-bottom: 1rpx solid #303840; background: #151a1f; }
.back { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; font-size: 48rpx; }
.title { flex: 1; font-size: 28rpx; font-weight: bold; }
.add { padding: 12rpx 16rpx; border: 1rpx solid #3f78aa; color: #b9daf5; font-size: 21rpx; }
.body { flex: 1; min-height: 0; padding: 18rpx; box-sizing: border-box; }
.guide-link { min-height: 82rpx; padding: 12rpx 14rpx; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; border: 1rpx solid #3f78aa; background: #142532; }
.guide-title, .guide-desc { display: block; }
.guide-title { color: #d9ebfa; font-size: 22rpx; }
.guide-desc { margin-top: 4rpx; color: #8eaec5; font-size: 18rpx; }
.guide-arrow { color: #9ecdf0; font-size: 42rpx; }
.section-title { margin: 12rpx 0 10rpx; color: #91a8ba; font-size: 20rpx; }
.profiles { border: 1rpx solid #303840; background: #12171b; }
.profile-row { min-height: 72rpx; padding: 10rpx 12rpx; display: flex; align-items: center; border-bottom: 1rpx solid #293038; }
.profile-row:last-child { border-bottom: none; }
.profile-row.selected { background: #182b39; }
.selector { width: 28rpx; height: 28rpx; margin-right: 12rpx; display: flex; align-items: center; justify-content: center; border: 1rpx solid #6387a4; border-radius: 50%; }
.selector-dot { width: 14rpx; height: 14rpx; border-radius: 50%; background: #79b7e5; }
.profile-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.profile-name { font-size: 22rpx; color: #edf1f4; }
.profile-meta { overflow: hidden; color: #84939f; font-size: 18rpx; text-overflow: ellipsis; white-space: nowrap; }
.edit { padding: 8rpx 12rpx; color: #a9c7e8; font-size: 19rpx; }
.form { padding: 14rpx; border: 1rpx solid #303840; background: #12171b; }
.label { display: block; margin: 10rpx 0 5rpx; color: #aebac4; font-size: 19rpx; }
.label.required::after { content: ' *'; color: #ef9999; }
.input, .picker { width: 100%; height: 58rpx; padding: 0 10rpx; box-sizing: border-box; border: 1rpx solid #3b454e; background: #0d1114; color: #f2f4f6; font-size: 21rpx; }
.picker { display: flex; align-items: center; }
.field-grid { display: flex; gap: 10rpx; }
.field { flex: 1; min-width: 0; }
.error { margin-top: 10rpx; color: #ef9999; font-size: 19rpx; }
.actions { margin-top: 16rpx; display: flex; gap: 10rpx; }
.button { flex: 1; height: 58rpx; display: flex; align-items: center; justify-content: center; border: 1rpx solid #46515a; font-size: 21rpx; }
.button.primary { background: #24699e; border-color: #3d83b8; color: white; }
.button.danger { flex: none; width: 120rpx; border-color: #874747; color: #edaaaa; }
.bottom-space { height: 40rpx; }
.page.light { background: #e8dfc8; color: #2e352f; }
.page.light .topbar { background: #d5cab1; border-bottom-color: #948a74; }
.page.light .section-title { color: #56665e; }
.page.light .guide-link { background: #dce6dc; border-color: #58827d; }
.page.light .guide-title { color: #294e4c; }
.page.light .guide-desc { color: #5b7067; }
.page.light .guide-arrow { color: #356b70; }
.page.light .profiles,
.page.light .form { background: #f1e8d2; border-color: #9f957e; }
.page.light .profile-row { border-bottom-color: #bbb098; }
.page.light .profile-row.selected { background: #cfdbcf; }
.page.light .selector { border-color: #637e70; }
.page.light .selector-dot { background: #3f756e; }
.page.light .profile-name { color: #2e352f; }
.page.light .profile-meta { color: #687269; }
.page.light .edit,
.page.light .add { color: #356b70; border-color: #58827d; }
.page.light .label { color: #4e5951; }
.page.light .input,
.page.light .picker { background: #fff8e7; border-color: #9e947d; color: #29312b; }
.page.light .button { border-color: #938974; color: #303832; }
.page.light .button.primary { background: #3f706b; border-color: #527f77; color: #ffffff; }
.page.light .button.danger { border-color: #9b5750; color: #963d38; }
</style>
