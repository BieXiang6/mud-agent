import { runtime } from '../platform/index.js'
import { clientConfig } from '../config.js'

const PROFILES_STORAGE_KEY = 'mud_ai_model_profiles_v1'
const SELECTED_PROFILE_STORAGE_KEY = 'mud_ai_selected_model_profile'
const COMMAND_BLACKLIST_STORAGE_KEY = 'mud_ai_command_blacklist'
const LEGACY_MODEL_STORAGE_KEY = 'mud_ai_model'
const LEGACY_BASE_URL_STORAGE_KEY = 'mud_ai_base_url'
const LEGACY_PROTOCOL_STORAGE_KEY = 'mud_ai_protocol'
const LEGACY_API_KEY_STORAGE_KEY = 'mud_ai_api_key'

const DEFAULT_MODEL = clientConfig.ai.defaultModel
const DEFAULT_BASE_URL = clientConfig.ai.defaultBaseUrl
const DEFAULT_PROTOCOL = clientConfig.ai.defaultProtocol
const DEFAULT_CONTEXT_WINDOW = clientConfig.ai.defaultContextWindow
const DEFAULT_MAX_TOKENS = clientConfig.ai.defaultMaxTokens

function storageGet(key) {
  return runtime.getStorageSync(key)
}

function storageSet(key, value) {
  runtime.setStorageSync(key, value)
}

function profileId() {
  return 'model-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value)
  return Math.max(min, Math.min(Number.isFinite(number) ? number : fallback, max))
}

export function createModelProfile(overrides = {}) {
  return {
    id: String(overrides.id || profileId()),
    name: String(overrides.name || '默认模型').trim().slice(0, 40) || '未命名模型',
    model: String(overrides.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    baseUrl: String(overrides.baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL,
    apiKey: String(overrides.apiKey || '').trim(),
    protocol: overrides.protocol === 'openai-responses' || overrides.protocol === 'openai-completions'
      ? overrides.protocol
      : DEFAULT_PROTOCOL,
    contextWindow: boundedNumber(overrides.contextWindow, DEFAULT_CONTEXT_WINDOW, 4096, 2000000),
    maxTokens: boundedNumber(overrides.maxTokens, DEFAULT_MAX_TOKENS, 256, 1000000),
    compressionThreshold: boundedNumber(overrides.compressionThreshold, 80, 50, 95),
    keepRecentTurns: boundedNumber(overrides.keepRecentTurns, 3, 1, 20)
  }
}

export function validateModelProfile(profile) {
  const value = profile || {}
  const requiredText = [
    ['name', '配置名称'],
    ['apiKey', 'API Key'],
    ['baseUrl', 'Base URL'],
    ['protocol', '协议'],
    ['model', '模型 ID']
  ]
  for (const [key, label] of requiredText) {
    if (!String(value[key] == null ? '' : value[key]).trim()) throw new Error('请填写' + label)
  }
  if (value.protocol !== 'openai-responses' && value.protocol !== 'openai-completions') {
    throw new Error('请选择有效协议')
  }
  const requiredNumbers = [
    ['contextWindow', '上下文窗口', 4096, 2000000],
    ['maxTokens', '最大输出', 256, 1000000],
    ['compressionThreshold', '压缩阈值', 50, 95],
    ['keepRecentTurns', '保留最近轮数', 1, 20]
  ]
  for (const [key, label, min, max] of requiredNumbers) {
    const raw = String(value[key] == null ? '' : value[key]).trim()
    const number = Number(raw)
    if (!raw) throw new Error('请填写' + label)
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new Error(label + '必须在 ' + min + ' 到 ' + max + ' 之间')
    }
  }
  return true
}

function readProfiles() {
  const raw = storageGet(PROFILES_STORAGE_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(String(raw))
      if (Array.isArray(parsed) && parsed.length) return parsed.map(createModelProfile)
    } catch (_) {}
  }
  const migrated = createModelProfile({
    name: '默认模型',
    model: storageGet(LEGACY_MODEL_STORAGE_KEY) || DEFAULT_MODEL,
    baseUrl: storageGet(LEGACY_BASE_URL_STORAGE_KEY) || DEFAULT_BASE_URL,
    protocol: storageGet(LEGACY_PROTOCOL_STORAGE_KEY) || DEFAULT_PROTOCOL,
    apiKey: storageGet(LEGACY_API_KEY_STORAGE_KEY) || ''
  })
  storageSet(PROFILES_STORAGE_KEY, JSON.stringify([migrated]))
  storageSet(SELECTED_PROFILE_STORAGE_KEY, migrated.id)
  return [migrated]
}

export function loadModelConfig() {
  const profiles = readProfiles()
  const savedSelectedId = String(storageGet(SELECTED_PROFILE_STORAGE_KEY) || '')
  const selectedId = profiles.some((profile) => profile.id === savedSelectedId) ? savedSelectedId : profiles[0].id
  if (selectedId !== savedSelectedId) storageSet(SELECTED_PROFILE_STORAGE_KEY, selectedId)
  return {
    profiles,
    selectedId,
    commandBlacklist: String(storageGet(COMMAND_BLACKLIST_STORAGE_KEY) || '')
  }
}

export function saveModelProfile(profile, select = true) {
  validateModelProfile(profile)
  const config = loadModelConfig()
  const normalized = createModelProfile(profile)
  const index = config.profiles.findIndex((item) => item.id === normalized.id)
  if (index >= 0) config.profiles.splice(index, 1, normalized)
  else config.profiles.push(normalized)
  storageSet(PROFILES_STORAGE_KEY, JSON.stringify(config.profiles))
  if (select) storageSet(SELECTED_PROFILE_STORAGE_KEY, normalized.id)
  return normalized
}

export function deleteModelProfile(id) {
  const config = loadModelConfig()
  if (config.profiles.length <= 1) throw new Error('至少保留一个模型配置')
  const profiles = config.profiles.filter((profile) => profile.id !== id)
  if (profiles.length === config.profiles.length) return config
  const selectedId = config.selectedId === id ? profiles[0].id : config.selectedId
  storageSet(PROFILES_STORAGE_KEY, JSON.stringify(profiles))
  storageSet(SELECTED_PROFILE_STORAGE_KEY, selectedId)
  return { ...config, profiles, selectedId }
}

export function selectModelProfile(id) {
  const config = loadModelConfig()
  if (!config.profiles.some((profile) => profile.id === id)) throw new Error('模型配置不存在')
  storageSet(SELECTED_PROFILE_STORAGE_KEY, id)
  return id
}

export function saveCommandBlacklist(value) {
  storageSet(COMMAND_BLACKLIST_STORAGE_KEY, String(value || '').trim())
}

export function selectedModelProfile() {
  const config = loadModelConfig()
  return config.profiles.find((profile) => profile.id === config.selectedId) || config.profiles[0]
}
