<template>
  <view class="page" :class="{ light: state.themeMode === 'light' }" :style="appStyle">
    <view class="ink-scene">
      <view class="celestial" hover-class="celestial-active" @tap="toggleTheme" title="切换明暗模式（重新进入app生效）">
        <text>{{ state.themeMode === 'light' ? '☀' : '☾' }}</text>
      </view>
      <view class="ridge ridge-far" />
      <view class="ridge ridge-near" />
      <view class="mist mist-one" />
      <view class="mist mist-two" />
    </view>

    <view class="brand">
      <view class="brand-heading">
        <text class="brand-title">这是江湖辅助</text>
        <view class="seal">贰</view>
      </view>
      <text class="brand-sub">一念入江湖</text>
    </view>

    <!-- 登录表单 -->
    <view v-if="!charMode" class="card">
      <view class="form-heading">
        <text class="form-title">登录信息</text>
        <view class="form-actions">
          <view v-if="loginProfiles.length" class="help-link" hover-class="hp" @tap="openProfileManager">切换账号</view>
          <view class="help-link" hover-class="hp" @tap="loginHelpVisible = true">登录帮助</view>
        </view>
      </view>
      <view class="server-row">
        <view class="field server-host">
          <text class="label">山门 · 服务器</text>
          <input
            v-model="host"
            class="in"
            placeholder="服务器地址"
            :placeholder-style="ph"
            :disabled="busy"
          />
        </view>
        <view class="field server-port">
          <text class="label">关隘 · 端口</text>
          <input
            v-model="port"
            class="in"
            type="number"
            placeholder="端口"
            :placeholder-style="ph"
            :disabled="busy"
          />
        </view>
      </view>
      <view class="server-tip">
        <text class="server-tip-mark">!</text>
        <text>服务器 IP 与端口已预设，不清楚用途就保持默认</text>
      </view>
      <view class="field">
        <text class="label">名帖 · 账号</text>
        <input
          v-model="account"
          class="in"
          placeholder="请输入账号"
          :placeholder-style="ph"
          :disabled="busy"
        />
      </view>
      <view class="field">
        <text class="label">口令 · 密码</text>
        <input
          v-model="password"
          class="in"
          password
          :password="true"
          placeholder="请输入密码"
          :placeholder-style="ph"
          :disabled="busy"
        />
      </view>
      <view class="field">
        <text class="label">暗号 · 验证码</text>
        <input
          v-model="captcha"
          class="in"
          placeholder="例如：_5"
          :placeholder-style="ph"
          :disabled="busy"
        />
        <text class="field-help">填写“_ + 区服”，区服就是账号后缀；例如 5 区填写 _5</text>
      </view>

      <view class="opt-row">
        <view class="auto-row" hover-class="hp" @tap="toggleAuto">
          <view class="cb" :class="{ on: autoLogin }">
            <text v-if="autoLogin" class="cb-check">✓</text>
          </view>
          <text class="auto-text">自动登录</text>
        </view>
        <view class="auto-row" hover-class="hp" @tap="toggleDebug">
          <view class="cb" :class="{ on: debugLog }">
            <text v-if="debugLog" class="cb-check">✓</text>
          </view>
          <text class="auto-text">详细日志</text>
        </view>
      </view>

      <view class="login-btn" hover-class="hp" :class="{ busy }" @tap="doLogin">
        <text>{{ btnText }}</text>
      </view>

      <text v-if="state.stage === 'error' && errorMsg" class="err">{{ errorMsg }}</text>
    </view>

    <!-- 创建角色 -->
    <view v-else class="card">
      <text class="char-title">请建立游戏角色！</text>
      <view class="field">
        <text class="label">请输入昵称：</text>
        <input v-model="nickname" class="in" placeholder="请输入昵称" :placeholder-style="ph" />
      </view>
      <view class="field">
        <text class="label">请选择性别：</text>
        <view class="sex-row">
          <view class="sex" hover-class="hp" :class="{ on: sex === '男性' }" @tap="pickSex('男性')">男性</view>
          <view class="sex" hover-class="hp" :class="{ on: sex === '女性' }" @tap="pickSex('女性')">女性</view>
        </view>
      </view>
      <view class="login-btn" hover-class="hp" @tap="doCreateChar">
        <text>确认建立</text>
      </view>
      <text class="back-link" hover-class="hp" @tap="backToLoginForm">返回重新登录</text>
      <text v-if="errorMsg" class="err">{{ errorMsg }}</text>
    </view>

    <view class="foot-rule" />
    <text class="foot">江湖路远 · 此间相逢</text>
    <text v-if="latestAnnouncement" class="announcement-link" hover-class="hp" @tap="announcementVisible = true">江湖告示</text>
    <text class="version">{{ versionLabel }}</text>

    <view v-if="announcementVisible && latestAnnouncement" class="announcement-mask" @tap.self="announcementVisible = false">
      <view class="announcement-dialog">
        <view class="announcement-heading">
          <text class="announcement-title">{{ latestAnnouncement.title }}</text>
          <text class="announcement-close" hover-class="hp" @tap="announcementVisible = false">×</text>
        </view>
        <text class="announcement-date">{{ latestAnnouncement.publishedAt || '' }}</text>
        <scroll-view class="announcement-scroll" scroll-y>
          <text class="announcement-content">{{ latestAnnouncement.content }}</text>
        </scroll-view>
        <view class="announcement-confirm" hover-class="hp" @tap="announcementVisible = false">知晓</view>
      </view>
    </view>

    <view v-if="loginHelpVisible" class="help-mask" @tap.self="loginHelpVisible = false">
      <view class="help-dialog">
        <view class="help-heading">
          <text class="help-title">登录帮助</text>
          <text class="help-close" hover-class="hp" @tap="loginHelpVisible = false">×</text>
        </view>
        <scroll-view class="help-scroll" scroll-y>
          <view class="help-alert">
            <text class="help-alert-title">服务器 IP 和端口怎么填？</text>
            <text>登录页已经填写默认线路。若不知道这些字段的用途，直接保持默认值即可；只有拿到服务器管理员提供的新地址和端口时才需要调整。</text>
          </view>

          <view class="help-step">
            <text class="help-step-no">1</text>
            <view class="help-step-content">
              <text class="help-step-title">填写完整账号和密码</text>
              <text class="help-text">账号末尾的数字就是所在区服，填写验证码时需要用到。</text>
            </view>
          </view>

          <view class="help-step">
            <text class="help-step-no">2</text>
            <view class="help-step-content">
              <text class="help-step-title">验证码填写“_ + 区服”</text>
              <text class="help-text">先输入一个半角下划线 _，再输入账号后缀对应的区服数字，中间不要加空格。</text>
              <view class="help-examples">
                <text>账号后缀为 5（5 区）  →  验证码填 _5</text>
                <text>账号后缀为 0（0 区）  →  验证码填 _0</text>
              </view>
            </view>
          </view>

          <view class="help-step">
            <text class="help-step-no">3</text>
            <view class="help-step-content">
              <text class="help-step-title">点击“踏入江湖”</text>
              <text class="help-text">登录成功后会自动加入“常用名帖”。开启自动登录后，下次启动会直接使用当前选中的名帖连接游戏。</text>
            </view>
          </view>
        </scroll-view>
        <view class="help-confirm" hover-class="hp" @tap="loginHelpVisible = false">我知道了</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onLoad, onShow } from '@/utils/platform/lifecycle.js'
