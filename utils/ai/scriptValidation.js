const FORBIDDEN_WORDS = [
  'globalThis', 'window', 'document', 'self', 'global', 'process', 'require',
  'uni', 'plus', 'wx', 'fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage',
  'sessionStorage', 'indexedDB', 'Worker', 'SharedWorker', 'WebAssembly', 'Function', 'eval'
]

function maskedSource(source) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\r\n]*/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
}

export function validateScriptSource(source) {
  const text = String(source || '')
  if (!text.trim()) throw new Error('脚本源码不能为空')
  if (text.length > 40000) throw new Error('脚本源码不能超过 40000 字符')
  const masked = maskedSource(text)
  for (const word of FORBIDDEN_WORDS) {
    if (new RegExp('\\b' + word + '\\b').test(masked)) throw new Error('脚本不能访问受限全局对象：' + word)
  }
  if (/\b(?:constructor|prototype|__proto__)\b/i.test(text.replace(/["'`+\s]/g, ''))) {
    throw new Error('脚本不能访问原型或构造器')
  }
  if (/\bimport\s*(?:\(|[\w*{])|\bexport\s+|\bwith\s*\(|\bdebugger\b/.test(masked)) {
    throw new Error('脚本不能使用 import/export、with 或 debugger')
  }
  if (/\b(?:while|do|for)\b/.test(masked)) {
    throw new Error('为避免阻塞界面，脚本不能使用同步循环；请使用数组方法、game.on、game.wait 或 game.sleep')
  }
  return text
}
