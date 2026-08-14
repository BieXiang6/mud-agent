import { runtime } from '../platform/index.js'

const SCRIPT_STORAGE_KEY = 'mud_ai_scripts_v1'
const MAX_SCRIPTS = 50
const MAX_SOURCE_CHARS = 40000

function scriptId() {
  return 'script-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

function cleanText(value, field, maxLength) {
  const text = String(value == null ? '' : value).trim()
  if (!text) throw new Error(field + ' 不能为空')
  if (text.length > maxLength) throw new Error(field + ' 不能超过 ' + maxLength + ' 字符')
  return text
}

function normalizeScript(value, existing = null) {
  const now = Date.now()
  const createdAt = Number(existing && existing.createdAt) || Number(value && value.createdAt) || now
  return {
    id: String(existing && existing.id || value && value.id || scriptId()),
    name: cleanText(value && value.name, '脚本名称', 80),
    description: String(value && value.description || '').trim().slice(0, 500),
    source: cleanText(value && value.source, '脚本源码', MAX_SOURCE_CHARS),
    createdAt,
    updatedAt: now
  }
}

function readScripts() {
  const saved = runtime.getStorageSync(SCRIPT_STORAGE_KEY)
  if (!saved) return []
  try {
    const parsed = JSON.parse(String(saved))
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => {
      try {
        const normalized = normalizeScript(item)
        normalized.id = String(item.id || normalized.id)
        normalized.createdAt = Number(item.createdAt) || normalized.createdAt
        normalized.updatedAt = Number(item.updatedAt) || normalized.createdAt
        return normalized
      } catch (_) { return null }
    }).filter(Boolean).slice(0, MAX_SCRIPTS)
  } catch (_) {
    return []
  }
}

function persist(scripts) {
  const next = scripts.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SCRIPTS)
  runtime.setStorageSync(SCRIPT_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function listStoredScripts() {
  return readScripts().map(({ source, ...metadata }) => ({ ...metadata, sourceLength: source.length }))
}

export function getStoredScript(idOrName) {
  const key = String(idOrName || '').trim()
  const lower = key.toLowerCase()
  const script = readScripts().find((item) => item.id === key || item.name.toLowerCase() === lower)
  return script ? { ...script } : null
}

export function saveStoredScript(value) {
  const scripts = readScripts()
  const requestedId = String(value && value.id || '').trim()
  const index = requestedId ? scripts.findIndex((item) => item.id === requestedId) : -1
  if (requestedId && index < 0) throw new Error('要更新的脚本不存在：' + requestedId)
  const existing = index >= 0 ? scripts[index] : null
  if (existing && value.expectedUpdatedAt != null && Number(value.expectedUpdatedAt) !== existing.updatedAt) {
    throw new Error('脚本已被修改，请重新读取后再保存')
  }
  const normalized = normalizeScript(value, existing)
  const duplicate = scripts.find((item) => item.id !== normalized.id && item.name.toLowerCase() === normalized.name.toLowerCase())
  if (duplicate) throw new Error('脚本名称已存在：' + normalized.name)
  if (index >= 0) scripts[index] = normalized
  else scripts.push(normalized)
  persist(scripts)
  return { ...normalized }
}

export function deleteStoredScript(idOrName) {
  const script = getStoredScript(idOrName)
  if (!script) return false
  persist(readScripts().filter((item) => item.id !== script.id))
  return true
}

export const scriptStoreLimits = Object.freeze({ maxScripts: MAX_SCRIPTS, maxSourceChars: MAX_SOURCE_CHARS })

export default { listStoredScripts, getStoredScript, saveStoredScript, deleteStoredScript, scriptStoreLimits }
