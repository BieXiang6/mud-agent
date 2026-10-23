import { gbkDecode, gbkEncode } from './gbk.js'

export const TEXT_ENCODING_GBK = 'gbk'
export const TEXT_ENCODING_UTF8 = 'utf-8'

export function normalizeTextEncoding(value) {
  const normalized = String(value || '').trim().toLowerCase().replace('_', '-')
  return normalized === 'utf8' || normalized === TEXT_ENCODING_UTF8
    ? TEXT_ENCODING_UTF8
    : TEXT_ENCODING_GBK
}

export function encodingLabel(value) {
  return normalizeTextEncoding(value) === TEXT_ENCODING_UTF8 ? 'UTF-8' : 'GBK'
}

export function encodeText(text, encoding) {
  if (normalizeTextEncoding(encoding) === TEXT_ENCODING_UTF8) {
    return new TextEncoder().encode(String(text))
  }
  return gbkEncode(String(text))
}

export function decodeText(bytes, encoding, start = 0, end = bytes.length) {
  if (normalizeTextEncoding(encoding) === TEXT_ENCODING_UTF8) {
    const view = bytes instanceof Uint8Array ? bytes.subarray(start, end) : new Uint8Array(bytes.slice(start, end))
    return new TextDecoder('utf-8').decode(view)
  }
  return gbkDecode(bytes, start, end)
}

// 返回当前字节块中可安全解码的前缀长度，保留末尾尚未收全的多字节字符。
export function consumableBoundary(bytes, encoding) {
  if (normalizeTextEncoding(encoding) !== TEXT_ENCODING_UTF8) {
    let i = 0
    while (i < bytes.length) {
      const b = bytes[i]
      if (b < 0x81 || b === 0x80) { i++; continue }
      if (i + 1 >= bytes.length) break
      const trailing = bytes[i + 1]
      if (trailing >= 0x40 && trailing !== 0x7f) { i += 2; continue }
      i++
    }
    return i
  }

  let i = 0
  while (i < bytes.length) {
    const lead = bytes[i]
    let size = 1
    if (lead >= 0xc2 && lead <= 0xdf) size = 2
    else if (lead >= 0xe0 && lead <= 0xef) size = 3
    else if (lead >= 0xf0 && lead <= 0xf4) size = 4
    if (size === 1) { i++; continue }
    if (i + size > bytes.length) break
    let valid = true
    for (let j = 1; j < size; j++) {
      if ((bytes[i + j] & 0xc0) !== 0x80) { valid = false; break }
    }
    i += valid ? size : 1
  }
  return i
}
