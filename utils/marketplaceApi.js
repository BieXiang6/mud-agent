import { getPlatform, runtime } from './platform/index.js'
import { getReleaseApiBaseUrl } from './releaseApi.js'
import { getActiveLoginAccount } from './gameSessions.js'
import { normalizeMarketContent, normalizeMarketNickname } from './marketplaceModel.js'
import { getCustomAiSkills, getAiSkill, importCustomAiSkill, loadCustomAiSkills } from './ai/skills.js'
import { getAllStoredScripts, getStoredScript } from './ai/scriptStore.js'
import { importStoredScriptText } from './ai/scriptTransfer.js'

const IDENTITY_KEY = 'mud_market_private_identities_v1'
function storageKey(account) { return JSON.stringify([getReleaseApiBaseUrl(), account]) }
export function currentMarketAccount() { const active = getActiveLoginAccount(); return active ? active.account : '' }
export function getMarketIdentity(account = currentMarketAccount()) {
  if (!account) return null
  const saved = runtime.getStorageSync(IDENTITY_KEY)
  const identity = saved && typeof saved === 'object' ? saved[storageKey(account)] : null
  return identity && identity.account === account && /^[A-Za-z0-9_-]{43}$/.test(identity.privateSignature || '') ? { ...identity } : null
}
function saveIdentity(identity) {
  const saved = runtime.getStorageSync(IDENTITY_KEY)
  const identities = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {}
  identities[storageKey(identity.account)] = { id: identity.id, nickname: identity.nickname, account: identity.account, privateSignature: identity.privateSignature }
  runtime.setStorageSync(IDENTITY_KEY, identities)
}
export function currentMarketAuthor() {
  const identity = getMarketIdentity()
  return identity ? { id: identity.id, nickname: identity.nickname, account: identity.account } : null
}
export function requestMarket(path, { method = 'GET', data, token = '' } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const platform = getPlatform()
      const base = getReleaseApiBaseUrl()
      if (!base) throw new Error('请先配置发布服务地址 VITE_RELEASE_API_BASE_URL')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = 'Bearer ' + token
      platform.request({
        url: base + '/api/market' + path, method,
        // uni-app 使用 header/data，Electron 桥使用 headers/body。
        header: headers, headers, data, body: data == null ? '' : JSON.stringify(data), timeout: 15000,
        success(response) {
          const body = response && response.data
          if (response.statusCode >= 200 && response.statusCode < 300 && body && body.success) resolve(body.data)
          else {
            const error = new Error(body && body.error || '市场请求失败 (' + response.statusCode + ')')
            error.status = response.statusCode
            reject(error)
          }
        },
        fail(error) { reject(new Error(error && (error.errMsg || error.message) || '无法连接市场服务')) }
      })
    } catch (error) { reject(error) }
  })
}

export function listMarketItems({ type = '', q = '', owner = '', offset = 0 } = {}) {
  return requestMarket('/items?type=' + encodeURIComponent(type) + '&q=' + encodeURIComponent(q) + '&owner=' + encodeURIComponent(owner) + '&offset=' + offset)
}

export function getMarketItem(id) { return requestMarket('/items/' + encodeURIComponent(id)) }

