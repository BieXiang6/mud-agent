<template>
  <view class="page ai-guide-page" :class="{ light: gameState.themeMode === 'light' }" :style="appStyle">
    <view class="topbar">
      <view class="back" hover-class="hp" @tap="goBack">‹</view>
      <text class="title">AI 使用教程</text>
      <view class="settings" hover-class="hp" @tap="openSettings">模型设置</view>
    </view>

    <scroll-view scroll-y class="body">
      <view class="intro">
        <text class="intro-title">用 DeepSeek 驱动游戏 Agent</text>
        <text class="intro-text">准备一个 DeepSeek 开放平台账号和少量 API 余额，按下面 4 步即可开始。</text>
      </view>

      <view class="step">
        <view class="step-head">
          <text class="step-no">1</text>
          <text class="step-title">登录 DeepSeek 开放平台</text>
        </view>
        <text class="paragraph">点击下方按钮打开官方开放平台。注册或登录后进入控制台。这里使用的是 API 开放平台，不是普通聊天页面。</text>
        <view class="button primary" hover-class="hp" @tap="openUrl(signInUrl, '登录地址')">打开 DeepSeek 登录页</view>
        <text class="url">{{ signInUrl }}</text>
      </view>

      <view class="step">
        <view class="step-head">
          <text class="step-no">2</text>
          <text class="step-title">充值并创建 API Key</text>
        </view>
        <text class="paragraph">先在“余额充值”中确认账户有可用余额，再打开“API Keys”，点击“创建 API key”。名称可填“这是江湖智能体”。</text>
        <view class="button-row">
          <view class="button" hover-class="hp" @tap="openUrl(topUpUrl, '充值地址')">余额充值</view>
          <view class="button primary" hover-class="hp" @tap="openUrl(apiKeysUrl, 'API Keys 地址')">创建 API Key</view>
        </view>
        <view class="notice disclaimer">
          <text class="notice-title">充值免责声明</text>
          <text>充值在 DeepSeek 官方开放平台完成，款项是充值给 DeepSeek，不是充值给本应用。本应用不参与收款，也无法处理余额、扣费、退款、发票或到账异常。遇到充值相关问题，请联系 DeepSeek 官方客服，本应用无法代为转达或处理。</text>
        </view>
        <view class="notice danger">
          <text class="notice-title">创建后立即保存</text>
          <text>完整 Key 通常只显示一次。它一般以 sk- 开头，等同于账户密码，不要发送给任何人，也不要粘贴到 AI 对话框。模型配置会保存在本机应用存储中，请勿在共享设备上保留 Key。</text>
        </view>
      </view>

      <view class="step">
        <view class="step-head">
          <text class="step-no">3</text>
          <text class="step-title">填写模型配置</text>
        </view>
        <text class="paragraph">进入“模型设置”，编辑默认模型或新增一个配置。按下面逐项填写，然后点击“保存并选用”。</text>
        <view class="config-list">
          <view v-for="item in configItems" :key="item.label" class="config-row">
            <view class="config-main">
              <text class="config-label">{{ item.label }}</text>
              <text class="config-value">{{ item.value }}</text>
              <text v-if="item.hint" class="config-hint">{{ item.hint }}</text>
            </view>
            <view v-if="item.copy" class="copy" hover-class="hp" @tap="copyText(item.copy, item.label)">复制</view>
          </view>
        </view>
        <view class="notice">
          <text class="notice-title">模型 ID 以官方控制台为准</text>
          <text>本应用当前预设为 deepseek-flash。若你的 DeepSeek 账户暂不支持该模型，请从官方文档选择账户可用的模型 ID。</text>
        </view>
        <view class="button-row">
          <view class="button" hover-class="hp" @tap="openUrl(docsUrl, 'API 文档地址')">查看官方文档</view>
          <view class="button primary" hover-class="hp" @tap="openSettings">去模型设置</view>
        </view>
      </view>

      <view class="step">
        <view class="step-head">
          <text class="step-no">4</text>
          <text class="step-title">开始使用 Agent</text>
        </view>
        <view class="usage-row">
          <text class="usage-index">A</text>
          <text>返回游戏，点击房间标题栏右侧的“AI”。面板标题应显示刚选用的模型配置。</text>
        </view>
        <view class="usage-row">
          <text class="usage-index">B</text>
          <text>先输入只读测试：“查看当前场景和我的状态，不执行任何指令。”点击“发送”。</text>
        </view>
        <view class="usage-row">
          <text class="usage-index">C</text>
          <text>测试成功后直接描述目标，例如：“带我从当前地点前往扬州，中途遇到异常就停下说明。”</text>
        </view>
        <view class="usage-row">
          <text class="usage-index">D</text>
          <text>运行中可查看工具调用；需要立即中断时点“停止”。不同目标用“新增任务”分开，历史记录可在“任务”中恢复。</text>
        </view>
        <view class="usage-row">
          <text class="usage-index">E</text>
          <text>要让 Agent 阅读文本资料或源码，点击输入框下方的“附件”选择文件，再填写处理要求并发送；支持包括 .cs 在内的任意代码扩展名，也支持无扩展名源码。每轮最多 3 个文件，单个不超过 256 KiB。</text>
        </view>
        <view class="notice warning">
          <text class="notice-title">先从低风险任务开始</text>
          <text>Agent 会实际发送游戏指令。涉及丢弃、交易、消费或不可逆操作时，请明确要求它先征求确认。还可在模型设置的“指令黑名单”中填写禁止指令，例如 quit,drop。</text>
        </view>
      </view>

      <view class="step troubleshooting">
        <view class="step-head">
          <text class="step-no">?</text>
          <text class="step-title">常见问题</text>
        </view>
        <text class="question">提示“请先填写 API Key”</text>
        <text class="answer">进入模型设置，确认 Key 已完整粘贴，并点击“保存并选用”。</text>
        <text class="question">返回 401 / Authentication Fails</text>
        <text class="answer">Key 无效、被删除或复制不完整。回到 DeepSeek 控制台重新创建。</text>
        <text class="question">返回 402 / Insufficient Balance</text>
        <text class="answer">DeepSeek 账户余额不足，可前往其官方开放平台充值。充值、扣费和到账问题请联系 DeepSeek 官方处理，本应用无法查询或干预。</text>
        <text class="question">提示模型不存在或 400</text>
        <text class="answer">检查协议是否为 OpenAI Chat Completions，Base URL 是否为 https://api.deepseek.com，并从官方文档确认模型 ID。</text>
        <text class="question">请求超时或网络错误</text>
        <text class="answer">确认手机能访问 DeepSeek API；部分网络环境可能需要切换网络后重试。</text>
      </view>

      <view class="footer-actions">
        <view class="button primary" hover-class="hp" @tap="openSettings">现在去配置模型</view>
      </view>
      <view class="bottom-space" />
    </scroll-view>
  </view>
