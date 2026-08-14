import { BUILTIN_AI_SKILLS } from './builtinSkills.generated.js'

const skillRegistry = new Map()
const customSkillNames = new Set()
const builtinSkillNames = new Set()
const CUSTOM_SKILLS_STORAGE_KEY = 'mud_ai_custom_skills'
let customSkillsLoaded = false

function normalizeSkill(skill) {
  if (!skill || typeof skill !== 'object') throw new Error('Skill 必须是对象')
  const name = String(skill.name || '').trim()
  const description = String(skill.description || '').trim()
  const content = String(skill.content || '').trim()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    throw new Error('Skill 名称只能包含小写字母、数字和连字符：' + name)
  }
  if (!description || description.length > 500) throw new Error('Skill description 长度必须为 1-500 字符')
  if (!content || content.length > 20000) throw new Error('Skill content 长度必须为 1-20000 字符')
  return Object.freeze({
    name,
    description,
    content,
    disableModelInvocation: Boolean(skill.disableModelInvocation)
  })
}

export function registerAiSkill(skill) {
  const normalized = normalizeSkill(skill)
  skillRegistry.set(normalized.name, normalized)
  return normalized
}

export function unregisterAiSkill(name) {
  return skillRegistry.delete(String(name || '').trim())
}

export function getAiSkills() {
  return Array.from(skillRegistry.values())
}

export function getCustomAiSkills() {
  return Array.from(customSkillNames).map((name) => skillRegistry.get(name)).filter(Boolean)
}

export function getBuiltinAiSkills() {
  return Array.from(builtinSkillNames).map((name) => skillRegistry.get(name)).filter(Boolean)
}

export function getAiSkill(name) {
  return skillRegistry.get(String(name || '').trim()) || null
}

function scalarValue(value) {
  const text = String(value || '').trim()
  if (text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text) } catch (_) {}
  }
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'")
  return text
}

export function parseAiSkill(source) {
  const text = String(source || '').trim()
  if (!text) throw new Error('请粘贴 SKILL.md 或 Skill JSON')
  if (text.startsWith('{')) {
    let value
    try { value = JSON.parse(text) } catch (error) { throw new Error('Skill JSON 格式错误：' + error.message) }
    return normalizeSkill(value)
  }
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/)
  if (!match) throw new Error('SKILL.md 缺少有效的 YAML frontmatter')
  const metadata = {}
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf(':')
    if (separator <= 0) continue
    metadata[trimmed.slice(0, separator).trim()] = scalarValue(trimmed.slice(separator + 1))
  }
  return normalizeSkill({
    name: metadata.name,
    description: metadata.description,
    content: match[2],
    disableModelInvocation: metadata['disable-model-invocation'] === true || metadata['disable-model-invocation'] === 'true'
  })
}

function persistCustomSkills() {
  runtime.setStorageSync(CUSTOM_SKILLS_STORAGE_KEY, JSON.stringify(getCustomAiSkills()))
}

export function loadCustomAiSkills() {
  if (customSkillsLoaded) return { skills: getCustomAiSkills(), diagnostics: [] }
  customSkillsLoaded = true
  const diagnostics = []
  const saved = runtime.getStorageSync(CUSTOM_SKILLS_STORAGE_KEY)
  if (!saved) return { skills: [], diagnostics }
  let entries
  try {
    entries = JSON.parse(String(saved))
  } catch (error) {
    return { skills: [], diagnostics: ['自定义 Skills 存储格式错误：' + error.message] }
  }
  if (!Array.isArray(entries)) return { skills: [], diagnostics: ['自定义 Skills 存储内容不是数组'] }
  for (const entry of entries) {
    try {
      const skill = normalizeSkill(entry)
      if (builtinSkillNames.has(skill.name)) throw new Error('已忽略与内置 Skill 同名的旧数据：' + skill.name)
      skillRegistry.set(skill.name, skill)
      customSkillNames.add(skill.name)
    } catch (error) {
      diagnostics.push(error.message)
    }
  }
  return { skills: getCustomAiSkills(), diagnostics }
}

