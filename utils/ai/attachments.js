export const TEXT_ATTACHMENT_MAX_FILES = 3
export const TEXT_ATTACHMENT_MAX_BYTES = 256 * 1024
export const TEXT_ATTACHMENT_MAX_TOTAL_BYTES = 512 * 1024

export const TEXT_ATTACHMENT_EXTENSIONS = [
  'txt', 'text', 'md', 'markdown', 'rst', 'adoc', 'log', 'csv', 'tsv',
  'json', 'json5', 'jsonc', 'jsonl', 'ndjson', 'xml', 'xsd', 'xsl', 'yaml',
  'yml', 'toml', 'ini', 'conf', 'config', 'cfg', 'properties', 'env',
  'editorconfig', 'gitignore', 'gitattributes', 'dockerignore',
  'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less', 'styl', 'svg',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx', 'vue', 'svelte',
  'astro', 'py', 'pyw', 'pyi', 'java', 'kt', 'kts', 'groovy', 'scala',
  'sc', 'clj', 'cljs', 'cljc', 'edn', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp',
  'hh', 'hxx', 'm', 'mm', 'cs', 'csx', 'fs', 'fsi', 'fsx', 'vb', 'go',
  'rs', 'swift', 'dart', 'lua', 'rb', 'erb', 'php', 'php3', 'php4', 'php5',
  'phtml', 'pl', 'pm', 'r', 'rmd', 'jl', 'ex', 'exs', 'erl', 'hrl', 'hs',
  'lhs', 'ml', 'mli', 'fs', 'elm', 'sol', 'move', 'vy', 'zig', 'nim', 'cr',
  'v', 'vala', 'pas', 'pp', 'asm', 's', 'inc', 'wat', 'vhd', 'vhdl', 'sv',
  'svh', 'tcl', 'awk', 'sed', 'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd',
  'ps1', 'psm1', 'psd1', 'sql', 'graphql', 'gql', 'proto', 'thrift', 'avsc',
  'cmake', 'gradle', 'make', 'mk', 'dockerfile', 'tf', 'tfvars', 'hcl',
  'nix', 'bazel', 'bzl', 'rego', 'feature', 'robot', 'tex', 'bib'
]

function utf8Bytes(text) {
  const value = String(text || '')
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length
  return unescape(encodeURIComponent(value)).length
}

function cleanName(value) {
  return String(value || '未命名.txt').replace(/^.*[\\/]/, '').replace(/[\x00-\x1f]/g, '').slice(0, 160) || '未命名.txt'
}

function looksBinary(text) {
  const value = String(text || '')
  if (value.includes('\0')) return true
  if (!value.length) return false
  let suspicious = 0
  let replacement = 0
  const sampleLength = Math.min(value.length, 8192)
  for (let index = 0; index < sampleLength; index++) {
    const code = value.charCodeAt(index)
    if (code === 0xfffd) replacement += 1
    if ((code < 32 && code !== 9 && code !== 10 && code !== 12 && code !== 13) || code === 127) suspicious += 1
  }
  return replacement > Math.max(2, sampleLength * 0.01) || suspicious > Math.max(4, sampleLength * 0.05)
}

export function normalizeTextAttachment(value) {
  if (!value || typeof value !== 'object') return null
  const name = cleanName(value.name)
  const text = String(value.text == null ? '' : value.text).replace(/^\uFEFF/u, '')
  const size = Math.max(0, Number(value.size) || utf8Bytes(text))
  return { name, text, size }
}

export function validateNewTextAttachment(value, existing = []) {
  const attachment = normalizeTextAttachment(value)
  if (!attachment) throw new Error('未能读取附件')
  if (looksBinary(attachment.text)) throw new Error('“' + attachment.name + '”不是可读取的文本或代码文件')
  if (attachment.size > TEXT_ATTACHMENT_MAX_BYTES) throw new Error('“' + attachment.name + '”超过 256 KiB 限制')
  const current = (Array.isArray(existing) ? existing : []).map(normalizeTextAttachment).filter(Boolean)
  if (current.length >= TEXT_ATTACHMENT_MAX_FILES) throw new Error('每轮最多添加 3 个附件')
  const total = current.reduce((sum, item) => sum + item.size, 0) + attachment.size
  if (total > TEXT_ATTACHMENT_MAX_TOTAL_BYTES) throw new Error('本轮附件总大小不能超过 512 KiB')
  return attachment
}

export function normalizeTextAttachments(values) {
  const result = []
  let total = 0
  for (const value of Array.isArray(values) ? values : []) {
    const attachment = normalizeTextAttachment(value)
    if (!attachment || attachment.size > TEXT_ATTACHMENT_MAX_BYTES) continue
    if (result.length >= TEXT_ATTACHMENT_MAX_FILES || total + attachment.size > TEXT_ATTACHMENT_MAX_TOTAL_BYTES) break
    result.push(attachment)
    total += attachment.size
  }
  return result
}

export function formatTextAttachments(values) {
  const attachments = normalizeTextAttachments(values)
  if (!attachments.length) return ''
  const attribute = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return attachments.map((item, index) => (
    '<attachment index="' + (index + 1) + '" name="' + attribute(item.name) + '">\n' +
    item.text + '\n</attachment>'
  )).join('\n\n')
}
