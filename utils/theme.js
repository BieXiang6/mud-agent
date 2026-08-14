function parseHex(color) {
  const match = String(color || '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const hex = match[1].length === 3
    ? match[1].split('').map((part) => part + part).join('')
    : match[1]
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
}

function luminance(rgb) {
  if (!rgb) return 0
  const channels = rgb.map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function mappedBrightForeground(rgb) {
  const max = Math.max(...rgb)
  const min = Math.min(...rgb)
  if (max - min < 30) return '#3f4540'
  const scale = 145 / max
  const adjusted = rgb.map((value) => Math.max(24, Math.round(value * scale)))
  return '#' + adjusted.map((value) => value.toString(16).padStart(2, '0')).join('')
}

export function mapRichColorsForLight(fg, bg) {
  const fgRgb = parseHex(fg)
  const bgRgb = parseHex(bg)
  let mappedBg = bg
  if (bgRgb && luminance(bgRgb) > 0.72) mappedBg = '#d8cfb8'

  let mappedFg = fg
  const backgroundIsDark = bgRgb && luminance(bgRgb) < 0.28
  if (fgRgb && !backgroundIsDark && luminance(fgRgb) > 0.56) {
    mappedFg = mappedBrightForeground(fgRgb)
  }
  return { fg: mappedFg, bg: mappedBg }
}