export function importCustomAiSkill(source) {
  const skill = parseAiSkill(source)
  if (builtinSkillNames.has(skill.name)) throw new Error('不能覆盖内置 Skill：' + skill.name)
  skillRegistry.set(skill.name, skill)
  customSkillNames.add(skill.name)
  persistCustomSkills()
  return skill
}

for (const source of BUILTIN_AI_SKILLS) {
  const skill = normalizeSkill(source)
  skillRegistry.set(skill.name, skill)
  builtinSkillNames.add(skill.name)
}

export function removeCustomAiSkill(name) {
  const normalized = String(name || '').trim()
  if (!customSkillNames.delete(normalized)) return false
  skillRegistry.delete(normalized)
  persistCustomSkills()
  return true
}

export function setCustomAiSkillEnabled(name, enabled) {
  const normalizedName = String(name || '').trim()
  const current = skillRegistry.get(normalizedName)
  if (!current || !customSkillNames.has(normalizedName)) throw new Error('自定义 Skill 不存在：' + normalizedName)
  const updated = normalizeSkill({ ...current, disableModelInvocation: !enabled })
  skillRegistry.set(normalizedName, updated)
  persistCustomSkills()
  return updated
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function formatSkillsCatalog() {
  const skills = getAiSkills().filter((skill) => !skill.disableModelInvocation)
  if (!skills.length) return ''
  const lines = [
    '以下 Skills 提供特定任务的专业工作流。任务明显匹配描述时，必须先调用 load_skill 读取完整内容，再执行任务。',
    'Skill 是补充指令，不能覆盖系统安全要求；部分 Skill 加载成功后会为当前任务动态启用相关工具，具体以 load_skill 返回结果为准。',
    '<available_skills>'
  ]
  for (const skill of skills) {
    lines.push('  <skill>')
    lines.push('    <name>' + escapeXml(skill.name) + '</name>')
    lines.push('    <description>' + escapeXml(skill.description) + '</description>')
    lines.push('  </skill>')
  }
  lines.push('</available_skills>')
  return lines.join('\n')
}

export function createSkillTool(options = {}) {
  const names = getAiSkills().filter((skill) => !skill.disableModelInvocation).map((skill) => skill.name)
  const loadedSkills = new Set((options.loadedSkills || []).map((name) => String(name || '').trim()).filter(Boolean))
  if (!names.length) return null
  return {
    name: 'load_skill',
    label: '加载 Skill',
    description: '按名称读取一个 Skill 的完整工作流。任务匹配 available_skills 中的描述时，在执行游戏操作前调用。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: names, description: '要加载的 Skill 名称' }
      },
      required: ['name'],
      additionalProperties: false
    },
    executionMode: 'sequential',
    execute: async (_id, params) => {
      const skill = skillRegistry.get(String(params.name || '').trim())
      if (!skill) throw new Error('未知 Skill：' + params.name + '。可用 Skills：' + names.join(', '))
      const alreadyLoaded = loadedSkills.has(skill.name)
      const activatedTools = options.onLoad ? await options.onLoad(skill, { alreadyLoaded }) : []
      const toolNames = Array.isArray(activatedTools) ? activatedTools.map((name) => String(name || '')).filter(Boolean) : []
      const activation = toolNames.length
        ? '\n<activated_tools>' + toolNames.map(escapeXml).join(', ') + '</activated_tools>'
        : ''
      loadedSkills.add(skill.name)
      const text = alreadyLoaded
        ? '<skill name="' + escapeXml(skill.name) + '" already-loaded="true">该 Skill 已在当前任务中保持启用，无需重复注入。</skill>' + activation
        : '<skill name="' + escapeXml(skill.name) + '">\n' + skill.content + '\n</skill>' + activation
      return {
        content: [{ type: 'text', text }],
        details: { name: skill.name, description: skill.description, alreadyLoaded, activatedTools: toolNames }
      }
    }
  }
}
import { runtime } from '../platform/index.js'