import { state, toggleThemeMode } from '@/utils/store.js'
import net from '@/utils/net.js'
import { log, setLogLevel } from '@/utils/log.js'
import { getLatestAnnouncement, getLatestVersion } from '@/utils/releaseApi.js'
import { runtime } from '@/utils/platform/index.js'
import { appStyle } from '@/utils/appearance.js'
import { clientConfig, validateGameProtocolConfig } from '@/utils/config.js'
import {
  ACTIVE_LOGIN_PROFILE_KEY,
  LOGIN_PROFILES_KEY,
  normalizeProfiles,
  profileId,
  upsertProfile
} from '@/utils/loginProfiles.js'

const DEFAULT_HOST = clientConfig.game.defaultHost
const DEFAULT_PORT = clientConfig.game.defaultPort
const DEFAULT_CAPTCHA = clientConfig.game.defaultCaptcha

const host = ref(DEFAULT_HOST)
const port = ref(DEFAULT_PORT)
const account = ref('')
const password = ref('')
const captcha = ref(DEFAULT_CAPTCHA)
const autoLogin = ref(false)
const debugLog = ref(false)
const nickname = ref('')
const sex = ref('男性')
const charMode = ref(false)
const busy = ref(false)
const errorMsg = ref('')
const credsSent = ref(false)
const appVersion = ref('1.0.0')
const latestVersion = ref('')
const latestAnnouncement = ref(null)
const announcementVisible = ref(false)
const loginHelpVisible = ref(false)
const loginProfiles = ref([])
const activeProfileId = ref('')
const skipAutoLoginOnce = ref(false)

