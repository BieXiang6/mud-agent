<template>
  <view class="page" :class="{ light: gameState.themeMode === 'light' }" :style="appStyle">
    <view class="topbar">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">Skill 与脚本市场</text>
      <view class="market-button identity-open" @tap="openIdentity">{{ author ? author.nickname : '登录' }}</view>
      <view class="market-button" @tap="openPublisher()">上传</view>
    </view>
    <view class="market-tools">
      <view class="filters">
        <view v-for="tab in tabs" :key="tab.type" class="market-button" :class="{ active: type === tab.type }" @tap="changeType(tab.type)">{{ tab.label }}</view>
      </view>
      <view class="search-row">
        <input v-model="query" class="input search" maxlength="200" placeholder="搜索名字、描述或作者昵称" @confirm="search" />
        <view class="market-button" @tap="search">搜索</view>
      </view>
    </view>
    <scroll-view :key="listRevision" scroll-y class="market-list">
      <view v-if="error" class="error">{{ error }}</view>
      <view v-if="loading" class="empty">正在加载市场…</view>
      <view v-else-if="!items.length" class="empty">暂无匹配内容</view>
      <view v-for="item in items" :key="item.id" class="card">
        <view class="card-head"><text class="name">{{ item.name }}</text><text class="tag">{{ item.type === 'skill' ? 'Skill' : '脚本' }}</text></view>
        <text class="description description-preview">{{ descriptionPreview(item.description) }}</text>
        <text class="meta">作者：{{ item.author.nickname || item.author.account }} · 版本：{{ item.version }}</text>
        <text class="meta">更新日期：{{ date(item.updatedAt) }}</text>
        <view class="actions">
          <view class="market-button primary" @tap="preview(item)">查看与下载</view>
          <view v-if="isOwner(item)" class="market-button" @tap="openPublisher(item)">更新内容</view>
          <view v-if="canDelete(item)" class="market-button danger" :class="{ disabled: busy }" @tap="removeItem(item)">删除</view>
        </view>
      </view>
      <view class="list-bottom-space" />
    </scroll-view>
    <view class="pagination">
        <view class="market-button" :class="{ disabled: offset === 0 || loading }" @tap="page(-1)">上一页</view>
        <text class="hint">{{ total }} 项 · 第 {{ Math.floor(offset / 20) + 1 }} 页</text>
        <view class="market-button" :class="{ disabled: offset + 20 >= total || loading }" @tap="page(1)">下一页</view>
    </view>

    <view v-if="identityVisible" class="mask" @tap="closeIdentity">
      <scroll-view scroll-y class="dialog credential" @tap.stop>
        <view class="card-head"><text class="name">{{ author ? '市场账号' : '市场登录' }}</text><view class="market-button" @tap="closeIdentity">关闭</view></view>
        <text class="hint">{{ account ? '绑定游戏账号：' + account : '登录游戏后可绑定账号和注册昵称' }}</text>
        <template v-if="author">
          <text class="hint">昵称：{{ author.nickname }} · 本机已保存私密签名</text>
          <text class="hint">换客户端时，先在此导出签名，再在新客户端导入。同一账号换服务器或区服无需重新注册。</text>
          <view class="actions"><view class="market-button" :class="{ disabled: busy }" @tap="exportIdentity">导出私密签名</view><view class="market-button" :class="{ disabled: busy }" @tap="refreshPermission">检查上传权限</view></view>
        </template>
        <template v-else>
          <text class="hint">首次使用只需输入未注册昵称，服务器自动签发并保存在本机。已有昵称必须从旧客户端导入签名。</text>
          <input v-model="nickname" class="input" maxlength="40" placeholder="输入唯一昵称" />
          <view class="actions"><view class="market-button primary" :class="{ disabled: !account || busy }" @tap="registerIdentity">注册昵称并继续</view></view>
        </template>
        <view class="actions"><view class="market-button" :class="{ disabled: busy }" @tap="importIdentity">导入私密签名</view></view>
        <text v-if="permissionMessage" class="hint">{{ permissionMessage }}</text>
      </scroll-view>
    </view>

    <view v-if="selected" class="mask" @tap="closePreview">
      <view class="dialog" @tap.stop>
        <view class="card-head"><text class="name">{{ selected.name }}</text><view class="market-button" @tap="closePreview">关闭</view></view>
        <text class="description">{{ selected.description }}</text>
        <text class="meta">作者：{{ selected.author.nickname || selected.author.account }} · 版本：{{ selected.version }}</text>
        <text class="meta">更新日期：{{ date(selected.updatedAt) }}</text>
        <textarea class="source" :value="selected.type === 'skill' ? selected.payload.content : selected.payload.source" disabled maxlength="-1" />
        <text v-if="detailMessage" class="hint">{{ detailMessage }}</text>
        <view class="actions">
          <view class="market-button primary" :class="{ disabled: busy }" @tap="download">下载到本机</view>
          <view class="market-button" :class="{ disabled: busy }" @tap="exportFile">另存为文件</view>
          <view v-if="canDelete(selected)" class="market-button danger" :class="{ disabled: busy }" @tap="removeItem(selected)">删除</view>
        </view>
      </view>
    </view>

    <view v-if="publisher" class="mask" @tap="closePublisher">
      <scroll-view scroll-y class="dialog" @tap.stop>
        <view class="card-head"><text class="name">{{ publisher.id ? '更新市场内容' : '上传到市场' }}</text><view class="market-button" @tap="closePublisher">关闭</view></view>
        <text class="hint">作者：{{ author ? author.nickname : '' }}</text>
        <text v-if="uploadQuota" class="hint">{{ uploadQuota.unlimited ? '此昵称不受每日上传数量限制' : '今日新上传 ' + uploadQuota.used + '/' + uploadQuota.limit + ' 个，Skill 与脚本合并计算，北京时间零点重置；更新不计入次数' }}</text>
        <text v-if="publisher.id" class="hint">当前版本：{{ publisher.previousVersion }}，请填写新的版本。</text>
        <view v-if="!publisher.id" class="filters">
          <view class="market-button" :class="{ active: publisher.type === 'skill' }" @tap="changePublishType('skill')">Skill</view>
          <view class="market-button" :class="{ active: publisher.type === 'script' }" @tap="changePublishType('script')">脚本</view>
        </view>
        <text class="label">选择本机已保存的内容</text>
        <scroll-view scroll-y class="local-list">
          <text v-if="!localItems.length" class="hint">本机暂无此类内容，请先在 Skills 或脚本页创建。</text>
          <view v-for="local in localItems" :key="local.key" class="local-row" :class="{ active: publisher.localKey === local.key }" @tap="chooseLocal(local)">{{ local.name }}</view>
        </scroll-view>
        <text class="label">名字</text><input v-model="publisher.name" class="input" maxlength="80" placeholder="Skill 名字使用小写字母、数字和连字符" />
        <text class="label">描述</text><textarea v-model="publisher.description" class="description-input input" maxlength="500" placeholder="说明用途及适用条件" />
        <text class="label">版本</text><input v-model="publisher.version" class="input" maxlength="40" placeholder="例如 1.0.0" />
        <text v-if="publishError" class="error">{{ publishError }}</text>
        <view class="actions"><view class="market-button primary" :class="{ disabled: busy || !publisher.localKey }" @tap="publish">{{ busy ? '正在提交…' : publisher.id ? '提交更新' : '上传发布' }}</view></view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onShow } from '@/utils/platform/lifecycle.js'
