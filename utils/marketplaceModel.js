import { parseAiSkill } from './ai/skillFormat.js'
import { validateScriptSource } from './ai/scriptValidation.js'

export const MARKET_DELETE_ADMIN_NICKNAME = '想都别想'
export const MARKET_DAILY_UPLOAD_LIMIT = 4

function text(value, field, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new Error(field + ' 长度必须为 1–' + max + ' 字符')
  }
  return value.trim()
}

export function normalizeMarketNickname(value) {
  const name = text(value, '昵称', 40).normalize('NFKC')
  if (name.length > 40 || /[\x00-\x1f\x7f<>]/.test(name)) throw new Error('昵称不能包含控制字符或尖括号，且最多 40 字符')
  return { name, key: name.toLowerCase() }
}

export function normalizeMarketContent(value) {
  if (!value || !['skill', 'script'].includes(value.type)) throw new Error('市场内容类型必须是 skill 或 script')
  const name = text(value.name, '名字', 80)
  const description = text(value.description, '描述', 500)
  const version = text(value.version, '版本', 40)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.+_-]*$/.test(version)) throw new Error('版本仅允许字母、数字、点、加号、下划线和连字符')
  let payload
  if (value.type === 'skill') {
    if (!value.payload || typeof value.payload !== 'object') throw new Error('缺少 Skill 内容')
    payload = parseAiSkill(JSON.stringify({ ...value.payload, name, description }))
  } else {
    const source = value.payload && value.payload.source
    if (typeof source !== 'string') throw new Error('缺少脚本源码')
    validateScriptSource(source)
    payload = { name, description, source }
  }
  return { type: value.type, name, description, version, payload }
}