</template>

<script setup>
import { state as gameState } from '@/utils/store.js'
import { runtime } from '@/utils/platform/index.js'
import { appStyle } from '@/utils/appearance.js'

const signInUrl = 'https://platform.deepseek.com/sign_in'
const apiKeysUrl = 'https://platform.deepseek.com/api_keys'
const topUpUrl = 'https://platform.deepseek.com/top_up'
const docsUrl = 'https://api-docs.deepseek.com/'

const configItems = [
  { label: '配置名称', value: 'DeepSeek 主模型' },
  { label: 'API Key', value: '粘贴刚创建的 sk-...，不要粘贴引号' },
  { label: 'Base URL', value: 'https://api.deepseek.com', copy: 'https://api.deepseek.com' },
  { label: '协议', value: 'OpenAI Chat Completions' },
  { label: '模型 ID', value: 'deepseek-flash', copy: 'deepseek-flash' },
  { label: '上下文与输出', value: '初次使用可保留页面默认值', hint: '若请求报告参数超限，再按官方模型文档调小。' },
  { label: '压缩阈值 / 保留轮数', value: '80% / 3 轮', hint: '适合大多数连续游戏任务。' }
]

function openUrl(url, label) {
  runtime.openUrl(url, () => copyUrlFallback(url, label))
}

function copyUrlFallback(url, label) {
  runtime.setClipboardData({
    data: url,
    success: () => runtime.showToast({ title: label + '已复制', icon: 'none' })
  })
}

function copyText(value, label) {
  runtime.setClipboardData({
    data: value,
    success: () => runtime.showToast({ title: label + '已复制', icon: 'none' })
  })
}

function openSettings() {
  const pages = runtime.getCurrentPages()
  const previous = pages.length > 1 ? pages[pages.length - 2] : null
  if (previous && previous.route === 'pages/ai-settings/ai-settings') runtime.navigateBack()
  else runtime.navigateTo({ url: '/pages/ai-settings/ai-settings' })
}

