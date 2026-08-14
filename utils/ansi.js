// ANSI 颜色解析器
// 将带 ANSI 转义序列的文本解析为富文本片段数组，供 uni-app 渲染
// 支持: SGR(0/1/2/4/7/8/22/24/27/30-37/40-47/90-97/100-107), 256色(38;5;n/48;5;n), 真彩(38;2;r;g;b)
// 以及本 MUD 专用的行内命令按钮: ESC[u:cmds:ID]文本  /  ESC[s:ID]文本

// 16 色经典终端配色 (深色背景下清晰可读)
// [0]普通色 [1]亮色
const PAL = [
  ['#000000', '#c40000', '#00a600', '#c0a000', '#0000c4', '#c000c4', '#00a0c4', '#d8d8d8'],
  ['#7f7f7f', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff']
]

// 256 色面板 (xterm): 16 系统色 + 6x6x6 立方体 + 24 级灰
function buildPalette256() {
  const p = []
  for (let i = 0; i < 16; i++) p.push(PAL[i < 8 ? 0 : 1][i % 8])
  const levels = [0, 95, 135, 175, 215, 255]
  const hex = (r, g, b) => {
    const h = (n) => n.toString(16).padStart(2, '0')
    return '#' + h(r) + h(g) + h(b)
  }
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 6; g++)
      for (let b = 0; b < 6; b++) p.push(hex(levels[r], levels[g], levels[b]))
  for (let i = 0; i < 24; i++) { const v = 8 + i * 10; p.push(hex(v, v, v)) }
  return p
}
const PAL256 = buildPalette256()

const ESC = String.fromCharCode(27)
const HR15 = '一'.repeat(15)
const PARSE_CACHE_LIMIT = 600
const STYLE_SEGMENT_LIMIT = 80
const parseCache = new Map()

export const HR_LINE = '__HR__'

function resolveColor(idx) {
  if (idx === null || idx === undefined) return null
  if (typeof idx === 'number') return PAL256[idx]
  return idx // hex string
}

function sameTextStyle(a, b) {
  return !a.btn && !b.btn &&
    a.fg === b.fg && a.bg === b.bg &&
    !!a.bold === !!b.bold && !!a.under === !!b.under
}

function appendSegment(segs, seg) {
  const last = segs[segs.length - 1]
  if (last && sameTextStyle(last, seg)) last.t += seg.t
  else segs.push(seg)
}

function limitStyleSegments(segs) {
  if (segs.length <= STYLE_SEGMENT_LIMIT) return segs
  const out = []
  let textNodes = 0
  let overflow = ''
  const flushOverflow = () => {
    if (!overflow) return
    appendSegment(out, { t: overflow })
    overflow = ''
  }
  for (const seg of segs) {
    if (seg.btn) {
      flushOverflow()
      out.push(seg)
    } else if (textNodes < STYLE_SEGMENT_LIMIT) {
      out.push(seg)
      textNodes++
    } else {
      // 极端彩虹字仍完整显示文字；超出预算的样式降级为普通文本。
      overflow += seg.t
    }
  }
  flushOverflow()
  return out
}

function cacheResult(key, segs) {
  const result = Object.freeze(limitStyleSegments(segs).map((seg) => Object.freeze(seg)))
  parseCache.set(key, result)
  if (parseCache.size > PARSE_CACHE_LIMIT) {
    parseCache.delete(parseCache.keys().next().value)
  }
  return result
}

/**
 * 将文本解析为富文本片段
 * @returns {Array<{t:string, fg?:string, bg?:string, bold?:boolean, under?:boolean, btn?:boolean, id?:string}>}
 */