const versionLabel = computed(() => {
  if (!latestVersion.value) return `v${appVersion.value}`
  return `当前 v${appVersion.value} · 最新 v${latestVersion.value}`
})

function toggleTheme() {
  toggleThemeMode()
  runtime.showToast({ title: '重新进入app生效', icon: 'none' })
}

function loadReleaseInfo() {
  getLatestVersion()
    .then((version) => {
      latestVersion.value = String(version.versionName || '')
    })
    .catch((error) => log('RELEASE', '获取最新版本失败:', error.message))

  getLatestAnnouncement()
    .then((announcement) => {
      if (!announcement || !announcement.content) return
      latestAnnouncement.value = announcement
      announcementVisible.value = true
    })
    .catch((error) => log('RELEASE', '获取最新公告失败:', error.message))
}

const ph = 'color:#68736d'
const btnText = computed(() => {
  if (busy.value) return state.statusMsg || '连接中...'
  return '踏入江湖'
})

// 自动登录开关
function toggleAuto() {
  log('BTN', '点击 自动登录: ' + (autoLogin.value ? '关' : '开'))
  autoLogin.value = !autoLogin.value
}

function writeProfiles() {
  runtime.setStorageSync(LOGIN_PROFILES_KEY, loginProfiles.value.map((profile) => ({ ...profile })))
  if (activeProfileId.value) runtime.setStorageSync(ACTIVE_LOGIN_PROFILE_KEY, activeProfileId.value)
  else runtime.removeStorageSync(ACTIVE_LOGIN_PROFILE_KEY)
}

function applyProfile(profile) {
  host.value = profile.host
  port.value = profile.port
  account.value = profile.account
  password.value = profile.password
  captcha.value = profile.captcha
  activeProfileId.value = profile.id
  errorMsg.value = ''
}

function openProfileManager() {
  if (busy.value) return
  skipAutoLoginOnce.value = true
  runtime.navigateTo({
    url: '/pages/login-accounts/login-accounts',
    fail() {
      skipAutoLoginOnce.value = false
    }
  })
}

function refreshSelectedProfile() {
  loginProfiles.value = normalizeProfiles(runtime.getStorageSync(LOGIN_PROFILES_KEY))
  const storedActiveId = runtime.getStorageSync(ACTIVE_LOGIN_PROFILE_KEY)
  const selected = loginProfiles.value.find((profile) => profile.id === storedActiveId) || loginProfiles.value[0]
  if (selected) applyProfile(selected)
  else if (activeProfileId.value) {
    activeProfileId.value = ''
    account.value = ''
    password.value = ''
    autoLogin.value = false
  }
}

// 选择性别
function pickSex(v) {
  log('BTN', '点击 选择性别:', v)
  sex.value = v
}

// 详细日志开关: 开=全量(字节hex/解码全文/逐行协议), 关=默认 info
function toggleDebug() {
  debugLog.value = !debugLog.value
  setLogLevel(debugLog.value ? 2 : 1)
  runtime.setStorageSync('mud_debug', debugLog.value ? 1 : 0)
  log('BTN', '点击 详细日志:', debugLog.value ? '开' : '关')
}

function savePrefs() {
  runtime.setStorageSync('mud_host', host.value.trim())
  runtime.setStorageSync('mud_port', port.value.trim())
  runtime.setStorageSync('mud_key', captcha.value.trim())
  runtime.setStorageSync('mud_auto', autoLogin.value ? 1 : 0)
}

function saveSuccessfulLogin() {
  const current = {
    host: host.value,
    port: port.value,
    account: account.value,
    password: password.value,
    captcha: captcha.value
  }
  loginProfiles.value = upsertProfile(loginProfiles.value, current)
  activeProfileId.value = profileId(current)
  writeProfiles()
  // 保留旧键，兼容已有自动登录逻辑和旧版本应用。
  runtime.setStorageSync('mud_id', account.value.trim())
  runtime.setStorageSync('mud_pass', password.value)
}

