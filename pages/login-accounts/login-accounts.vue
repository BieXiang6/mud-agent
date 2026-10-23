<template>
  <view class="page" :class="{ light: state.themeMode === 'light' }" :style="appStyle">
    <view class="nav">
      <view class="back" hover-class="pressed" @tap="goBack">‹</view>
      <text class="nav-title">切换账号</text>
      <view class="nav-space" />
    </view>

    <scroll-view scroll-y class="account-scroll">
      <view class="content">
        <view class="heading">
          <text class="title">常用名帖</text>
          <text class="subtitle">选择一个账号，返回登录页继续连接</text>
        </view>

        <view v-if="profiles.length" class="account-list">
          <view
            v-for="profile in profiles"
            :key="profile.id"
            class="account-card"
            :class="{ active: profile.id === activeProfileId }"
            hover-class="card-pressed"
            @tap="selectProfile(profile)"
          >
            <view class="account-main">
              <view class="account-line">
                <text class="account-name">{{ profile.account }}</text>
                <text v-if="profile.id === activeProfileId" class="current">当前</text>
              </view>
              <text class="server">{{ profile.host }}:{{ profile.port }}</text>
              <text class="captcha">区服暗号 {{ profile.captcha }}</text>
              <text class="profile-encoding">字符编码 {{ profile.encoding === 'utf-8' ? 'UTF-8' : 'GBK' }}</text>
            </view>
            <view class="actions">
              <text class="choose">选择</text>
              <text class="remove" hover-class="remove-pressed" @tap.stop="confirmRemove(profile)">删除</text>
            </view>
          </view>
        </view>

        <view v-else class="empty">
          <text class="empty-mark">名帖</text>
          <text class="empty-title">还没有保存的账号</text>
          <text class="empty-copy">在登录页成功进入游戏后，账号会自动保存到这里。</text>
          <view class="empty-back" hover-class="pressed" @tap="goBack">返回登录</view>
        </view>

        <view class="security">
          <text class="security-title">本机存储提示</text>
          <text class="security-copy">登录信息仅保存在当前设备，密码不会在列表中显示。共享设备使用后，请删除对应名帖。</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@/utils/platform/lifecycle.js'
import { state } from '@/utils/store.js'
import { runtime } from '@/utils/platform/index.js'
import { appStyle } from '@/utils/appearance.js'
import {
  ACTIVE_LOGIN_PROFILE_KEY,
  LOGIN_PROFILES_KEY,
  findSelectedProfile,
  normalizeProfiles,
  removeProfile
} from '@/utils/loginProfiles.js'

const profiles = ref([])
const activeProfileId = ref('')

function loadProfiles() {
  profiles.value = normalizeProfiles(runtime.getStorageSync(LOGIN_PROFILES_KEY))
  const storedId = runtime.getStorageSync(ACTIVE_LOGIN_PROFILE_KEY)
  const selected = findSelectedProfile(profiles.value, storedId)
  activeProfileId.value = selected ? selected.id : ''
}

function persistProfiles() {
  runtime.setStorageSync(LOGIN_PROFILES_KEY, profiles.value.map((profile) => ({ ...profile })))
  if (activeProfileId.value) runtime.setStorageSync(ACTIVE_LOGIN_PROFILE_KEY, activeProfileId.value)
  else runtime.removeStorageSync(ACTIVE_LOGIN_PROFILE_KEY)
}

function persistLegacySelection(profile) {
  if (!profile) {
    runtime.removeStorageSync('mud_id')
    runtime.removeStorageSync('mud_pass')
    runtime.removeStorageSync('mud_auto')
    return
  }
  runtime.setStorageSync('mud_host', profile.host)
  runtime.setStorageSync('mud_port', profile.port)
  runtime.setStorageSync('mud_id', profile.account)
  runtime.setStorageSync('mud_pass', profile.password)
  runtime.setStorageSync('mud_key', profile.captcha)
  runtime.setStorageSync('mud_encoding', profile.encoding === 'utf-8' ? 'utf-8' : 'gbk')
}

function selectProfile(profile) {
  activeProfileId.value = profile.id
  persistProfiles()
  persistLegacySelection(profile)
  goBack()
}

function confirmRemove(profile) {
  runtime.showModal({
    title: '删除登录信息',
    content: `确定删除账号“${profile.account}”在本机保存的登录信息吗？`,
    confirmText: '删除',
    confirmColor: '#9c3b31',
    success(result) {
      if (!result.confirm) return
      const wasActive = activeProfileId.value === profile.id
      profiles.value = removeProfile(profiles.value, profile.id)
      if (wasActive) activeProfileId.value = profiles.value[0] ? profiles.value[0].id : ''
      persistProfiles()
      if (wasActive) persistLegacySelection(profiles.value[0] || null)
    }
  })
}

function goBack() {
  runtime.navigateBack()
}

