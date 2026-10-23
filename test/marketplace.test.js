import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { createReleaseServer } from '../server/index.js'
import { createMarketplaceStore } from '../server/marketplaceStore.js'
const script = { type: 'script', name: '巡逻', description: '查看房间', version: '1.0.0', payload: { source: 'exports.main = async () => game.get("here");' } }
const skill = { type: 'skill', name: 'room-guide', description: '房间导航', version: '1.0.0', payload: { content: '查看房间，然后说明可走方向。' } }
const authorOf = identity => ({ nickname: identity.nickname, account: identity.account })
async function withMarket(run, { clock } = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'mud-market-test-'))
  const store = createMarketplaceStore({ dataDir, clock })
  const server = createReleaseServer({ marketDataDir: dataDir, marketClock: clock })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = 'http://127.0.0.1:' + server.address().port
  async function request(route, method = 'GET', data, signature) {
    const response = await fetch(base + '/api/market' + route, { method,
      headers: { 'Content-Type': 'application/json', ...(signature ? { Authorization: 'Bearer ' + signature } : {}) },
      body: data === undefined ? undefined : JSON.stringify(data) })
    return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers }
  }
  try { await run({ store, request, dataDir }) }
  finally { server.close(); await once(server, 'close'); await rm(dataDir, { recursive: true, force: true }) }
}
test('unique nicknames issue a private signature only once, including concurrent normalized duplicates', async () => {
  await withMarket(async ({ request, dataDir }) => {
    const results = await Promise.all(['Hero', 'Ｈｅｒｏ', ' hero '].map(nickname => request('/identities', 'POST', { nickname, account: 'game-hero' })))
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409, 409])
    const identity = results.find(r => r.status === 201).body.data
    assert.match(identity.privateSignature, /^[A-Za-z0-9_-]{43}$/)
    const duplicate = await request('/identities', 'POST', { nickname: identity.nickname, account: identity.account })
    assert.equal(duplicate.status, 409)
    assert.match(duplicate.body.error, /旧客户端/)
    assert.ok(!JSON.stringify(duplicate.body).includes(identity.privateSignature))
    assert.equal((await request('/identities', 'POST', { nickname: '另起昵称', account: identity.account })).status, 409)
    const persisted = await readFile(path.join(dataDir, 'identities.json'), 'utf8')
    assert.ok(!persisted.includes(identity.privateSignature))
    assert.match(JSON.parse(persisted)[0].signatureHash, /^[a-f0-9]{64}$/)
    assert.equal((await request('/credentials', 'POST', { author: { account: 'game-hero' } })).status, 404)
    for (const nickname of ['', '<name>', 'a'.repeat(41), 'hello\nworld']) {
      assert.equal((await request('/identities', 'POST', { nickname, account: 'game-hero' })).status, 400)
    }
  })
})
test('signature authorizes the same account across servers, and only the original nickname can update', async () => {
  await withMarket(async ({ store, request, dataDir }) => {
    const identity = await store.registerIdentity({ nickname: '江湖客', account: 'hero' })
    const other = await store.registerIdentity({ nickname: '另一个作者', account: 'other' })
    const author = authorOf(identity)
    const first = await request('/items', 'POST', { ...script, author: { ...author, host: 'one.test', captcha: '_5' }, authorId: other.id, updatedAt: 1 }, identity.privateSignature)
    assert.equal(first.status, 201)
    const item = first.body.data
    assert.equal(item.authorId, identity.id)
    assert.deepEqual(item.author, author)
    assert.ok(item.updatedAt > 1)
    assert.equal(item.payload, undefined)
    const next = await request('/items/' + item.id, 'PUT', { ...script, version: '2', expectedRevision: 1,
      author: { ...author, host: 'another.test', port: '9000', captcha: '_6' } }, identity.privateSignature)
    assert.equal(next.status, 200)
    assert.equal(next.body.data.revision, 2)
    assert.equal(next.body.data.createdAt, item.createdAt)
    assert.ok(next.body.data.updatedAt > item.updatedAt)
    assert.equal((await request('/items/' + item.id, 'PUT', { ...script, version: '3', expectedRevision: 2, author: authorOf(other) }, other.privateSignature)).status, 403)
    assert.equal((await request('/permission', 'POST', { author }, other.privateSignature)).status, 401)
    assert.equal((await request('/permission', 'POST', { author: { ...author, account: 'wrong' } }, identity.privateSignature)).status, 403)
    assert.equal((await request('/permission', 'POST', { author })).status, 401)
    const reopened = createMarketplaceStore({ dataDir })
    assert.equal((await reopened.permission(author, identity.privateSignature)).id, identity.id)
    assert.equal((await request('/items', 'POST', { ...skill, author }, identity.privateSignature)).status, 201)
    assert.equal((await request('/items?q=' + encodeURIComponent('江湖客'))).body.data.total, 2)
    assert.equal((await request('/items?type=script')).body.data.total, 1)
    assert.equal((await request('/items?offset=1&limit=1')).body.data.items.length, 1)
    assert.equal((await request('/items?owner=' + other.id)).body.data.total, 0)
    assert.equal((await request('/items/' + item.id)).body.data.payload.source, script.payload.source)
    assert.equal((await request('/items', 'OPTIONS')).headers.get('access-control-allow-methods').includes('PUT'), true)
  })
})
test('nickname and account blocks immediately deny publishing and registration without deleting public content', async () => {
  await withMarket(async ({ store, request }) => {
    const identity = await store.registerIdentity({ nickname: '测试作者', account: 'hero' })
    const author = authorOf(identity)
    const item = (await request('/items', 'POST', { ...script, author }, identity.privateSignature)).body.data
    await store.setBlocked(identity.nickname, true)
    assert.equal((await request('/permission', 'POST', { author }, identity.privateSignature)).status, 403)
    assert.equal((await request('/items/' + item.id, 'PUT', { ...script, version: '2', expectedRevision: 1, author }, identity.privateSignature)).status, 403)
    assert.equal((await request('/items/' + item.id)).status, 200)
    await store.setBlocked(identity.nickname, false)
    await store.setAccountBlocked('hero', true)
    assert.equal((await request('/identities', 'POST', { nickname: '试图换昵称', account: 'hero' })).status, 403)
    assert.equal((await request('/items', 'POST', { ...skill, author }, identity.privateSignature)).status, 403)
    await store.setAccountBlocked('hero', false)
    assert.equal((await request('/permission', 'POST', { author }, identity.privateSignature)).status, 200)
    await store.setBlocked('预禁用', true)
    assert.equal((await request('/identities', 'POST', { nickname: '预禁用', account: 'new-account' })).status, 403)
    await store.setBlocked('预禁用', false)
    assert.equal((await request('/identities', 'POST', { nickname: '预禁用', account: 'new-account' })).status, 201)
  })
})
test('validates content and rejects duplicates, stale revisions and concurrent updates', async () => {
  await withMarket(async ({ store, request }) => {
    const identity = await store.registerIdentity({ nickname: 'validator', account: 'hero' })
    const author = authorOf(identity), signature = identity.privateSignature
    const item = (await request('/items', 'POST', { ...script, author }, signature)).body.data
    assert.equal((await request('/items', 'POST', { ...script, author }, signature)).status, 409)
    const route = '/items/' + item.id
    assert.equal((await request(route, 'PUT', { ...script, expectedRevision: 1, author }, signature)).status, 409)
    assert.equal((await request(route, 'PUT', { ...script, version: '2', author }, signature)).status, 409)
    assert.equal((await request('/items', 'POST', { ...skill, name: 'Bad Name', author }, signature)).status, 400)
    assert.equal((await request('/items', 'POST', { ...script, name: 'unsafe', payload: { source: 'exports.main = () => process.exit();' }, author }, signature)).status, 400)
    assert.equal((await request('/items', 'POST', { ...skill, payload: { content: 'x'.repeat(20001) }, author }, signature)).status, 400)
    assert.equal((await request('/items', 'POST', { ...skill, description: '', author }, signature)).status, 400)
    assert.equal((await request('/items', 'POST', { ...skill, extra: 'x'.repeat(270000), author }, signature)).status, 413)
    assert.equal((await request('/items', 'POST', [], signature)).status, 400)
    assert.equal((await request('/items?type=unknown')).status, 400)
    const updates = await Promise.all(['2', '3'].map(version => request(route, 'PUT', { ...script, version, author, expectedRevision: 1 }, signature)))
    assert.deepEqual(updates.map(result => result.status).sort(), [200, 409])
    assert.equal((await request('/items')).body.data.total, 1)
  })
})
test('legacy public entries remain readable and old credentials cannot take over nickname identities', async () => {
  await withMarket(async ({ request, dataDir }) => {
    await writeFile(path.join(dataDir, 'items.json'), JSON.stringify([{ id: '00000000-0000-0000-0000-000000000000', ...script,
      authorId: 'legacy-id', author: { host: 'old.test', port: '4057', account: 'legacy', captcha: '_5' }, updatedAt: 1 }]))
    assert.equal((await request('/items')).body.data.total, 1)
    assert.equal((await request('/items?q=legacy')).body.data.total, 1)
    assert.equal((await request('/permission', 'POST', { author: { account: 'legacy', host: 'old.test', port: '4057', captcha: '_5' } }, 'a'.repeat(43))).status, 400)
  })
})