function doLogin() {
  if (busy.value) return
  const h = host.value.trim()
  const p = port.value.trim()
  const a = account.value.trim()
  const pw = password.value
  const ck = captcha.value.trim()
  if (!h || !p) {
    log('LOGIN', '校验失败: 缺少服务器地址或端口')
    errorMsg.value = '请填写服务器地址和端口！'
    return
  }
  if (!a || !pw) {
    log('LOGIN', '校验失败: 账号或密码为空')
    errorMsg.value = '账号密码不能为空！'
    return
  }
  if (!ck) {
    log('LOGIN', '校验失败: 验证码为空')
    errorMsg.value = '请输入验证码！'
    return
  }
  const missingProtocolConfig = validateGameProtocolConfig()
  if (missingProtocolConfig.length) {
    errorMsg.value = '客户端协议配置缺失，请先配置 .env：' + missingProtocolConfig.join(', ')
    log('LOGIN', errorMsg.value)
    return
  }

  errorMsg.value = ''
  busy.value = true
  charMode.value = false
  credsSent.value = false
  state.stage = 'idle'
  state.statusMsg = '正在连接服务器...'
  savePrefs()

  log('LOGIN', '尝试登录:', h + ':' + p, '账号:', a, '自动登录:', autoLogin.value)

  net.connect(h, parseInt(p, 10), {
    onOpen() {
      log('LOGIN', 'TCP 已连接, 发送握手口令...')
      net.sendHandshake()
    },
    onError(errObj) {
      busy.value = false
      state.stage = 'idle'
      errorMsg.value = '连接失败：' + ((errObj && (errObj.errMsg || errObj.message)) || '无法连接服务器')
      log('LOGIN', '连接失败:', errorMsg.value)
    },
    onClose() {
      if (state.stage === 'loginok') return
      busy.value = false
      state.stage = 'idle'
      errorMsg.value = errorMsg.value || '与服务器断开连接'
      log('LOGIN', '连接被关闭:', errorMsg.value)
    }
  })
}

function sendCreds() {
  if (credsSent.value) return
  credsSent.value = true
  state.statusMsg = '登录中......'
  const key = captcha.value.trim()
  const line = account.value.trim() + '║' + password.value + '║' + key + '║' + clientConfig.game.loginClientTag + '\n'
  log('LOGIN', '发送登录凭证(密码/验证码已隐藏):', account.value.trim() + '║******║******║[client-tag]')
  net.send(line)
}

function doCreateChar() {
  if (!nickname.value) {
    log('LOGIN', '创建角色失败: 昵称为空')
    errorMsg.value = '昵称不能为空！'
    return
  }
  if (sex.value !== '男性' && sex.value !== '女性') {
    log('LOGIN', '创建角色失败: 未选择性别')
    errorMsg.value = '请选择性别！'
    return
  }
  errorMsg.value = ''
  state.statusMsg = '角色创建中......'
  log('LOGIN', '发送创建角色:', sex.value + '║001║' + nickname.value)
  net.send(sex.value + '║001║' + nickname.value + '\n')
}

function backToLoginForm() {
  log('LOGIN', '返回重新登录, 断开当前连接')
  net.close()
  charMode.value = false
  busy.value = false
  credsSent.value = false
  state.stage = 'idle'
  state.statusMsg = ''
  errorMsg.value = ''
}

watch(
  () => state.stage,
  (val) => {
    log('LOGIN', 'stage 变化 →', val)
    if (val === 'versionok') {
      sendCreds()
    } else if (val === 'charcreate') {
      charMode.value = true
      busy.value = false
    } else if (val === 'loginok') {
      saveSuccessfulLogin()
      log('LOGIN', '登录成功, 跳转游戏页')
      runtime.reLaunch({ url: '/pages/game/game' })
    } else if (val === 'error') {
      busy.value = false
      errorMsg.value = state.statusMsg
    }
  }
)

