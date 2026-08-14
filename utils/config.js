const viteEnv = import.meta.env || {}
const nodeEnv = typeof process !== 'undefined' && process.env ? process.env : {}

function envText(name, fallback = '') {
  const value = viteEnv[name] ?? nodeEnv[name]
  return String(value == null || value === '' ? fallback : value).trim()
}

function envInteger(name, fallback, min, max) {
  const value = Number(envText(name, fallback))
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(Math.trunc(value), max))
}

function envProtocol() {
  const value = envText('VITE_AI_DEFAULT_PROTOCOL', 'openai-completions')
  return value === 'openai-responses' ? value : 'openai-completions'
}

export const clientConfig = Object.freeze({
  game: Object.freeze({
    defaultHost: envText('VITE_GAME_DEFAULT_HOST'),
    defaultPort: envText('VITE_GAME_DEFAULT_PORT'),
    defaultCaptcha: envText('VITE_GAME_DEFAULT_CAPTCHA'),
    handshakeToken: envText('VITE_GAME_HANDSHAKE_TOKEN'),
    loginClientTag: envText('VITE_GAME_LOGIN_CLIENT_TAG'),
    nativeConnectTimeoutMs: envInteger('VITE_TCP_NATIVE_CONNECT_TIMEOUT_MS', 5000, 1000, 60000),
    fallbackConnectTimeoutMs: envInteger('VITE_TCP_FALLBACK_CONNECT_TIMEOUT_MS', 8000, 1000, 60000)
  }),
  release: Object.freeze({
    apiBaseUrl: envText('VITE_RELEASE_API_BASE_URL').replace(/\/+$/, ''),
    requestTimeoutMs: envInteger('VITE_RELEASE_REQUEST_TIMEOUT_MS', 5000, 1000, 60000)
  }),
  ai: Object.freeze({
    defaultBaseUrl: envText('VITE_AI_DEFAULT_BASE_URL').replace(/\/+$/, ''),
    defaultModel: envText('VITE_AI_DEFAULT_MODEL'),
    defaultProtocol: envProtocol(),
    defaultContextWindow: envInteger('VITE_AI_DEFAULT_CONTEXT_WINDOW', 128000, 4096, 2000000),
    defaultMaxTokens: envInteger('VITE_AI_DEFAULT_MAX_TOKENS', 8192, 256, 1000000)
  })
})

export function validateGameProtocolConfig() {
  const missing = []
  if (!clientConfig.game.handshakeToken) missing.push('VITE_GAME_HANDSHAKE_TOKEN')
  if (!clientConfig.game.loginClientTag) missing.push('VITE_GAME_LOGIN_CLIENT_TAG')
  return missing
}