export function parseRich(text) {
  const source = text == null ? '' : String(text)
  const cached = parseCache.get(source)
  if (cached) {
    // Map 同时作为简单 LRU；重复菜单和按钮标签会直接复用不可变结果。
    parseCache.delete(source)
    parseCache.set(source, cached)
    return cached
  }
  text = source
  // ZJSIZE 使用 ESC[s:n] 标记字号。旧版 ansi_up 只移除此标记，
  // 它不是按钮；此前把它当作按钮会吞掉后续文字并生成错误指令。
  text = String(text).replace(/\x1b\[s:\d*\]/g, '')
  // 去掉裸 ESC(其后不跟 '[' 的, 属于协议残留)
  text = text.replace(/\x1b(?!\[)/g, '')

  const segs = []
  let fg = null // number(0-255) | hex | null
  let bg = null
  let bright = 0
  let bold = false
  let under = false
  let reverse = false
  let dim = false
  let pendingBtn = null

  const flush = (t) => {
    if (!t) return
    if (pendingBtn !== null) {
      segs.push({ btn: true, id: pendingBtn, t: t })
      pendingBtn = null
      return
    }
    let f = fg
    let b = bg
    if (reverse) { const tmp = f; f = b; b = tmp }
    let color = resolveColor(f)
    if (dim && !color) color = '#999999'
    if (color && bold && typeof fg === 'number' && fg < 8) color = PAL256[fg + 8]
    const seg = { t: t }
    if (color) seg.fg = color
    if (b !== null) seg.bg = resolveColor(b)
    if (bold) seg.bold = true
    if (under) seg.under = true
    // 连续 ANSI 控制序列经常产生相同样式的小片段，提前合并可显著减少渲染节点。
    appendSegment(segs, seg)
  }

  const chunks = text.split('\x1b[')
  let first = true
  for (let raw of chunks) {
    if (first) { first = false; flush(raw); continue }

    // 行内按钮: u:cmds:ID]文本
    if (raw.indexOf('u:cmds:') === 0) {
      const rest = raw.slice('u:cmds:'.length)
      const end = rest.indexOf(']')
      const id = end >= 0 ? rest.slice(0, end) : rest
      const label = end >= 0 ? rest.slice(end + 1) : ''
      if (label !== '') {
        segs.push({ btn: true, id, t: label })
      } else {
        pendingBtn = id || null
      }
      continue
    }
    // 其它 ZJURL 扩展（当前服务端仅发现 voice:）不是网页命令按钮。
    // www 客户端也没有播放实现，但必须移除协议元数据并保留后面的可见文字，
    // 否则会把 ":voice:... ]" 之类的控制内容直接显示给用户。
    if (raw.indexOf('u:') === 0) {
      const end = raw.indexOf(']')
      flush(end >= 0 ? raw.slice(end + 1) : '')
      continue
    }
    if (pendingBtn !== null) {
      // 后面的文本作为按钮文字 (去掉其中的 SGR 指令)
      const label = raw.replace(/\d[^m]*m/g, '').replace(/\x1b/g, '')
      segs.push({ btn: true, id: pendingBtn, t: label })
      pendingBtn = null
      continue
    }

    // 常规 CSI 序列
    const m = raw.match(/^([!\x3c-\x3f]*)([\d;]*)([\x20-\x2c]*[\x40-\x7e])([\s\S]*)/m)
    if (!m) { flush(raw); continue }
    const finalCh = m[3] ? m[3][m[3].length - 1] : ''
    const nums = m[2] ? m[2].split(';') : []
    let restText = m[4] || ''

    if (finalCh === 'm') {
      // SGR
      let i = 0
      while (i < nums.length) {
        const numStr = nums[i]
        const num = parseInt(numStr, 10)
        if (isNaN(num) || num === 0) {
          fg = null; bg = null; bright = 0; bold = false; under = false; reverse = false; dim = false
        } else if (num === 1) { bold = true; bright = 1 }
        else if (num === 2) { dim = true }
        else if (num === 4) { under = true }
        else if (num === 7) { reverse = true }
        else if (num === 8) { /* conceal */ }
        else if (num === 22) { bold = false; bright = 0 }
        else if (num === 24) { under = false }
        else if (num === 27) { reverse = false }
        else if (num === 39) { fg = null }
        else if (num === 49) { bg = null }
        else if (num >= 30 && num < 38) { fg = bright ? num - 30 + 8 : num - 30 }
        else if (num >= 90 && num < 98) { fg = num - 90 + 8 }
        else if (num >= 40 && num < 48) { bg = num - 40 }
        else if (num >= 100 && num < 108) { bg = num - 100 + 8 }
        else if (num === 38 || num === 48) {
          const isFg = num === 38
          i++
          if (i < nums.length) {
            const mode = nums[i]
            if (mode === '5' && i + 1 < nums.length) {
              i++
              const idx = parseInt(nums[i], 10)
              if (!isNaN(idx) && idx >= 0 && idx <= 255) {
                if (isFg) fg = idx; else bg = idx
              }
            } else if (mode === '2' && i + 3 < nums.length) {
              const r = parseInt(nums[i + 1], 10)
              const g = parseInt(nums[i + 2], 10)
              const b = parseInt(nums[i + 3], 10)
              if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
                const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
                if (isFg) fg = hex; else bg = hex
              }
              i += 3
            }
          }
        }
        i++
      }
      flush(restText)
    } else {
      // 非 SGR 的 CSI (光标移动等) -> 忽略指令保留文本
      flush(restText)
    }
  }
  if (pendingBtn !== null) {
    // 残留的待定按钮没有文本, 丢弃
    pendingBtn = null
  }
  if (segs.length === 0) segs.push({ t: '' })
  return cacheResult(source, segs)
}

// 解析一行, 返回节点 {segs} 或 {hr:true}
export function parseLine(text) {
  if (text === HR_LINE) return { hr: true }
  return { segs: parseRich(text) }
}

export default { parseRich, parseLine, HR_LINE }