import { state as gameState } from '@/utils/store.js'
import { appStyle } from '@/utils/appearance.js'
import { runtime } from '@/utils/platform/index.js'
import { MARKET_DELETE_ADMIN_NICKNAME } from '@/utils/marketplaceModel.js'
import { checkMarketPermission, currentMarketAccount, currentMarketAuthor, deleteMarketItem, exportMarketIdentityText, getMarketIdentity, getMarketItem, importMarketIdentityText, installMarketItem, installedMarketTarget, listMarketItems, listPublishableItems, marketItemFile, parseMarketIdentityExport, publishMarketItem, registerMarketIdentity } from '@/utils/marketplaceApi.js'

const tabs = [{ type: '', label: '全部' }, { type: 'skill', label: 'Skills' }, { type: 'script', label: '脚本' }]
const type = ref(''), query = ref(''), items = ref([]), offset = ref(0), total = ref(0)
const loading = ref(false), busy = ref(false), error = ref(''), author = ref(null), permissionMessage = ref('')
const account = ref(''), nickname = ref('')
const identityVisible = ref(false)
const listRevision = ref(0)
const uploadQuota = ref(null)
const selected = ref(null), detailMessage = ref(''), publisher = ref(null), localItems = ref([]), publishError = ref('')
let requestSequence = 0
function descriptionPreview(value) {
  const characters = Array.from(String(value || '').replace(/\s+/g, ' ').trim())
  return characters.length > 80 ? characters.slice(0, 80).join('') + '…' : characters.join('')
}
function date(value) {
  const d = new Date(value)
  const pad = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}
