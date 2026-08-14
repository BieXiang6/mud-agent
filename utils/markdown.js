function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeLink(value) {
  const url = String(value || '').trim()
  return /^(?:https?:|mailto:)/i.test(url) ? escapeHtml(url) : ''
}

function inlineMarkdown(value) {
  const tokens = []
  const token = (html) => {
    const id = '\uE000' + tokens.length + '\uE001'
    tokens.push(html)
    return id
  }
  let text = String(value || '')
  text = text.replace(/`([^`\n]+)`/g, (_match, code) => token('<code>' + escapeHtml(code) + '</code>'))
  text = text.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
    const safe = safeLink(href)
    return safe ? token('<a href="' + safe + '" target="_blank">' + escapeHtml(label) + '</a>') : escapeHtml(label)
  })
  text = escapeHtml(text)
  text = text
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
  return text.replace(/\uE000(\d+)\uE001/g, (_match, index) => tokens[Number(index)] || '')
}

function tableCells(line) {
  return String(line).trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function isTableSeparator(line) {
  const cells = tableCells(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function renderTable(lines, start) {
  const headers = tableCells(lines[start])
  let index = start + 2
  const rows = []
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    rows.push(tableCells(lines[index]))
    index++
  }
  const head = '<thead><tr>' + headers.map((cell) => '<th>' + inlineMarkdown(cell) + '</th>').join('') + '</tr></thead>'
  const body = '<tbody>' + rows.map((row) => '<tr>' + headers.map((_cell, cellIndex) => '<td>' + inlineMarkdown(row[cellIndex] || '') + '</td>').join('') + '</tr>').join('') + '</tbody>'
  return { html: '<table>' + head + body + '</table>', next: index }
}

export function markdownToHtml(source) {
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index++
      continue
    }

    const fence = line.match(/^\s*```([^`]*)$/)
    if (fence) {
      const code = []
      index++
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) code.push(lines[index++])
      if (index < lines.length) index++
      const language = fence[1].trim()
      blocks.push('<pre><code' + (language ? ' data-language="' + escapeHtml(language) + '"' : '') + '>' + escapeHtml(code.join('\n')) + '</code></pre>')
      continue
    }

    if (index + 1 < lines.length && line.includes('|') && isTableSeparator(lines[index + 1])) {
      const table = renderTable(lines, index)
      blocks.push(table.html)
      index = table.next
      continue
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      blocks.push('<h' + level + '>' + inlineMarkdown(heading[2]) + '</h' + level + '>')
      index++
      continue
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push('<hr/>')
      index++
      continue
    }
    if (/^\s*>/.test(line)) {
      const quote = []
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''))
      blocks.push('<blockquote>' + quote.map(inlineMarkdown).join('<br/>') + '</blockquote>')
      continue
    }

    const list = line.match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/)
    if (list) {
      const ordered = Boolean(list[2])
      const tag = ordered ? 'ol' : 'ul'
      const items = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/)
        if (!item || Boolean(item[2]) !== ordered) break
        items.push('<li>' + inlineMarkdown(item[3]) + '</li>')
        index++
      }
      blocks.push('<' + tag + '>' + items.join('') + '</' + tag + '>')
      continue
    }

    const paragraph = [line]
    index++
    while (index < lines.length && lines[index].trim()) {
      if (/^\s*```/.test(lines[index]) || /^\s*(?:#{1,6}\s+|>|[-+*]\s+|\d+\.\s+)/.test(lines[index])) break
      if (index + 1 < lines.length && lines[index].includes('|') && isTableSeparator(lines[index + 1])) break
      paragraph.push(lines[index++])
    }
    blocks.push('<p>' + paragraph.map(inlineMarkdown).join('<br/>') + '</p>')
  }
  return blocks.join('')
}

export default { markdownToHtml }
