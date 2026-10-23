// Edits are applied in order to an in-memory copy; callers persist only after validation.
export function applyScriptEdits(source, edits) {
  if (!Array.isArray(edits) || !edits.length || edits.length > 50) throw new Error('edits 必须包含 1 到 50 处修改')
  let next = source
  const changes = []
  for (const [index, edit] of edits.entries()) {
    try {
      if (!edit || typeof edit.oldText !== 'string' || typeof edit.newText !== 'string') throw new Error('必须提供字符串 oldText 和 newText')
      if (edit.startLine != null || edit.endLine != null) {
        const newline = next.includes('\r\n') ? '\r\n' : '\n'
        const lines = next.split(newline)
        const { startLine, endLine } = edit
        if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || startLine > lines.length + 1 || endLine < startLine - 1 || endLine > lines.length) {
          throw new Error('行范围无效；行号从 1 开始，插入时 endLine = startLine - 1')
        }
        const inserting = endLine === startLine - 1
        const oldText = inserting ? '' : lines.slice(startLine - 1, endLine).join(newline)
        if (oldText !== edit.oldText) throw new Error('指定行的 oldText 不匹配，请重新读取')
        // Line edits replace complete lines. A single trailing newline is optional in newText.
        const replacement = edit.newText === '' ? [] : edit.newText.replace(/\r?\n$/, '').split(/\r?\n/)
        lines.splice(startLine - 1, inserting ? 0 : endLine - startLine + 1, ...replacement)
        next = lines.join(newline)
        changes.push({ edit: index + 1, startLine, endLine, insertedLines: replacement.length })
      } else {
        if (!edit.oldText) throw new Error('文本替换的 oldText 不能为空；插入请使用行范围或包含上下文的替换')
        const offset = next.indexOf(edit.oldText)
        if (offset < 0) throw new Error('未找到 oldText，请重新读取并保持空白和缩进一致')
        if (next.indexOf(edit.oldText, offset + 1) >= 0) throw new Error('oldText 匹配多处，请增加上下文或指定行范围')
        const length = edit.oldText.length
        const startLine = next.slice(0, offset).split('\n').length
        next = next.slice(0, offset) + edit.newText + next.slice(offset + length)
        changes.push({ edit: index + 1, startLine, removedChars: length, insertedChars: edit.newText.length })
      }
      if (next.length > 40000) throw new Error('脚本源码不能超过 40000 字符')
    } catch (error) {
      throw new Error('第 ' + (index + 1) + ' 处修改失败：' + error.message)
    }
  }
  return { source: next, changes }
}
