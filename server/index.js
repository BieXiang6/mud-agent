import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnvFiles } from './env.js'
import path from 'node:path'
import { createMarketplaceApi } from './marketplaceApi.js'

const DEFAULT_PORT = 4058
const DATA_URL = new URL('./release-data.json', import.meta.url)

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  })
  res.end(JSON.stringify(payload))
}

async function readReleaseData(dataUrl) {
  const raw = await readFile(dataUrl, 'utf8')
  const data = parseReleaseData(raw)
  if (!data.version || !data.announcement) throw new Error('release-data.json 缺少 version 或 announcement')
  return data
}

export function parseReleaseData(raw) {
  return JSON.parse(String(raw).replace(/^\uFEFF/, ''))
}

export function createReleaseServer({ dataUrl = DATA_URL, marketDataDir = process.env.MARKET_DATA_DIR || path.resolve('server/data/market'), marketClock = Date.now } = {}) {
  const handleMarket = createMarketplaceApi({ dataDir: marketDataDir, clock: marketClock })
  return createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, null)
      return
    }

    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname.startsWith('/api/market/')) {
      await handleMarket(req, res, url, sendJson)
      return
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { success: false, error: 'Method Not Allowed' })
      return
    }

    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    if (pathname === '/health') {
      sendJson(res, 200, { success: true, data: { status: 'ok' } })
      return
    }

    try {
      const data = await readReleaseData(dataUrl)
      if (pathname === '/api/version/latest') {
        sendJson(res, 200, { success: true, data: data.version })
        return
      }
      if (pathname === '/api/announcements/latest') {
        sendJson(res, 200, { success: true, data: data.announcement })
        return
      }
      sendJson(res, 404, { success: false, error: 'Not Found' })
    } catch (error) {
      console.error('[release-api]', error)
      sendJson(res, 500, { success: false, error: '发布信息读取失败' })
    }
  })
}

export function startReleaseServer(options = {}) {
  loadEnvFiles()
  const port = options.port ?? (Number(process.env.PORT) || DEFAULT_PORT)
  const host = options.host ?? (process.env.HOST || '0.0.0.0')
  const server = createReleaseServer(options)
  server.listen(port, host, () => {
    console.log(`Release API listening on http://${host}:${port}`)
  })
  return server
}

const entry = process.argv[1] ? pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href : ''
if (entry === import.meta.url) startReleaseServer()