test('authors delete their own items while the verified 想都别想 identity can delete any author', async () => {
  await withMarket(async ({ store, request, dataDir }) => {
    const owner = await store.registerIdentity({ nickname: '作者甲', account: 'a' })
    const stranger = await store.registerIdentity({ nickname: '作者乙', account: 'b' })
    const admin = await store.registerIdentity({ nickname: '想都别想', account: 'admin' })
    const create = (content, identity) => request('/items', 'POST', { ...content, author: authorOf(identity) }, identity.privateSignature)
    const first = (await create(script, owner)).body.data
    const route = '/items/' + first.id
    const body = identity => ({ author: authorOf(identity), expectedRevision: first.revision })
    assert.equal((await request(route, 'DELETE', body(owner))).status, 401)
    assert.equal((await request(route, 'DELETE', body(stranger), stranger.privateSignature)).status, 403)
    assert.equal((await request(route, 'DELETE', { ...body(owner), author: authorOf(admin) }, stranger.privateSignature)).status, 401)
    assert.equal((await request(route, 'DELETE', { ...body(owner), expectedRevision: 0 }, owner.privateSignature)).status, 409)
    assert.equal((await request(route)).status, 200)
    assert.equal((await request(route, 'DELETE', body(owner), owner.privateSignature)).body.data.deleted, true)
    assert.equal((await request(route)).status, 404)
    assert.equal((await request(route, 'DELETE', body(owner), owner.privateSignature)).status, 404)
    const second = (await create(skill, stranger)).body.data
    assert.equal((await request('/permission', 'POST', { author: authorOf(owner) }, owner.privateSignature)).body.data.canDeleteAll, false)
    assert.equal((await request('/permission', 'POST', { author: authorOf(admin) }, admin.privateSignature)).body.data.canDeleteAll, true)
    await store.setBlocked(admin.nickname, true)
    const adminBody = { author: authorOf(admin), expectedRevision: second.revision }
    assert.equal((await request('/items/' + second.id, 'DELETE', adminBody, admin.privateSignature)).status, 403)
    await store.setBlocked(admin.nickname, false)
    assert.equal((await request('/items/' + second.id, 'DELETE', adminBody, admin.privateSignature)).status, 200)
    assert.equal((await request('/items')).body.data.total, 0)
    assert.deepEqual(JSON.parse(await readFile(path.join(dataDir, 'items.json'), 'utf8')).items, [])
    assert.ok((await request('/items', 'OPTIONS')).headers.get('access-control-allow-methods').includes('DELETE'))
  })
})

