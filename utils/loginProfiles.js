export const LOGIN_PROFILES_KEY = 'mud_login_profiles'
export const ACTIVE_LOGIN_PROFILE_KEY = 'mud_active_login_profile'

const MAX_PROFILES = 8

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function profileId(profile) {
  return `${clean(profile.host)}:${clean(profile.port)}|${clean(profile.account)}`
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
    .slice(0, MAX_PROFILES)
}

export function upsertProfile(profiles, profile) {
  const saved = normalizeProfile({ ...profile, updatedAt: Date.now() })
  if (!saved) return normalizeProfiles(profiles)
  return [saved, ...normalizeProfiles(profiles).filter((item) => item.id !== saved.id)].slice(0, MAX_PROFILES)
}

export function removeProfile(profiles, id) {
  return normalizeProfiles(profiles).filter((profile) => profile.id !== id)
}