function goBack() { runtime.navigateBack() }
</script>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; background: #0c0f12; color: #edf1f4; }
.topbar { flex: none; height: calc(68rpx + var(--status-bar-height)); padding: var(--status-bar-height) 18rpx 0; display: flex; align-items: center; box-sizing: border-box; border-bottom: 1rpx solid #303840; background: #151a1f; }
.back { width: 58rpx; height: 58rpx; display: flex; align-items: center; justify-content: center; font-size: 48rpx; }
.title { flex: 1; font-size: 28rpx; font-weight: bold; }
.settings { padding: 12rpx 14rpx; border: 1rpx solid #3f78aa; color: #b9daf5; font-size: 20rpx; }
.body { flex: 1; min-height: 0; }
.intro { padding: 28rpx 22rpx 24rpx; border-bottom: 1rpx solid #303840; background: #11171c; }
.intro-title, .intro-text { display: block; }
.intro-title { color: #f3f7fa; font-size: 30rpx; font-weight: bold; }
.intro-text { margin-top: 10rpx; color: #9daab4; font-size: 21rpx; line-height: 1.65; }
.step { padding: 24rpx 22rpx; border-bottom: 1rpx solid #303840; }
.step:nth-child(even) { background: #101519; }
.step-head { display: flex; align-items: center; margin-bottom: 14rpx; }
.step-no { width: 42rpx; height: 42rpx; margin-right: 12rpx; display: flex; align-items: center; justify-content: center; border: 1rpx solid #4d8ab8; color: #9fd3f8; font-size: 22rpx; font-weight: bold; }
.step-title { font-size: 25rpx; font-weight: bold; }
.paragraph, .notice text, .usage-row { color: #bdc6cd; font-size: 21rpx; line-height: 1.7; }
.button-row { display: flex; gap: 12rpx; margin-top: 16rpx; }
.button { flex: 1; min-height: 58rpx; padding: 0 12rpx; display: flex; align-items: center; justify-content: center; box-sizing: border-box; border: 1rpx solid #46515a; color: #d9e1e7; font-size: 21rpx; text-align: center; }
.button.primary { border-color: #3d83b8; background: #24699e; color: #fff; }
.step > .button { margin-top: 16rpx; }
.url { display: block; margin-top: 8rpx; overflow-wrap: anywhere; color: #718594; font-size: 17rpx; }
.notice { margin-top: 16rpx; padding: 12rpx 14rpx; border-left: 5rpx solid #4e8aae; background: #14232d; }
.notice.danger { border-left-color: #c26969; background: #2b1d1f; }
.notice.disclaimer { border-left-color: #d39a44; background: #2b2418; }
.notice.warning { border-left-color: #c4934a; background: #29241a; }
.notice-title { display: block; margin-bottom: 4rpx; color: #e8edf0 !important; font-weight: bold; }
.config-list { margin-top: 16rpx; border-top: 1rpx solid #303840; }
.config-row { min-height: 72rpx; padding: 11rpx 0; display: flex; align-items: center; border-bottom: 1rpx solid #303840; }
.config-main { flex: 1; min-width: 0; }
.config-label, .config-value, .config-hint { display: block; }
.config-label { color: #8da0ae; font-size: 18rpx; }
.config-value { margin-top: 3rpx; overflow-wrap: anywhere; color: #edf1f4; font-size: 21rpx; }
.config-hint { margin-top: 4rpx; color: #7f8c95; font-size: 18rpx; line-height: 1.5; }
.copy { flex: none; margin-left: 12rpx; padding: 10rpx 14rpx; border: 1rpx solid #466b86; color: #aad5f3; font-size: 19rpx; }
.usage-row { display: flex; align-items: flex-start; margin-top: 12rpx; }
.usage-index { flex: none; width: 34rpx; margin: 2rpx 10rpx 0 0; color: #8fc6ed; font-weight: bold; }
.question, .answer { display: block; }
.question { margin-top: 15rpx; color: #e7ecef; font-size: 21rpx; font-weight: bold; }
.answer { margin-top: 4rpx; color: #aeb9c1; font-size: 20rpx; line-height: 1.6; }
.footer-actions { padding: 22rpx; }
.bottom-space { height: 36rpx; }
.page.light { background: #e8dfc8; color: #2e352f; }
.page.light .topbar { background: #d5cab1; border-bottom-color: #948a74; }
.page.light .settings { color: #356b70; border-color: #58827d; }
.page.light .intro { background: #e0d6bf; border-bottom-color: #a79d86; }
.page.light .intro-title, .page.light .step-title { color: #29312b; }
.page.light .intro-text, .page.light .paragraph, .page.light .usage-row, .page.light .answer { color: #59645d; }
.page.light .step { border-bottom-color: #aaa087; }
.page.light .step:nth-child(even) { background: #e3dac4; }
.page.light .step-no { border-color: #527f77; color: #356b70; }
.page.light .button { border-color: #938974; color: #303832; }
.page.light .button.primary { background: #3f706b; border-color: #527f77; color: #fff; }
.page.light .url, .page.light .config-label, .page.light .config-hint { color: #69756d; }
.page.light .config-list, .page.light .config-row { border-color: #aaa087; }
.page.light .config-value, .page.light .question { color: #29312b; }
.page.light .copy { border-color: #688880; color: #356b70; }
.page.light .notice { background: #d4dfd7; }
.page.light .notice.danger { background: #ead5ce; }
.page.light .notice.disclaimer { background: #eadcbb; }
.page.light .notice.warning { background: #e6dcc2; }
.page.light .notice text { color: #4d5952; }
.page.light .notice-title { color: #29312b !important; }
.page.light .usage-index { color: #356b70; }
</style>