test('daily quota combines skills and scripts, persists through deletion/restart, and excludes updates and failed uploads', async () => {
  const timestamp = Date.parse('2026-10-21T03:00:00Z')
  await withMarket(async ({ store, request, dataDir }) => {
    const identity = await store.registerIdentity({ nickname: '限额作者', account: 'quota-account' })
    const author = authorOf(identity), signature = identity.privateSignature
    const publish = (content, index) => request('/items', 'POST', { ...content, name: 'quota-item-' + index, author, createdAt: 1 }, signature)
    assert.equal((await publish({ ...skill, description: '' }, 'invalid')).status, 400)
    const created = []
    for (let index = 0; index < 4; index++) {
      const result = await publish(index % 2 ? skill : script, index)
      assert.equal(result.status, 201)
      created.push(result.body.data)
    }
    assert.equal((await publish(script, 4)).status, 429)
    const quota = (await request('/permission', 'POST', { author }, signature)).body.data.dailyUploadQuota
    assert.deepEqual(quota, { day: '2026-10-21', timeZone: 'Asia/Shanghai', unlimited: false, limit: 4, used: 4, remaining: 0,
      resetAt: Date.parse('2026-10-21T16:00:00Z') })
    const first = created[0]
    assert.equal((await request('/items/' + first.id, 'PUT', { ...script, name: first.name, version: '2', expectedRevision: first.revision, author }, signature)).status, 200)
    assert.equal((await request('/items/' + first.id, 'DELETE', { expectedRevision: 2, author }, signature)).status, 200)
    assert.equal((await publish(script, 5)).status, 429)
    const reopened = createMarketplaceStore({ dataDir, clock: () => timestamp })
    assert.equal((await reopened.permission(author, signature)).dailyUploadQuota.used, 4)
    const another = await store.registerIdentity({ nickname: '另一限额作者', account: 'other-quota-account' })
    assert.equal((await request('/items', 'POST', { ...skill, author: authorOf(another) }, another.privateSignature)).status, 201)
    assert.equal((await request('/items', 'POST', { ...script, author: { ...author, account: another.account } }, signature)).status, 403)
  }, { clock: () => timestamp })
})