export async function registerMarketIdentity(nickname) {
  const account = currentMarketAccount()
  if (!account) throw new Error('请先登录游戏账号')
  normalizeMarketNickname(nickname)
  if (getMarketIdentity(account)) throw new Error('此账号已保存昵称和私密签名，无需重复签发')
  const identity = await requestMarket('/identities', { method: 'POST', data: { nickname, account } })
  if (!identity || !/^[A-Za-z0-9_-]{43}$/.test(identity.privateSignature || '')) throw new Error('服务器返回的私密签名无效')
  saveIdentity(identity)
  return { id: identity.id, nickname: identity.nickname, account: identity.account }
}
export function parseMarketIdentityExport(text) {
  let bundle
  try { bundle = JSON.parse(String(text || '').replace(/^\uFEFF/, '')) } catch (_) { throw new Error('私密签名文件不是有效 JSON') }
  if (!bundle || bundle.format !== 'mud-agent-market-identity' || bundle.version !== 1 ||
    typeof bundle.account !== 'string' || !bundle.account.trim() || bundle.account.length > 100 ||
    !/^[A-Za-z0-9_-]{43}$/.test(bundle.privateSignature || '')) throw new Error('不是有效的市场私密签名文件')
  normalizeMarketNickname(bundle.nickname)
  return { nickname: bundle.nickname, account: bundle.account, privateSignature: bundle.privateSignature }
}
export function exportMarketIdentityText() {
  const identity = getMarketIdentity()
  if (!identity) throw new Error('当前游戏账号没有可导出的私密签名')
  return JSON.stringify({ format: 'mud-agent-market-identity', version: 1, nickname: identity.nickname,
    account: identity.account, privateSignature: identity.privateSignature }, null, 2)
}
export async function importMarketIdentityText(text, { replace = false } = {}) {
  const incoming = parseMarketIdentityExport(text)
  const current = getMarketIdentity(incoming.account)
  if (current && current.nickname !== incoming.nickname && !replace) throw new Error('该游戏账号已有其他昵称，请先导出旧签名再确认替换')
  const verified = await requestMarket('/permission', { method: 'POST', token: incoming.privateSignature,
    data: { author: { nickname: incoming.nickname, account: incoming.account } } })
  saveIdentity({ ...verified, privateSignature: incoming.privateSignature })
  return { id: verified.id, nickname: verified.nickname, account: verified.account }
}
export function checkMarketPermission() {
  const identity = getMarketIdentity()
  if (!identity) return Promise.reject(new Error('请先输入新昵称，或从旧客户端导入私密签名'))
  return requestMarket('/permission', { method: 'POST', data: { author: { nickname: identity.nickname, account: identity.account } }, token: identity.privateSignature })
}
export function publishMarketItem(input, id = '', expectedRevision, expectedAuthorId) {
  const identity = getMarketIdentity()
  if (!identity) throw new Error('请先输入新昵称，或从旧客户端导入私密签名')
  if (expectedAuthorId && identity.id !== expectedAuthorId) throw new Error('市场昵称已切换，请重新打开发布表单')
  const content = normalizeMarketContent(input)
  return requestMarket('/items' + (id ? '/' + encodeURIComponent(id) : ''), { method: id ? 'PUT' : 'POST',
    data: { ...content, author: { nickname: identity.nickname, account: identity.account }, ...(id ? { expectedRevision } : {}) }, token: identity.privateSignature })
}

export function listPublishableItems(type) {
  if (type === 'skill') { loadCustomAiSkills(); return getCustomAiSkills().map(skill => ({ ...skill, key: skill.name })) }
  return getAllStoredScripts().map(script => ({ ...script, key: script.id }))
}

export function deleteMarketItem(item, expectedAuthorId) {
  const identity = getMarketIdentity()
  if (!identity) throw new Error('请先登录市场昵称')
  if (expectedAuthorId && identity.id !== expectedAuthorId) throw new Error('市场昵称已切换，请重新确认删除')
  return requestMarket('/items/' + encodeURIComponent(item.id), { method: 'DELETE', token: identity.privateSignature,
    data: { author: { nickname: identity.nickname, account: identity.account }, expectedRevision: item.revision } })
}

export function installedMarketTarget(item) {
  if (item.type === 'skill') { loadCustomAiSkills(); return getAiSkill(item.name) }
  return getStoredScript('market-' + item.id) || getStoredScript(item.name)
}

export function marketItemFile(item) {
  const content = normalizeMarketContent(item)
  if (content.type === 'skill') return JSON.stringify(content.payload, null, 2)
  return JSON.stringify({ format: 'mud-agent-script', version: 1, script: { ...content.payload, id: 'market-' + item.id } }, null, 2)
}

export function installMarketItem(item) {
  const text = marketItemFile(item)
  if (item.type === 'skill') return importCustomAiSkill(text)
  return importStoredScriptText(text)
}
