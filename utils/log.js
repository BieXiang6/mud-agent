// 简易日志工具 —— 便于测试登录/连接
// 级别: 0=仅错误 1=info(默认) 2=debug(全量)
// 控制台执行 setLogLevel(2) 开启全量(含字节hex/解码全文/逐行协议); setLogLevel(1) 恢复默认
let LEVEL = 1

export function setLogLevel(v) {
  LEVEL = v
  console.log('[LOG] 日志级别 → ' + v + (v >= 2 ? ' (全量 debug)' : ' (info)'))
}

// 兼容旧接口: setLogDebug(true) ≈ setLogLevel(2)
export function setLogDebug(v) {
  setLogLevel(v ? 2 : 1)
}

export function isDebugEnabled() {
  return LEVEL >= 2
}

function now() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0')
}

// 把多个参数拼成一行字符串, 避免控制台用逗号分隔显示
function fmt(args) {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return a.message || String(a)
      if (typeof a === 'object') {
        try { return JSON.stringify(a) } catch (e) { return String(a) }
      }
      return String(a)
    })
    .join(' ')
}

export function log(tag, ...args) {
  if (LEVEL < 1) return
  console.log('[' + now() + '][' + tag + '] ' + fmt(args))
}

// debug 级日志 (默认关闭, setLogLevel(2) 打开): 字节hex/解码全文/逐行协议等
export function dbg(tag, ...args) {
  if (LEVEL < 2) return
  console.log('[' + now() + '][' + tag + '] ' + fmt(args))
}

export function warn(tag, ...args) {
  if (LEVEL < 1) return
  console.warn('[' + now() + '][' + tag + '] ' + fmt(args))
}

export function err(tag, ...args) {
  console.error('[' + now() + '][' + tag + '] ' + fmt(args))
}

// 字节数组 -> 十六进制字符串
export function toHex(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16)
  }
  return s
}

// 字符串 -> 可打印形式 (转义控制字符)
export function escapeStr(s) {
  if (s == null) return String(s)
  return s
    .replace(/\x1b/g, '\\x1b')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

export default { log, dbg, warn, err, toHex, escapeStr, setLogLevel, setLogDebug, isDebugEnabled }
