import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

function unquote(value) {
  const text = String(value || '').trim()
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"')
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1)
  return text.replace(/\s+#.*$/, '').trim()
}

export function parseEnvFile(raw) {
  const values = {}
  for (const line of String(raw || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (match) values[match[1]] = unquote(match[2])
  }
  return values
}

export function loadEnvFiles(root = process.cwd()) {
  const loaded = {}
  for (const name of ['.env', '.env.local']) {
    const file = path.join(root, name)
    if (existsSync(file)) Object.assign(loaded, parseEnvFile(readFileSync(file, 'utf8')))
  }
  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] == null) process.env[key] = value
  }
  return loaded
}