test('concurrent new uploads cannot exceed four and the verified 想都别想 identity is exempt', async () => {
  await withMarket(async ({ store, request }) => {
    const identity = await store.registerIdentity({ nickname: '并发作者', account: 'concurrent-account' })
    const author = authorOf(identity)
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => request('/items', 'POST', {
      ...script, name: 'concurrent-' + index, author }, identity.privateSignature)))
    assert.equal(results.filter(result => result.status === 201).length, 4)
    assert.equal(results.filter(result => result.status === 429).length, 6)
    const admin = await store.registerIdentity({ nickname: '想都别想', account: 'unlimited-account' })
    const exempt = await Promise.all(Array.from({ length: 8 }, (_, index) => request('/items', 'POST', {
      ...(index % 2 ? skill : script), name: 'unlimited-' + index, author: authorOf(admin) }, admin.privateSignature)))
    assert.ok(exempt.every(result => result.status === 201))
    const permission = (await request('/permission', 'POST', { author: authorOf(admin) }, admin.privateSignature)).body.data
    assert.equal(permission.dailyUploadQuota.unlimited, true)
    assert.equal(permission.dailyUploadQuota.remaining, null)
    assert.equal((await request('/items', 'POST', { ...script, name: 'spoof-admin', author: authorOf(admin) }, identity.privateSignature)).status, 401)
  })
})

test('legacy uploads count toward the current day and quota resets precisely at Shanghai midnight', async () => {
  let timestamp = Date.parse('2026-10-21T15:59:59.999Z')
  await withMarket(async ({ store, request, dataDir }) => {
    const identity = await store.registerIdentity({ nickname: '跨日作者', account: 'midnight-account' })
    const author = authorOf(identity), signature = identity.privateSignature
    const legacy = Array.from({ length: 4 }, (_, index) => ({ ...script, id: '00000000-0000-0000-0000-' + String(index).padStart(12, '0'),
      name: 'legacy-' + index, author, authorId: identity.id, revision: 1, createdAt: timestamp - 1000, updatedAt: timestamp - 1000 }))
    await writeFile(path.join(dataDir, 'items.json'), JSON.stringify(legacy))
    const publish = () => request('/items', 'POST', { ...script, name: 'new-day', author }, signature)
    assert.equal((await publish()).status, 429)
    assert.equal((await request('/items/' + legacy[0].id, 'DELETE', { author, expectedRevision: 1 }, signature)).status, 200)
    assert.equal((await publish()).status, 429)
    timestamp++
    const quota = (await request('/permission', 'POST', { author }, signature)).body.data.dailyUploadQuota
    assert.equal(quota.day, '2026-10-22')
    assert.equal(quota.used, 0)
    assert.equal(quota.remaining, 4)
    assert.equal((await publish()).status, 201)
    assert.equal((await request('/permission', 'POST', { author }, signature)).body.data.dailyUploadQuota.used, 1)
  }, { clock: () => timestamp })
})
