export const LOGIN_PROFILES_KEY = 'mud_login_profiles'
export const ACTIVE_LOGIN_PROFILE_KEY = 'mud_active_login_profile'

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function profileEncoding(value) {
  return ['utf-8', 'utf8'].includes(String(value || '').toLowerCase().replace('_', '-')) ? 'utf-8' : 'gbk'
}

export function profileId(profile) {
  // 固定字段顺序，排除 id/更新时间；密码保留原始空格。此哈希仅用于去重。
  const input = JSON.stringify([
    clean(profile.host), clean(profile.port), clean(profile.account),
    typeof profile.password === 'string' ? profile.password : '',
    clean(profile.captcha), profileEncoding(profile.encoding)
  ])
  let a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index)
    a = b ^ Math.imul(a ^ code, 597399067)
    b = c ^ Math.imul(b ^ code, 2869860233)
    c = d ^ Math.imul(c ^ code, 951274213)
    d = a ^ Math.imul(d ^ code, 2716044179)
  }
  a = Math.imul(c ^ (a >>> 18), 597399067)
  b = Math.imul(d ^ (b >>> 22), 2869860233)
  c = Math.imul(a ^ (c >>> 17), 951274213)
  d = Math.imul(b ^ (d >>> 19), 2716044179)
  return [a ^ b ^ c ^ d, b ^ a, c ^ a, d ^ a]
    .map(value => (value >>> 0).toString(16).padStart(8, '0')).join('')
}

export function findSelectedProfile(profiles, id) {
  return profiles.find(profile => profile.id === id)
    // 兼容旧版仅以服务器和账号生成的已选记录标识。
    || profiles.find(profile => `${profile.host}:${profile.port}|${profile.account}` === id)
    || profiles[0]
}

export function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return null
  const normalized = {
    id: '',
    host: clean(profile.host),
    port: clean(profile.port),
    account: clean(profile.account),
    password: typeof profile.password === 'string' ? profile.password : '',
    captcha: clean(profile.captcha),
    encoding: profileEncoding(profile.encoding),
    updatedAt: Number(profile.updatedAt) || 0
  }
  if (!normalized.host || !normalized.port || !normalized.account || !normalized.password || !normalized.captcha) return null
  normalized.id = profileId(normalized)
  return normalized
}

export function normalizeProfiles(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value
    .map(normalizeProfile)
    .filter((profile) => {
      if (!profile || seen.has(profile.id)) return false
      seen.add(profile.id)
      return true
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function upsertProfile(profiles, profile) {
  const saved = normalizeProfile({ ...profile, updatedAt: Date.now() })
  if (!saved) return normalizeProfiles(profiles)
  return [saved, ...normalizeProfiles(profiles).filter((item) => item.id !== saved.id)]
}

export function removeProfile(profiles, id) {
  return normalizeProfiles(profiles).filter((profile) => profile.id !== id)
}
