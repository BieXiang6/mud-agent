const ESC = String.fromCharCode(27)

export function validateCommandBatch(command, blacklist = new Set()) {
  const normalized = String(command == null ? '' : command).trim()
  if (!normalized) throw new Error('指令不能为空')
  if (normalized.length > 500) throw new Error('指令长度超过限制')
  if (normalized.indexOf(ESC) >= 0 || /;/.test(normalized)) throw new Error('不允许发送分号或协议控制字符')
  if (/\r(?!\n)/.test(normalized)) throw new Error('指令只能使用换行符分隔')

  const commands = normalized.replace(/\r\n/g, '\n').split('\n').map((item) => item.trim())
  const emptyIndex = commands.findIndex((item) => !item)
  if (emptyIndex >= 0) throw new Error('第' + (emptyIndex + 1) + '条指令不能为空')

  const verbs = commands.map((item) => item.split(/\s+/)[0].toLowerCase())
  const blockedIndex = verbs.findIndex((verb) => blacklist.has(verb))
  if (blockedIndex >= 0) throw new Error('第' + (blockedIndex + 1) + '条指令已被黑名单阻止：' + verbs[blockedIndex])

  return { command: commands.join('\n'), commands, verbs }
}

export default { validateCommandBatch }