function syncAuthor() { account.value = currentMarketAccount(); author.value = currentMarketAuthor(); permissionMessage.value = '' }
function openIdentity() {
  if (busy.value) return
  syncAuthor()
  identityVisible.value = true
}
function closeIdentity() { if (!busy.value) identityVisible.value = false }
function isOwner(item) { return author.value && author.value.id === item.authorId }
function canDelete(item) { return author.value && (isOwner(item) || author.value.nickname === MARKET_DELETE_ADMIN_NICKNAME) }
async function removeItem(item) {
  if (busy.value || !canDelete(item)) return
  const identityId = author.value.id
  busy.value = true
  try {
    const confirmed = await new Promise(resolve => runtime.showModal({ title: '删除市场内容',
      content: '确定删除“' + item.name + '”？删除后市场中将无法下载，本机已下载的内容会保留。',
      confirmText: '删除', confirmColor: '#bd514a', success: result => resolve(result.confirm), fail: () => resolve(false) }))
    if (!confirmed) return
    await deleteMarketItem(item, identityId)
    if (selected.value && selected.value.id === item.id) selected.value = null
    if (items.value.length === 1 && offset.value > 0) offset.value = Math.max(0, offset.value - 20)
    await refresh()
    runtime.showToast({ title: '市场内容已删除', icon: 'success' })
  } catch (e) {
    if (selected.value && selected.value.id === item.id) detailMessage.value = e.message
    else error.value = e.message
  } finally { busy.value = false }
}
async function registerIdentity() {
  if (busy.value || !account.value) return
  busy.value = true; permissionMessage.value = ''
  try { await registerMarketIdentity(nickname.value); syncAuthor(); permissionMessage.value = '昵称已注册，私密签名已自动保存。现在可以上传。' }
  catch (e) { permissionMessage.value = e.message }
  finally { busy.value = false }
}
async function exportIdentity() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await runtime.exportTextFile({ title: '导出市场私密签名', filterName: '市场私密签名', suggestedName: 'mud-market-identity.json', mimeType: 'application/json', maxBytes: 16 * 1024, text: exportMarketIdentityText() })
    if (result) permissionMessage.value = '签名已导出：' + (result.path || result.name || '完成') + '。此文件可用于使用你的市场身份，请妥善保存。'
  } catch (e) { permissionMessage.value = e.message }
  finally { busy.value = false }
}
async function importIdentity() {
  if (busy.value) return
  busy.value = true
  try {
    const file = await runtime.importTextFile({ title: '导入旧客户端私密签名', filterName: '市场私密签名', accept: '.json,application/json', extensions: ['json'], mimeType: 'application/json', maxBytes: 16 * 1024 })
    if (!file) return
    const incoming = parseMarketIdentityExport(file.text)
    const existing = getMarketIdentity(incoming.account)
    if (existing && existing.nickname !== incoming.nickname && !await confirmOverwrite('游戏账号 ' + incoming.account + ' 的市场昵称与私密签名')) return
    const identity = await importMarketIdentityText(file.text, { replace: true })
    syncAuthor()
    permissionMessage.value = '已导入昵称“' + identity.nickname + '”。' + (identity.account === account.value ? '可以继续上传和更新。' : '请登录绑定的游戏账号 ' + identity.account + ' 后使用。')
  } catch (e) { permissionMessage.value = e.message }
  finally { busy.value = false }
}
async function refresh() {
  const sequence = ++requestSequence
  loading.value = true; error.value = ''
  try {
    const result = await listMarketItems({ type: type.value, q: query.value, offset: offset.value })
    if (sequence !== requestSequence) return
    items.value = result.items; total.value = result.total
    listRevision.value++
  } catch (e) { if (sequence === requestSequence) { items.value = []; total.value = 0; error.value = e.message } }
  finally { if (sequence === requestSequence) loading.value = false }
}
function search() { offset.value = 0; refresh() }
function changeType(value) { type.value = value; search() }
function page(direction) {
  if (loading.value || direction < 0 && offset.value === 0 || direction > 0 && offset.value + 20 >= total.value) return
  offset.value += direction * 20; refresh()
}
async function refreshPermission() {
  if (busy.value || !author.value) return
  busy.value = true; permissionMessage.value = ''
  try { const permission = await checkMarketPermission(); uploadQuota.value = permission.dailyUploadQuota; permissionMessage.value = '当前游戏账号可以上传和更新自己的内容' }
  catch (e) { permissionMessage.value = e.message }
  finally { busy.value = false }
}
async function preview(item) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { selected.value = await getMarketItem(item.id); detailMessage.value = '' }
  catch (e) { error.value = e.message }
  finally { busy.value = false }
}
function closePreview() { if (!busy.value) selected.value = null }
function confirmOverwrite(name) {
  return new Promise(resolve => runtime.showModal({ title: '替换本机同名内容', content: '本机已有“' + name + '”，是否用此市场内容替换？', success: result => resolve(result.confirm), fail: () => resolve(false) }))
}
async function download() {
  if (busy.value || !selected.value) return
  busy.value = true; detailMessage.value = ''
  try {
    const item = selected.value
    if (installedMarketTarget(item) && !await confirmOverwrite(item.name)) return
    installMarketItem(item)
    detailMessage.value = '已下载到本机，可返回 ' + (item.type === 'skill' ? 'Skills 页选择使用' : '游戏脚本页查看和运行')
  } catch (e) { detailMessage.value = e.message }
  finally { busy.value = false }
}
async function exportFile() {
  if (busy.value || !selected.value) return
  busy.value = true
  try {
    const item = selected.value
    const result = await runtime.exportTextFile({ title: '下载市场内容', filterName: 'JSON 内容包', suggestedName: 'mud-' + item.type + '-' + item.name.replace(/[^a-zA-Z0-9_-]/g, '-') + '.json', mimeType: 'application/json', text: marketItemFile(item), maxBytes: 256 * 1024 })
    if (result) detailMessage.value = '已保存：' + (result.path || result.name || item.name)
  } catch (e) { detailMessage.value = e.message }
  finally { busy.value = false }
}
async function openPublisher(item) {
  if (busy.value) return
  syncAuthor()
  if (!author.value) {
    error.value = ''
    openIdentity()
    return
  }
  if (item && !isOwner(item)) { error.value = '只有持有原作者私密签名的客户端可以更新'; return }
  busy.value = true; error.value = ''
  try {
    const permission = await checkMarketPermission()
    uploadQuota.value = permission.dailyUploadQuota
    publisher.value = { id: item ? item.id : '', expectedRevision: item ? item.revision : undefined, previousVersion: item ? item.version : '', type: item ? item.type : type.value || 'skill', name: item ? item.name : '', description: item ? item.description : '', version: item ? '' : '1.0.0', localKey: '', authorKey: author.value.id }
    localItems.value = listPublishableItems(publisher.value.type)
    publishError.value = ''
  } catch (e) { error.value = e.message }
  finally { busy.value = false }
}
function closePublisher() { if (!busy.value) publisher.value = null }
function changePublishType(value) {
  if (busy.value || publisher.value.id) return
  publisher.value.type = value; publisher.value.localKey = ''; publisher.value.name = ''; publisher.value.description = ''
  localItems.value = listPublishableItems(value)
}
function chooseLocal(local) {
  if (busy.value) return
  publisher.value.localKey = local.key; publisher.value.name = local.name; publisher.value.description = local.description
}
async function publish() {
  if (busy.value || !publisher.value || !publisher.value.localKey) return
  busy.value = true; publishError.value = ''
  try {
    const form = publisher.value
    const local = listPublishableItems(form.type).find(item => item.key === form.localKey)
    if (!local) throw new Error('本机内容已删除，请重新选择')
    await publishMarketItem({ type: form.type, name: form.name, description: form.description, version: form.version, payload: local }, form.id, form.expectedRevision, form.authorKey)
    publisher.value = null; offset.value = 0; await refresh()
    runtime.showToast({ title: '市场内容已发布', icon: 'success' })
  } catch (e) { publishError.value = e.message }
  finally { busy.value = false }
}
function goBack() { if (!busy.value) runtime.navigateBack() }
onLoad(options => { if (options && ['skill', 'script'].includes(options.type)) type.value = options.type })
onShow(() => {
  syncAuthor(); refresh()
  if (author.value) checkMarketPermission().then(() => { permissionMessage.value = '当前游戏账号可以上传和更新自己的内容' }).catch(e => { permissionMessage.value = e.message })
})
</script>