onLoad(loadProfiles)
</script>

<style scoped>
.page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  background: #0b0d0c;
  color: #e5e8e4;
}
.nav {
  flex: none;
  height: calc(var(--status-bar-height) + 94rpx);
  padding: var(--status-bar-height) 24rpx 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #151917;
  border-bottom: 1rpx solid #3d4641;
}
.back, .nav-space { width: 72rpx; height: 72rpx; }
.back { color: #cfd5d0; font-size: 60rpx; line-height: 64rpx; text-align: center; }
.nav-title { font-family: STKaiti, KaiTi, serif; font-size: 31rpx; font-weight: bold; }
.pressed { opacity: 0.62; }
.account-scroll { flex: 1; height: 0; min-height: 0; }
.content { padding: 34rpx 28rpx 48rpx; padding-bottom: calc(48rpx + env(safe-area-inset-bottom)); }
.heading { margin-bottom: 26rpx; }
.title { display: block; font-family: STKaiti, KaiTi, serif; font-size: 38rpx; font-weight: bold; }
.subtitle { display: block; margin-top: 8rpx; color: #7f8b84; font-size: 22rpx; }
.account-list { display: flex; flex-direction: column; gap: 18rpx; }
.account-card {
  min-height: 132rpx;
  padding: 20rpx 18rpx 20rpx 24rpx;
  display: flex;
  align-items: center;
  border: 1rpx solid #465049;
  border-left: 5rpx solid #465049;
  border-radius: 7rpx;
  background: #151917;
  box-sizing: border-box;
}
.account-card.active { border-color: #9c3b31; border-left-color: #c35b50; background: #251a18; }
.card-pressed { opacity: 0.78; }
.account-main { min-width: 0; flex: 1; }
.account-line { display: flex; align-items: center; }
.account-name { max-width: 380rpx; overflow: hidden; color: #edf0ed; font-size: 29rpx; font-weight: bold; text-overflow: ellipsis; white-space: nowrap; }
.current { margin-left: 12rpx; padding: 3rpx 9rpx; border: 1rpx solid #a84a40; color: #d77a70; font-size: 18rpx; }
.server, .captcha, .profile-encoding { display: block; margin-top: 8rpx; color: #7f8b84; font-size: 20rpx; }
.captcha { margin-top: 4rpx; color: #66736c; }
.profile-encoding { margin-top: 4rpx; color: #b06a61; }
.actions { flex: none; margin-left: 18rpx; display: flex; align-items: center; }
.choose, .remove { padding: 16rpx 12rpx; font-size: 22rpx; }
.choose { color: #a7c6b4; }
.remove { color: #a86a63; }
.remove-pressed { color: #ee8d81; }
.empty { padding: 80rpx 34rpx; display: flex; flex-direction: column; align-items: center; border: 1rpx dashed #465049; }
.empty-mark { width: 92rpx; height: 92rpx; border: 2rpx solid #7b4039; color: #b75b50; font-family: STKaiti, KaiTi, serif; font-size: 28rpx; line-height: 88rpx; text-align: center; transform: rotate(-3deg); }
.empty-title { margin-top: 28rpx; font-size: 28rpx; }
.empty-copy { margin-top: 12rpx; color: #7f8b84; font-size: 22rpx; line-height: 1.6; text-align: center; }
.empty-back { margin-top: 30rpx; padding: 16rpx 42rpx; border: 1rpx solid #668372; color: #b4d0c0; font-size: 23rpx; }
.security { margin-top: 30rpx; padding: 20rpx; border-left: 4rpx solid #8a673e; background: #1d1b17; }
.security-title, .security-copy { display: block; }
.security-title { color: #c7a77e; font-size: 22rpx; font-weight: bold; }
.security-copy { margin-top: 8rpx; color: #8f8575; font-size: 20rpx; line-height: 1.65; }
.page.light { background: #e8dfc8; color: #2d3630; }
.page.light .nav { background: #f3ead4; border-bottom-color: #aaa087; }
.page.light .back { color: #465149; }
.page.light .subtitle { color: #716b5c; }
.page.light .account-card { background: #f7efdc; border-color: #aaa087; }
.page.light .account-card.active { background: #f1d6cc; border-color: #9c3b31; }
.page.light .account-name { color: #29322c; }
.page.light .server { color: #625f54; }
.page.light .captcha { color: #807867; }
.page.light .profile-encoding { color: #914b43; }
.page.light .choose { color: #376b58; }
.page.light .remove { color: #9b4d44; }
.page.light .empty { border-color: #aaa087; }
.page.light .empty-copy { color: #716b5c; }
.page.light .empty-back { border-color: #527466; color: #376b58; }
.page.light .security { background: #ded2ba; }
.page.light .security-title { color: #775127; }
.page.light .security-copy { color: #675d4f; }
</style>
