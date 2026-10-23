import { createMarketplaceStore, MarketError } from './marketplaceStore.js'

async function readBody(req) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 256 * 1024) throw new MarketError(413, '上传内容不能超过 256 KB')
    chunks.push(chunk)
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error()
    return input
  } catch (_) { throw new MarketError(400, '请求内容必须是 JSON 对象') }
}

export function createMarketplaceApi(options) {
  const store = createMarketplaceStore(options)
  return async function handleMarket(req, res, url, sendJson) {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    try {
      const itemMatch = url.pathname.match(/^\/api\/market\/items\/([a-f0-9-]{36})$/)
      let data
      let status = 200
      if (url.pathname === '/api/market/identities' && req.method === 'POST') {
        data = await store.registerIdentity(await readBody(req))
        status = 201
      } else if (url.pathname === '/api/market/items' && req.method === 'GET') {
        data = await store.list(Object.fromEntries(url.searchParams))
      } else if (itemMatch && req.method === 'GET') {
        data = await store.get(itemMatch[1])
      } else if (url.pathname === '/api/market/permission' && req.method === 'POST') {
        data = await store.permission((await readBody(req)).author, token)
      } else if (url.pathname === '/api/market/items' && req.method === 'POST') {
        data = await store.publish(await readBody(req), token)
        status = 201
      } else if (itemMatch && req.method === 'PUT') {
        data = await store.publish(await readBody(req), token, itemMatch[1])
      } else if (itemMatch && req.method === 'DELETE') {
        data = await store.remove(itemMatch[1], await readBody(req), token)
      } else {
        throw new MarketError(404, '市场接口不存在')
      }
      sendJson(res, status, { success: true, data })
    } catch (error) {
      const status = error instanceof MarketError ? error.status : 500
      if (status >= 500) console.error('[market-api]', error)
      sendJson(res, status, { success: false, error: status >= 500 ? '市场服务暂时不可用' : error.message })
    }
  }
}
