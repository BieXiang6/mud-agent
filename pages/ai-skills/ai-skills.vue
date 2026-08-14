<template>
  <view class="page" :class="{ light: gameState.themeMode === 'light' }" :style="appStyle">
    <view class="topbar">
      <view class="back" hover-class="hp" @tap="goBack">‹</view>
      <text class="title">Skills</text>
      <text class="count">{{ state.skills.length }}</text>
    </view>
    <scroll-view scroll-y class="body">
      <text class="section-title">自定义 Skills</text>
      <view v-if="!state.skills.length" class="empty">尚未导入自定义 Skill</view>
      <view v-for="skill in state.skills" :key="skill.name" class="skill-row">
        <switch class="skill-switch" :checked="skill.enabled" :color="appStyle['--app-primary']" @change="toggleSkill(skill.name, $event)" />
        <view class="skill-info">
          <text class="skill-name">{{ skill.name }}</text>
          <text class="skill-description">{{ skill.description }}</text>
        </view>
        <view class="delete" hover-class="hp" @tap="removeSkill(skill.name)">删除</view>
      </view>

      <view class="import-section">
        <text class="section-title">导入自定义 Skill</text>
        <textarea v-model="state.source" class="source" maxlength="22000" placeholder="粘贴标准 SKILL.md 或 Skill JSON" />
        <view v-if="state.error" class="error">{{ state.error }}</view>
        <view class="import-button" hover-class="hp" @tap="importSkill">导入</view>
      </view>
      <view class="bottom-space" />
    </scroll-view>
  </view>
</template>

<script setup>
import { reactive } from 'vue'
import { onShow } from '@/utils/platform/lifecycle.js'
import { state as gameState } from '@/utils/store.js'
import { runtime } from '@/utils/platform/index.js'
import { appStyle } from '@/utils/appearance.js'
import { getCustomAiSkills, importCustomAiSkill, loadCustomAiSkills, removeCustomAiSkill, setCustomAiSkillEnabled } from '@/utils/ai/skills.js'

const state = reactive({ skills: [], source: '', error: '' })
function refresh() {
  const loaded = loadCustomAiSkills()
  state.skills = getCustomAiSkills().map(({ name, description, disableModelInvocation }) => ({ name, description, enabled: !disableModelInvocation }))
  state.error = loaded.diagnostics.join('；')
}
function importSkill() {
  state.error = ''
  try {
    importCustomAiSkill(state.source)
    state.source = ''
    refresh()
    runtime.showToast({ title: '已导入', icon: 'success' })
  } catch (error) { state.error = error && error.message ? error.message : String(error) }
}
function removeSkill(name) {
  runtime.showModal({ title: '删除 Skill', content: '确认删除“' + name + '”？', success: ({ confirm }) => { if (confirm) { removeCustomAiSkill(name); refresh() } } })
}
function toggleSkill(name, event) {
  try { setCustomAiSkillEnabled(name, Boolean(event && event.detail && event.detail.value)); refresh() } catch (error) { state.error = error.message }
}
function goBack() { runtime.navigateBack() }
onShow(refresh)
</script>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; background: #0c0f12; color: #edf1f4; }
.topbar { flex: none; height: calc(68rpx + var(--status-bar-height)); padding: var(--status-bar-height) 18rpx 0; display: flex; align-items: center; box-sizing: border-box; border-bottom: 1rpx solid #303840; background: #151a1f; }
.back { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; font-size: 48rpx; }
.title { flex: 1; font-size: 28rpx; font-weight: bold; }
.count { min-width: 42rpx; text-align: center; color: #9fc7e6; font-size: 20rpx; }
.body { flex: 1; min-height: 0; padding: 18rpx; box-sizing: border-box; }
.empty { padding: 50rpx 0; text-align: center; color: #74818b; font-size: 21rpx; }
.skill-row { min-height: 78rpx; margin-bottom: 8rpx; padding: 10rpx 12rpx; display: flex; align-items: center; gap: 12rpx; border: 1rpx solid #303840; background: #12171b; }
.skill-switch { flex: none; transform: scale(0.72); transform-origin: center; }
.skill-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.skill-name { color: #edf1f4; font-size: 21rpx; }
.skill-description { color: #8f9ca6; font-size: 18rpx; line-height: 1.35; }
.delete { flex: none; padding: 9rpx 12rpx; border: 1rpx solid #824646; color: #eaa4a4; font-size: 18rpx; }
.import-section { margin-top: 20rpx; padding-top: 16rpx; border-top: 1rpx solid #303840; }
.section-title { display: block; margin-bottom: 10rpx; color: #a9c7e8; font-size: 21rpx; }
.source { width: 100%; height: 300rpx; padding: 12rpx; box-sizing: border-box; border: 1rpx solid #3b454e; background: #0d1114; color: #edf1f4; font-size: 20rpx; line-height: 1.45; }
.error { margin-top: 8rpx; color: #ef9999; font-size: 19rpx; }
.import-button { height: 58rpx; margin-top: 12rpx; display: flex; align-items: center; justify-content: center; border: 1rpx solid #3d83b8; background: #24699e; color: white; font-size: 21rpx; }
.bottom-space { height: 40rpx; }
.page.light { background: #e8dfc8; color: #2e352f; }
.page.light .topbar { background: #d5cab1; border-bottom-color: #948a74; }
.page.light .count,
.page.light .section-title { color: #356b70; }
.page.light .empty,
.page.light .skill-description { color: #687269; }
.page.light .skill-row { background: #f1e8d2; border-color: #a29881; }
.page.light .skill-name { color: #2e352f; }
.page.light .delete { border-color: #9b5750; color: #963d38; }
.page.light .import-section { border-top-color: #a29881; }
.page.light .source { background: #fff8e7; border-color: #9e947d; color: #29312b; }
.page.light .import-button { background: #3f706b; border-color: #527f77; color: #ffffff; }
</style>
