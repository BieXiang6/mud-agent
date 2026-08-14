const root = globalThis

if (typeof root.structuredClone === 'undefined') {
  root.structuredClone = function structuredClone(value) {
    if (value == null || typeof value !== 'object') return value
    if (value instanceof Uint8Array) return new Uint8Array(value)
    if (value instanceof ArrayBuffer) return value.slice(0)
    if (Array.isArray(value)) return value.map((item) => root.structuredClone(item))
    const result = {}
    for (const key of Object.keys(value)) result[key] = root.structuredClone(value[key])
    return result
  }
}

if (typeof root.FormData === 'undefined') {
  root.FormData = class FormData {
    constructor() { this._entries = [] }
    append(name, value) { this._entries.push([String(name), value]) }
    set(name, value) {
      this.delete(name)
      this.append(name, value)
    }
    get(name) {
      const item = this._entries.find(([key]) => key === String(name))
      return item ? item[1] : null
    }
    has(name) { return this._entries.some(([key]) => key === String(name)) }
    delete(name) { this._entries = this._entries.filter(([key]) => key !== String(name)) }
    entries() { return this._entries[Symbol.iterator]() }
    [Symbol.iterator]() { return this.entries() }
  }
}

if (typeof root.Headers === 'undefined') {
  root.Headers = class Headers {
    constructor(init = {}) {
      this._values = {}
      if (init instanceof root.Headers) {
        for (const [key, value] of init) this.set(key, value)
      } else if (Array.isArray(init)) {
        for (const [key, value] of init) this.set(key, value)
      } else {
        for (const key of Object.keys(init || {})) this.set(key, init[key])
      }
    }

    append(key, value) {
      const name = String(key).toLowerCase()
      this._values[name] = this._values[name] ? this._values[name] + ', ' + String(value) : String(value)
    }

    set(key, value) { this._values[String(key).toLowerCase()] = String(value) }
    get(key) { return this._values[String(key).toLowerCase()] || null }
    has(key) { return Object.prototype.hasOwnProperty.call(this._values, String(key).toLowerCase()) }
    delete(key) { delete this._values[String(key).toLowerCase()] }
    entries() { return Object.entries(this._values)[Symbol.iterator]() }
    keys() { return Object.keys(this._values)[Symbol.iterator]() }
    values() { return Object.values(this._values)[Symbol.iterator]() }
    [Symbol.iterator]() { return this.entries() }
  }
}

if (typeof root.URLSearchParams === 'undefined') {
  root.URLSearchParams = class URLSearchParams {
    constructor(init = '') {
      this.values = {}
      const source = typeof init === 'string' ? init.replace(/^\?/, '') : ''
      source.split('&').forEach((part) => {
        if (!part) return
        const [key, value = ''] = part.split('=')
        this.set(decodeURIComponent(key), decodeURIComponent(value))
      })
    }

    set(key, value) { this.values[String(key)] = String(value) }
    get(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null }
    toString() {
      return Object.keys(this.values).map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(this.values[key])).join('&')
    }
  }
}

if (typeof root.URL === 'undefined') {
  root.URL = class URL {
    constructor(input, base) {
      let value = String(input)
      if (base && !/^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
        value = String(base).replace(/\/+$/, '') + '/' + value.replace(/^\/+/, '')
      }
      const match = value.match(/^([a-z][a-z\d+.-]*:)?\/\/([^/?#]+)([^?#]*)?(\?[^#]*)?(#.*)?$/i)
      if (!match) throw new TypeError('Invalid URL: ' + value)
      this.protocol = (match[1] || '').toLowerCase()
      this.host = match[2]
      this.hostname = this.host.split(':')[0]
      this.port = this.host.includes(':') ? this.host.split(':')[1] : ''
      this.pathname = match[3] || '/'
      this.search = match[4] || ''
      this.hash = match[5] || ''
      this.origin = this.protocol + '//' + this.host
    }

    toString() {
      return this.origin + this.pathname + this.search + this.hash
    }

    get href() { return this.toString() }
  }
}

if (typeof root.TextEncoder === 'undefined') {
  root.TextEncoder = class TextEncoder {
    get encoding() {
      return 'utf-8'
    }

    encode(input = '') {
      const text = unescape(encodeURIComponent(String(input)))
      const bytes = new Uint8Array(text.length)
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
      return bytes
    }

    encodeInto(input, destination) {
      const bytes = this.encode(input)
      const written = Math.min(bytes.length, destination.length)
      destination.set(bytes.subarray(0, written))
      return { read: String(input).length, written }
    }
  }
}

if (typeof root.TextDecoder === 'undefined') {
  root.TextDecoder = class TextDecoder {
    constructor() {
      this.encoding = 'utf-8'
    }

    decode(input) {
      if (!input) return ''
      const bytes = input instanceof Uint8Array
        ? input
        : new Uint8Array(input.buffer || input, input.byteOffset || 0, input.byteLength)
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
      }
      try {
        return decodeURIComponent(escape(binary))
      } catch (_) {
        return binary
      }
    }
  }
}

if (typeof root.AbortController === 'undefined') {
  class AbortSignal {
    constructor() {
      this.aborted = false
      this.reason = undefined
      this.listeners = []
    }

    addEventListener(type, listener) {
      if (type === 'abort' && typeof listener === 'function') this.listeners.push(listener)
    }

    removeEventListener(type, listener) {
      if (type !== 'abort') return
      this.listeners = this.listeners.filter((item) => item !== listener)
    }

    throwIfAborted() {
      if (this.aborted) throw this.reason || new Error('操作已取消')
    }
  }

  root.AbortController = class AbortController {
    constructor() {
      this.signal = new AbortSignal()
    }

    abort(reason) {
      if (this.signal.aborted) return
      this.signal.aborted = true
      this.signal.reason = reason
      const event = { type: 'abort', target: this.signal }
      for (const listener of this.signal.listeners.slice()) listener.call(this.signal, event)
    }
  }
}