onLoad(() => {
  appVersion.value = runtime.getAppVersion()
  loadReleaseInfo()

  host.value = runtime.getStorageSync('mud_host') || DEFAULT_HOST
  const p = runtime.getStorageSync('mud_port')
  port.value = p ? String(p) : DEFAULT_PORT
  const a = runtime.getStorageSync('mud_id')
  const pw = runtime.getStorageSync('mud_pass')
  captcha.value = runtime.getStorageSync('mud_key') || DEFAULT_CAPTCHA
  loginProfiles.value = normalizeProfiles(runtime.getStorageSync(LOGIN_PROFILES_KEY))
  // 将旧版保存的单账号无感迁移到常用名帖。
  if (!loginProfiles.value.length && a && pw) {
    loginProfiles.value = upsertProfile([], {
      host: host.value,
      port: port.value,
      account: a,
      password: pw,
      captcha: captcha.value
    })
  }
  const storedActiveId = runtime.getStorageSync(ACTIVE_LOGIN_PROFILE_KEY)
  const selected = loginProfiles.value.find((profile) => profile.id === storedActiveId) || loginProfiles.value[0]
  if (selected) applyProfile(selected)
  else {
    account.value = a || ''
    password.value = pw || ''
  }
  writeProfiles()
  autoLogin.value = !!runtime.getStorageSync('mud_auto')
  debugLog.value = !!runtime.getStorageSync('mud_debug')
  setLogLevel(debugLog.value ? 2 : 1)
  log('LOGIN', '页面加载, 读取配置:', host.value + ':' + port.value, '账号:', a || '(空)', '自动登录:', autoLogin.value, '详细日志:', debugLog.value)
})

onShow(() => {
  refreshSelectedProfile()
  // 从游戏页返回 (退出游戏) 后重置
  if (state.stage === 'loginok') {
    // 异常情况, 回到登录
    state.stage = 'idle'
  }
  charMode.value = state.stage === 'charcreate'
  if (state.stage !== 'versionok') busy.value = false
  if (state.stage === 'error') errorMsg.value = state.statusMsg

  if (skipAutoLoginOnce.value) {
    skipAutoLoginOnce.value = false
    return
  }

  // 自动登录
  if (autoLogin.value && host.value && account.value && password.value && captcha.value && state.stage === 'idle') {
    log('LOGIN', '检测到自动登录, 2s 后自动连接...')
    setTimeout(() => {
      if (state.stage === 'idle') doLogin()
    }, 200)
  }
})
</script>