<style scoped>
.page { height: 100vh; display: flex; flex-direction: column; overflow: hidden; background: #0c0f12; color: #edf1f4; }
.topbar { flex: none; height: calc(76rpx + var(--status-bar-height)); padding: var(--status-bar-height) 18rpx 0; box-sizing: border-box; display: flex; align-items: center; gap: 12rpx; background: #151a1f; border-bottom: 1rpx solid #303840; }
.back { width: 48rpx; text-align: center; font-size: 48rpx; }
.title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 27rpx; font-weight: bold; }
.identity-open { max-width: 140rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.market-tools { flex: none; padding: 18rpx 18rpx 0; box-sizing: border-box; }
.market-list { flex: 1; height: 0; min-height: 0; padding: 0 18rpx; box-sizing: border-box; overscroll-behavior: contain; }
.filters, .search-row, .actions, .card-head, .pagination { display: flex; align-items: center; gap: 12rpx; flex-wrap: wrap; }
.filters, .search-row { margin-bottom: 14rpx; }
.card-head { justify-content: space-between; margin-bottom: 12rpx; }
.input { width: 100%; min-height: 64rpx; margin: 8rpx 0; padding: 10rpx 14rpx; box-sizing: border-box; background: #0d1114; border: 1rpx solid #3b454e; color: #edf1f4; font-size: 23rpx; }
.search { flex: 1; width: 0; min-width: 160rpx; }
.market-button { flex: none; padding: 12rpx 18rpx; border: 1rpx solid #44627c; border-radius: 6rpx; color: #b9daf5; font-size: 22rpx; }
.market-button.active, .local-row.active { background: #23465f; border-color: #559aca; }
.market-button.primary { background: #24699e; border-color: #3d83b8; color: #fff; }
.market-button.danger { border-color: #9a514b; color: #edaaa4; }
.disabled { opacity: .45; }
.card { margin-top: 16rpx; padding: 20rpx; border: 1rpx solid #303840; border-radius: 10rpx; background: #12171b; }
.name { font-size: 27rpx; font-weight: bold; overflow-wrap: anywhere; }
.tag { font-size: 20rpx; color: #a9c7e8; }
.description, .meta, .hint, .label { display: block; overflow-wrap: anywhere; }
.description { margin-bottom: 14rpx; font-size: 24rpx; line-height: 1.6; white-space: pre-wrap; }
.description-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; max-height: 3.2em; overflow: hidden; white-space: normal; }
.meta, .hint { font-size: 21rpx; line-height: 1.6; color: #9caab5; }
.label { font-size: 23rpx; margin-top: 14rpx; }
.actions { margin-top: 16rpx; }
.error { padding: 12rpx 0; color: #ef9999; font-size: 23rpx; }
.empty { padding: 60rpx 0; text-align: center; color: #9caab5; font-size: 24rpx; }
.pagination { flex: none; justify-content: center; padding: 14rpx 18rpx calc(14rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #303840; }
.list-bottom-space { height: 18rpx; }
.mask { position: fixed; inset: 0; z-index: 30; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; padding: 24rpx; box-sizing: border-box; }
.dialog { width: 100%; max-width: 1000rpx; max-height: 85vh; padding: 24rpx; box-sizing: border-box; background: #151a1f; border: 1rpx solid #44627c; border-radius: 12rpx; overflow-y: auto; }
.source { width: 100%; height: 32vh; margin-top: 16rpx; box-sizing: border-box; padding: 16rpx; background: #0d1114; color: #d1dde5; font-size: 21rpx; font-family: monospace; }
.local-list { height: 180rpx; margin: 12rpx 0; border: 1rpx solid #3b454e; }
.local-row { padding: 16rpx; border-bottom: 1rpx solid #303840; font-size: 24rpx; }
.description-input { height: 120rpx; }
.page.light { background: #e8dfc8; color: #2e352f; }
.light .topbar, .light .dialog { background: #e1d6bc; border-color: #948a74; }
.light .card { background: #f1e8d2; border-color: #a29881; }
.light .pagination { border-top-color: #a29881; }
.light .input, .light .source { background: #fff8e7; color: #29312b; border-color: #9e947d; }
.light .meta, .light .hint, .light .empty { color: #626c63; }
.light .market-button, .light .tag { color: #365f64; border-color: #6b8b80; }
.light .market-button.primary, .light .market-button.active, .light .local-row.active { background: #3f706b; color: #fff; }
.light .error { color: #963d38; }
.light .market-button.danger { border-color: #9b5750; color: #963d38; }
</style>
