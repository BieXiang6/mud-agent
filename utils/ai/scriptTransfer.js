import { validateScriptSource } from './scriptRuntime.js'
import { getAllStoredScripts, getStoredScript, replaceStoredScripts } from './scriptStore.js'

const BUNDLE_FORMAT = 'mud-agent-script'
const BUNDLE_VERSION = 1

function bundleScript(value, index) {
  if (!value || typeof value !== 'object') throw new Error('第 ' + (index + 1) + ' 个脚本格式无效')
  const name = String(value.name || '').trim()
  const description = String(value.description || '').trim()
  const source = String(value.source || '').trim()
  if (!name) throw new Error('第 ' + (index + 1) + ' 个脚本缺少名称')
  if (name.length > 80) throw new Error('脚本名称不能超过 80 字符：' + name.slice(0, 30))
  if (description.length > 500) throw new Error('脚本说明不能超过 500 字符：' + name)
  validateScriptSource(source)
  return {
    id: String(value.id || '').trim(),
    name,
    description,
    source,
    createdAt: Number(value.createdAt) || 0,
    updatedAt: Number(value.updatedAt) || 0
  }
}

export function exportStoredScriptText(idOrName) {
  const script = getStoredScript(idOrName)
  if (!script) throw new Error('请先选择要导出的脚本')
  return JSON.stringify({
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: Date.now(),
    script
  }, null, 2)
}

export function importStoredScriptText(text) {
  let bundle
  try { bundle = JSON.parse(String(text || '').replace(/^\uFEFF/u, '')) } catch (_) { throw new Error('单脚本包不是有效的 JSON') }
  if (!bundle || bundle.format !== BUNDLE_FORMAT || Number(bundle.version) !== BUNDLE_VERSION || !bundle.script || Array.isArray(bundle.script)) {
    throw new Error('不是受支持的 Mud Agent 单脚本包；不允许批量导入')
  }
  const incoming = bundleScript(bundle.script, 0)

  const merged = getAllStoredScripts()
  const now = Date.now()
  let index = incoming.id ? merged.findIndex((item) => item.id === incoming.id) : -1
  if (index < 0) index = merged.findIndex((item) => item.name.toLowerCase() === incoming.name.toLowerCase())
  let imported
  let created = 0
  let updated = 0
  if (index >= 0) {
    const existing = merged[index]
    imported = { ...incoming, id: existing.id, createdAt: existing.createdAt, updatedAt: now }
    merged[index] = imported
    updated = 1
  } else {
    imported = { ...incoming, id: incoming.id || undefined, createdAt: incoming.createdAt || now, updatedAt: now }
    merged.push(imported)
    created = 1
  }
  const stored = replaceStoredScripts(merged)
  const result = stored.find((script) => script.id === imported.id) || stored.find((script) => script.name.toLowerCase() === incoming.name.toLowerCase())
  return { created, updated, total: merged.length, scriptId: result.id, name: result.name }
}

export const scriptBundleInfo = Object.freeze({ format: BUNDLE_FORMAT, version: BUNDLE_VERSION })
