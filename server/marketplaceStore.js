import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MARKET_DAILY_UPLOAD_LIMIT, MARKET_DELETE_ADMIN_NICKNAME, normalizeMarketContent, normalizeMarketNickname } from '../utils/marketplaceModel.js'

export class MarketError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
function validate(action) {
  try { return action() } catch (error) { throw new MarketError(400, error.message) }
}
export function tokenHash(token) { return createHash('sha256').update(token).digest('hex') }
function accountName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new MarketError(400, '请先登录有效的游戏账号')
  return value.trim()
}
async function readJson(file, fallback) {
  try { return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')) }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}
async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  const temp = file + '.' + randomUUID() + '.tmp'
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  await rename(temp, file)
}
export function createMarketplaceStore({ dataDir, clock = Date.now }) {
  const itemsFile = path.join(dataDir, 'items.json')
  const identitiesFile = path.join(dataDir, 'identities.json')
  const blockedAccountsFile = path.join(dataDir, 'blocked-accounts.json')
  let pending = Promise.resolve()
  function serialize(action) {
    const result = pending.then(action)
    pending = result.catch(() => {})
    return result
  }
  async function readArray(file) {
    const value = await readJson(file, [])
    if (!Array.isArray(value)) throw new Error('市场存储格式错误')
    return value
  }
  function uploadDay(timestamp) {
    return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }
  function quotaKey(account, timestamp = clock()) {
    return JSON.stringify([uploadDay(timestamp), account])
  }
  async function readMarket() {
    const value = await readJson(itemsFile, [])
    if (Array.isArray(value)) {
      // 旧条目与当天计数一同迁移，后续删除条目不会返还额度。
      const uploadCounts = {}
      for (const item of value) {
        if (!item.author || typeof item.author.account !== 'string' || !Number.isFinite(item.createdAt)) continue
        const key = quotaKey(item.author.account, item.createdAt)
        uploadCounts[key] = (uploadCounts[key] || 0) + 1
      }
      return { version: 2, items: value, uploadCounts }
    }
    if (!value || value.version !== 2 || !Array.isArray(value.items) || !value.uploadCounts || typeof value.uploadCounts !== 'object' || Array.isArray(value.uploadCounts)) {
      throw new Error('市场内容和每日额度存储格式错误')
    }
    return value
  }
  function dailyQuota(identity, market, timestamp = clock()) {
    const day = uploadDay(timestamp)
    const unlimited = identity.nickname === MARKET_DELETE_ADMIN_NICKNAME
    const used = Number(market.uploadCounts[quotaKey(identity.account, timestamp)]) || 0
    return { day, timeZone: 'Asia/Shanghai', unlimited, limit: unlimited ? null : MARKET_DAILY_UPLOAD_LIMIT,
      used, remaining: unlimited ? null : Math.max(0, MARKET_DAILY_UPLOAD_LIMIT - used),
      resetAt: Date.parse(day + 'T00:00:00+08:00') + 24 * 60 * 60 * 1000 }
  }
  function publicIdentity(identity) {
    return { id: identity.id, nickname: identity.nickname, account: identity.account }
  }
  async function checkAllowed(identity) {
    if (identity.blocked || (await readArray(blockedAccountsFile)).includes(identity.account)) {
      throw new MarketError(403, '当前昵称或游戏账号已被禁止上传、更新和删除')
    }
  }
  async function authenticate(author, signature) {
    const nickname = validate(() => normalizeMarketNickname(author && author.nickname))
    const identity = (await readArray(identitiesFile)).find(item => item.nicknameKey === nickname.key)
    if (!identity || typeof signature !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(signature) ||
      !/^[a-f0-9]{64}$/.test(identity.signatureHash || '') ||
      !timingSafeEqual(Buffer.from(tokenHash(signature), 'hex'), Buffer.from(identity.signatureHash, 'hex'))) {
      throw new MarketError(401, '私密签名无效，请从旧客户端导出签名后导入；服务器不会重复签发已有昵称')
    }
    if (author.account != null && accountName(author.account) !== identity.account) throw new MarketError(403, '此昵称绑定了其他游戏账号，请登录对应账号')
    await checkAllowed(identity)
    return identity
  }
  function summary({ payload, ...metadata }) { return metadata }
  return {
    registerIdentity(input) {
      return serialize(async () => {
        const nickname = validate(() => normalizeMarketNickname(input.nickname))
        const account = accountName(input.account)
        const identities = await readArray(identitiesFile)
        const existing = identities.find(item => item.nicknameKey === nickname.key)
        if (existing) {
          if (existing.blocked) throw new MarketError(403, '此昵称已被禁止使用')
          throw new MarketError(409, '昵称已存在，请在旧客户端导出私密签名，并在此客户端导入后继续使用')
        }
        await checkAllowed({ account, blocked: false })
        if (identities.some(item => item.account === account && item.signatureHash)) {
          throw new MarketError(409, '此游戏账号已绑定昵称，请从旧客户端导出私密签名并导入后继续使用')
        }
        const privateSignature = randomBytes(32).toString('base64url')
        const identity = { id: randomUUID(), nickname: nickname.name, nicknameKey: nickname.key, account,
          signatureHash: tokenHash(privateSignature), blocked: false, createdAt: clock() }
        identities.push(identity)
        await writeJson(identitiesFile, identities)
        return { ...publicIdentity(identity), privateSignature, canUpload: true }
      })
    },
    async permission(author, signature) {
      const identity = await authenticate(author, signature)
      return { ...publicIdentity(identity), authorId: identity.id, canUpload: true, canDeleteAll: identity.nickname === MARKET_DELETE_ADMIN_NICKNAME,
        dailyUploadQuota: dailyQuota(identity, await readMarket()) }
    },
    async list({ type, q = '', owner = '', offset = 0, limit = 20 } = {}) {
      if (type && !['skill', 'script'].includes(type)) throw new MarketError(400, '无效的市场类型')
      const query = String(q).trim().toLowerCase().slice(0, 200)
      const start = Math.max(0, Math.trunc(Number(offset) || 0))
      const count = Math.max(1, Math.min(50, Math.trunc(Number(limit) || 20)))
      const items = (await readMarket()).items.filter(item => (!type || item.type === type) && (!owner || item.authorId === owner) &&
        (!query || [item.name, item.description, item.author.nickname || item.author.account].some(value => value.toLowerCase().includes(query))))
        .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
      return { items: items.slice(start, start + count).map(summary), total: items.length, offset: start, limit: count }
    },
    async get(id) {
      const item = (await readMarket()).items.find(item => item.id === id)
      if (!item) throw new MarketError(404, '市场内容不存在')
      return item
    },
    publish(input, signature, id = '') {
      return serialize(async () => {
        const identity = await authenticate(input.author, signature)
        const content = validate(() => normalizeMarketContent(input))
        const market = await readMarket()
        const items = market.items
        const existing = id ? items.find(item => item.id === id) : null
        if (id && !existing) throw new MarketError(404, '市场内容不存在')
        if (existing && existing.authorId !== identity.id) throw new MarketError(403, '只有持有原作者私密签名的客户端可以更新此内容')
        if (existing && existing.type !== content.type) throw new MarketError(400, '更新时不能改变内容类型')
        if (existing && input.expectedRevision !== existing.revision) throw new MarketError(409, '内容已更新，请刷新市场后重试')
        if (items.some(item => item.id !== id && item.type === content.type && item.authorId === identity.id && item.name.toLowerCase() === content.name.toLowerCase())) {
          throw new MarketError(409, '你已发布同名内容，请从市场选择该内容并更新')
        }
        if (existing && existing.version === content.version) throw new MarketError(409, '更新内容时请填写新的版本号')
        const timestamp = clock()
        const quota = dailyQuota(identity, market, timestamp)
        if (!existing && !quota.unlimited && quota.remaining === 0) {
          throw new MarketError(429, '该游戏账号今日已新上传 4 个 Skill 或脚本，请在北京时间明日零点后再上传；更新已有内容不受影响')
        }
        const now = Math.max(timestamp, existing ? existing.updatedAt + 1 : 0)
        const item = { id: existing ? existing.id : randomUUID(), ...content,
          authorId: identity.id, author: { nickname: identity.nickname, account: identity.account },
          revision: existing ? existing.revision + 1 : 1, createdAt: existing ? existing.createdAt : now, updatedAt: now }
        if (existing) items[items.indexOf(existing)] = item
        else items.push(item)
        if (!existing && !quota.unlimited) {
          const key = quotaKey(identity.account, now)
          market.uploadCounts[key] = quota.used + 1
        }
        // 条目和计数以同一份快照原子提交，失败请求不消耗次数。
        await writeJson(itemsFile, market)
        return summary(item)
      })
    },
    remove(id, input, signature) {
      return serialize(async () => {
        const identity = await authenticate(input.author, signature)
        const market = await readMarket()
        const items = market.items
        const existing = items.find(item => item.id === id)
        if (!existing) throw new MarketError(404, '市场内容不存在或已被删除')
        if (existing.authorId !== identity.id && identity.nickname !== MARKET_DELETE_ADMIN_NICKNAME) {
          throw new MarketError(403, '只能删除自己发布的市场内容')
        }
        if (input.expectedRevision !== existing.revision) throw new MarketError(409, '内容已更新，请刷新市场后再删除')
        market.items = items.filter(item => item.id !== id)
        await writeJson(itemsFile, market)
        return { id, deleted: true }
      })
    },
    setBlocked(value, blocked) {
      return serialize(async () => {
        const nickname = validate(() => normalizeMarketNickname(value))
        const identities = await readArray(identitiesFile)
        let identity = identities.find(item => item.nicknameKey === nickname.key)
        if (!identity) {
          if (!blocked) throw new MarketError(404, '昵称不存在')
          identity = { id: randomUUID(), nickname: nickname.name, nicknameKey: nickname.key, account: '', signatureHash: '' }
          identities.push(identity)
        }
        identity.blocked = Boolean(blocked)
        // 未注册的预禁用昵称解禁后重新开放注册。
        await writeJson(identitiesFile, identities.filter(item => item.signatureHash || item.blocked))
        return { nickname: nickname.name, blocked: Boolean(blocked) }
      })
    },
    setAccountBlocked(value, blocked) {
      return serialize(async () => {
        const account = accountName(value)
        const accounts = new Set(await readArray(blockedAccountsFile))
        if (blocked) accounts.add(account)
        else accounts.delete(account)
        await writeJson(blockedAccountsFile, Array.from(accounts))
        return { account, blocked: Boolean(blocked) }
      })
    }
  }
}