<style>
.page {
  min-height: 100vh;
  padding: var(--status-bar-height) 28rpx 34rpx;
  position: relative;
  overflow-y: auto;
  background: #0b0d0c;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}
.ink-scene {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 390rpx;
  overflow: hidden;
  background: #171c1a;
  border-bottom: 1rpx solid #37403b;
}
.celestial {
  position: absolute;
  top: calc(var(--status-bar-height) + 38rpx);
  right: 24rpx;
  width: 92rpx;
  height: 92rpx;
  border-radius: 50%;
  background: #d8d0b8;
  color: #3c433f;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 58rpx;
  line-height: 1;
  opacity: 0.86;
}
.celestial-active {
  transform: scale(0.94);
  opacity: 1;
}
.ridge {
  position: absolute;
  left: -8%;
  width: 116%;
  transform-origin: center bottom;
}
.ridge-far {
  bottom: 56rpx;
  height: 190rpx;
  background: #39443f;
  opacity: 0.7;
  clip-path: polygon(0 88%, 12% 58%, 23% 72%, 38% 18%, 51% 67%, 65% 36%, 77% 70%, 90% 42%, 100% 76%, 100% 100%, 0 100%);
}
.ridge-near {
  bottom: -10rpx;
  height: 190rpx;
  background: #111513;
  clip-path: polygon(0 72%, 18% 45%, 30% 70%, 46% 32%, 58% 76%, 72% 50%, 84% 69%, 100% 38%, 100% 100%, 0 100%);
}
.mist {
  position: absolute;
  height: 2rpx;
  background: #abb5af;
  opacity: 0.35;
}
.mist-one { left: 5%; right: 38%; bottom: 110rpx; }
.mist-two { left: 43%; right: 4%; bottom: 76rpx; }
.brand {
  z-index: 1;
  min-height: 286rpx;
  padding-top: 72rpx;
  margin-bottom: 18rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.brand-heading {
  display: flex;
  align-items: center;
  gap: 18rpx;
}
.brand-title {
  font-family: STKaiti, KaiTi, 'Noto Serif SC', serif;
  font-size: 68rpx;
  font-weight: 600;
  color: #f0ecdf;
  letter-spacing: 0;
  text-shadow: 0 3rpx 10rpx rgba(0, 0, 0, 0.8);
}
.seal {
  width: 52rpx;
  height: 52rpx;
  border: 3rpx solid #b84336;
  color: #d96555;
  font-family: STKaiti, KaiTi, serif;
  font-size: 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-4deg);
}
.brand-sub {
  margin-top: 12rpx;
  font-family: STKaiti, KaiTi, serif;
  font-size: 25rpx;
  color: #b5b9af;
  letter-spacing: 0;
}
.card {
  z-index: 2;
  width: 100%;
  max-width: 760rpx;
  background: rgba(19, 23, 21, 0.96);
  border: 1rpx solid #465049;
  border-top: 4rpx solid #9c3b31;
  border-radius: 8rpx;
  padding: 26rpx 28rpx 28rpx;
  box-sizing: border-box;
  box-shadow: 0 12rpx 30rpx rgba(0, 0, 0, 0.42);
}
.form-heading {
  min-height: 48rpx;
  margin-bottom: 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.form-title {
  color: #d9ded9;
  font-family: STKaiti, KaiTi, serif;
  font-size: 27rpx;
  font-weight: bold;
}
.help-link {
  padding: 8rpx 12rpx;
  border: 1rpx solid #647b6d;
  color: #a9c8b5;
  font-size: 22rpx;
}
.form-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.server-row {
  display: flex;
  gap: 18rpx;
}
.server-host { flex: 2; min-width: 0; }
.server-port { flex: 1; min-width: 0; }
.server-row .field { margin-bottom: 8rpx; }
.server-port .in { text-align: center; }
.server-host .in { font-size: 25rpx; }
.server-tip {
  margin-bottom: 18rpx;
  display: flex;
  align-items: center;
  color: #d6a46d;
  font-size: 21rpx;
}
.server-tip-mark {
  width: 28rpx;
  height: 28rpx;
  margin-right: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid #b57c42;
  font-weight: bold;
}
.field {
  margin-bottom: 18rpx;
}
.label {
  display: block;
  color: #aab5ad;
  font-family: STKaiti, KaiTi, serif;
  font-size: 23rpx;
  margin-bottom: 8rpx;
}
.in {
  width: 100%;
  height: 68rpx;
  background: #0d100f;
  border: 1rpx solid #3d4641;
  border-bottom-color: #6e7c73;
  border-radius: 4rpx;
  color: #f0eee6;
  font-size: 27rpx;
  padding: 0 18rpx;
  box-sizing: border-box;
}
.field-help {
  display: block;
  margin-top: 8rpx;
  color: #8fa99b;
  font-size: 20rpx;
  line-height: 1.5;
}
.opt-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2rpx 0 22rpx;
}
.auto-row {
  display: flex;
  align-items: center;
  min-height: 48rpx;
}
.cb {
  width: 34rpx;
  height: 34rpx;
  border: 1rpx solid #647068;
  border-radius: 3rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12rpx;
}
.cb.on {
  background: #9c3b31;
  border-color: #c65a4d;
}
.cb-check {
  color: #ffffff;
  font-size: 24rpx;
}
.auto-text {
  color: #aeb6b0;
  font-size: 24rpx;
}
.login-btn {
  height: 76rpx;
  background: #9c3b31;
  border: 1rpx solid #cb675a;
  border-radius: 4rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-family: STKaiti, KaiTi, serif;
  font-size: 31rpx;
  letter-spacing: 0;
}
.login-btn.busy {
  background: #39423d;
  border-color: #5c6861;
}
.err {
  display: block;
  margin-top: 22rpx;
  color: #ff8080;
  font-size: 24rpx;
  text-align: center;
}
.char-title {
  color: #ebe6d8;
  font-family: STKaiti, KaiTi, serif;
  font-size: 32rpx;
  font-weight: bold;
  margin-bottom: 30rpx;
  text-align: center;
}
.sex-row {
  display: flex;
}
.sex {
  width: 140rpx;
  height: 64rpx;
  background: #101311;
  border: 1rpx solid #465049;
  border-radius: 4rpx;
  color: #bbbbbb;
  font-size: 26rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}
.sex.on {
  background: #35493f;
  border-color: #789384;
  color: #ffffff;
}
.back-link {
  margin-top: 24rpx;
  text-align: center;
  color: #89958e;
  font-size: 24rpx;
  text-decoration: underline;
}
.foot {
  z-index: 1;
  margin-top: 12rpx;
  color: #67726c;
  font-family: STKaiti, KaiTi, serif;
  font-size: 22rpx;
  text-align: center;
}
.version {
  z-index: 1;
  margin-top: 4rpx;
  color: #4f5954;
  font-size: 18rpx;
  text-align: center;
}
.announcement-link {
  z-index: 1;
  margin-top: 6rpx;
  color: #9aab9f;
  font-family: STKaiti, KaiTi, serif;
  font-size: 22rpx;
  text-decoration: underline;
}
.announcement-mask {
  position: fixed;
  z-index: 20;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 40rpx;
  background: rgba(0, 0, 0, 0.68);
  display: flex;
  align-items: center;
  justify-content: center;
}
.announcement-dialog {
  width: 100%;
  max-width: 620rpx;
  padding: 34rpx;
  background: #151917;
  border: 1rpx solid #66736b;
  border-top: 4rpx solid #8f322c;
  border-radius: 6rpx;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.5);
}
.announcement-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.announcement-title {
  color: #ebe6d8;
  font-family: STKaiti, KaiTi, serif;
  font-size: 36rpx;
  font-weight: bold;
}
.announcement-close {
  width: 56rpx;
  height: 56rpx;
  color: #a7b0aa;
  font-size: 42rpx;
  line-height: 50rpx;
  text-align: center;
}
.announcement-date {
  display: block;
  margin-top: 6rpx;
  color: #6f7b74;
  font-size: 20rpx;
}
.announcement-scroll {
  height: 360rpx;
  max-height: 46vh;
  margin-top: 28rpx;
}
.announcement-content {
  color: #c9cdc9;
  font-size: 27rpx;
  line-height: 1.8;
  white-space: pre-wrap;
}
.announcement-confirm {
  width: 180rpx;
  height: 66rpx;
  margin: 32rpx auto 0;
  background: #365848;
  border: 1rpx solid #668372;
  border-radius: 4rpx;
  color: #ffffff;
  font-family: STKaiti, KaiTi, serif;
  font-size: 28rpx;
  line-height: 64rpx;
  text-align: center;
}
.help-mask {
  position: fixed;
  z-index: 22;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 34rpx;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
}
.help-dialog {
  width: 100%;
  max-width: 650rpx;
  padding: 30rpx;
  box-sizing: border-box;
  background: #151917;
  border: 1rpx solid #66736b;
  border-top: 4rpx solid #9c3b31;
  border-radius: 6rpx;
  box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.5);
}
.help-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.help-title {
  color: #ebe6d8;
  font-family: STKaiti, KaiTi, serif;
  font-size: 34rpx;
  font-weight: bold;
}
.help-close {
  width: 54rpx;
  height: 54rpx;
  color: #a7b0aa;
  font-size: 42rpx;
  line-height: 50rpx;
  text-align: center;
}
.help-scroll {
  height: 650rpx;
  max-height: 58vh;
  margin-top: 16rpx;
}
.help-alert {
  padding: 16rpx;
  border-left: 5rpx solid #c48145;
  background: #292219;
}
.help-alert-title,
.help-alert text,
.help-step-title,
.help-text,
.help-examples text {
  display: block;
}
.help-alert-title {
  margin-bottom: 6rpx;
  color: #f1d0a5;
  font-size: 23rpx;
  font-weight: bold;
}
.help-alert text:not(.help-alert-title) {
  color: #c7b9a8;
  font-size: 21rpx;
  line-height: 1.65;
}
.help-step {
  padding: 20rpx 0;
  display: flex;
  border-bottom: 1rpx solid #343c37;
}
.help-step-no {
  flex: none;
  width: 38rpx;
  height: 38rpx;
  margin-right: 12rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid #668372;
  color: #a9c8b5;
  font-size: 21rpx;
  font-weight: bold;
}
.help-step-content { flex: 1; min-width: 0; }
.help-step-title { color: #e1e5e1; font-size: 23rpx; font-weight: bold; }
.help-text { margin-top: 6rpx; color: #adb7b0; font-size: 21rpx; line-height: 1.65; }
.help-examples {
  margin-top: 12rpx;
  padding: 12rpx 14rpx;
  background: #0d100f;
  border: 1rpx solid #3d4641;
}
.help-examples text { color: #d8ddd8; font-size: 21rpx; line-height: 1.8; }
.help-confirm {
  height: 64rpx;
  margin-top: 22rpx;
  background: #365848;
  border: 1rpx solid #668372;
  color: #fff;
  font-family: STKaiti, KaiTi, serif;
  font-size: 27rpx;
  line-height: 62rpx;
  text-align: center;
}
.foot-rule {
  z-index: 1;
  width: 80rpx;
  height: 1rpx;
  margin-top: 26rpx;
  background: #46514b;
}

/* ---- 宣纸亮色模式 ---- */
.page.light { background: #e8dfc8; }
.page.light .ink-scene { background: #ddd4bd; border-bottom-color: #aaa087; }
.page.light .celestial { background: #d19145; color: #fff3cf; box-shadow: 0 0 0 10rpx rgba(192, 125, 53, 0.12); }
.page.light .ridge-far { background: #a8aa91; opacity: 0.78; }
.page.light .ridge-near { background: #6f7567; }
.page.light .mist { background: #f4eedc; opacity: 0.65; }
.page.light .brand-title { color: #28322c; text-shadow: 0 2rpx 5rpx rgba(255, 255, 255, 0.45); }
.page.light .brand-sub { color: #59645c; }
.page.light .card { background: rgba(246, 239, 219, 0.97); border-color: #9d947d; border-top-color: #9c3b31; box-shadow: 0 12rpx 28rpx rgba(73, 61, 42, 0.18); }
.page.light .form-title { color: #354039; }
.page.light .help-link { border-color: #688074; color: #376b67; }
.page.light .server-tip { color: #8a572d; }
.page.light .server-tip-mark { border-color: #9a6332; }
.page.light .label { color: #4c574f; }
.page.light .in { background: #fff9e9; border-color: #aaa087; border-bottom-color: #716c5d; color: #242b26; }
.page.light .field-help { color: #537066; }
.page.light .cb { border-color: #777c70; }
.page.light .auto-text { color: #505a53; }
.page.light .login-btn.busy { background: #7b8177; border-color: #92998e; }
.page.light .char-title { color: #2e3731; }
.page.light .sex { background: #f9f2df; border-color: #9d947d; color: #4a544d; }
.page.light .sex.on { background: #637d6d; border-color: #4d6b5a; color: #ffffff; }
.page.light .back-link { color: #59675f; }
.page.light .foot-rule { background: #9b927c; }
.page.light .foot { color: #59645c; }
.page.light .version { color: #77715f; }
.page.light .announcement-link { color: #46665a; }
.page.light .announcement-mask { background: rgba(46, 42, 34, 0.56); }
.page.light .announcement-dialog { background: #f5edd7; border-color: #9d947d; border-top-color: #9c3b31; box-shadow: 0 20rpx 60rpx rgba(73, 61, 42, 0.3); }
.page.light .announcement-title { color: #2e3731; }
.page.light .announcement-close { color: #646c66; }
.page.light .announcement-date { color: #77715f; }
.page.light .announcement-content { color: #303a34; }
.page.light .announcement-confirm { background: #456b58; border-color: #315440; }
.page.light .help-mask { background: rgba(46, 42, 34, 0.62); }
.page.light .help-dialog { background: #f5edd7; border-color: #9d947d; border-top-color: #9c3b31; box-shadow: 0 20rpx 60rpx rgba(73, 61, 42, 0.3); }
.page.light .help-title, .page.light .help-step-title { color: #2e3731; }
.page.light .help-close { color: #646c66; }
.page.light .help-alert { background: #eadcc2; }
.page.light .help-alert-title { color: #75461f; }
.page.light .help-alert text:not(.help-alert-title) { color: #5f5142; }
.page.light .help-step { border-bottom-color: #b2a890; }
.page.light .help-step-no { border-color: #527466; color: #376b67; }
.page.light .help-text { color: #59645d; }
.page.light .help-examples { background: #e2d8c0; border-color: #aaa087; }
.page.light .help-examples text { color: #303a34; }
.page.light .help-confirm { background: #456b58; border-color: #315440; }
</style>
