export function normalizeSkill(skill) {
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
