import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { configurePlatform, resetPlatform } from '../utils/platform/index.js'
import { state } from '../utils/store.js'
import { beginAccountLogin, closeGameSession, gameSessions } from '../utils/gameSessions.js'
import { createReleaseServer } from '../server/index.js'
import { currentMarketAuthor, deleteMarketItem, getMarketIdentity, registerMarketIdentity, exportMarketIdentityText, importMarketIdentityText, checkMarketPermission, installMarketItem, installedMarketTarget, listPublishableItems, marketItemFile, publishMarketItem } from '../utils/marketplaceApi.js'
import { getAiSkill } from '../utils/ai/skills.js'
import { getStoredScript } from '../utils/ai/scriptStore.js'

test('nickname signatures transfer between clients, retain authorship and bind only the game account', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'mud-market-client-'))
  const server = createReleaseServer({ marketDataDir: dataDir })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base = 'http://127.0.0.1:' + server.address().port
  let storage = new Map([['mud_release_api_url', base]])
  const requests = []
  configurePlatform({ openSocket() {}, getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value),
    async request(options) {
      requests.push(options)
      try {
        const response = await fetch(options.url, { method: options.method, headers: options.headers, body: options.method === 'GET' ? undefined : options.body })
        options.success({ statusCode: response.status, data: await response.json() })
      } catch (e) { options.fail(e) }
    }
  })
  const game = { host: 'game.test', port: '4057', account: 'hero', password: 'private-password', captcha: '_5', encoding: 'utf-8' }
  const login = profile => { beginAccountLogin(profile); state.connected = true; state.stage = 'loginok' }
  const content = { type: 'script', name: 'look', description: '看房间', version: '1.0', payload: { source: 'exports.main = () => 1;' } }
  try {
    login(game)
    assert.equal(currentMarketAuthor(), null)
    const created = await registerMarketIdentity('江湖客')
    assert.deepEqual(currentMarketAuthor(), created)
    const exported = exportMarketIdentityText()
    assert.ok(!exported.includes(game.host) && !exported.includes(game.captcha) && !exported.includes(game.password))
    const savedDevice = storage
    const item = await publishMarketItem(content)
    const publishRequest = requests.at(-1)
    assert.deepEqual(publishRequest.data.author, { nickname: '江湖客', account: 'hero' })
    assert.deepEqual(publishRequest.header, publishRequest.headers)
    assert.equal(JSON.parse(publishRequest.body).author.host, undefined)
    assert.ok(!publishRequest.body.includes(game.password))
    login({ ...game, host: 'elsewhere.test', port: '5000', captcha: '_9' })
    assert.equal(currentMarketAuthor().id, created.id)
    assert.equal((await checkMarketPermission()).id, created.id)
    // A fresh client knows the nickname but has no private signature.
    storage = new Map([['mud_release_api_url', base]])
    assert.equal(currentMarketAuthor(), null)
    assert.throws(() => publishMarketItem(content), /导入私密签名/)
    await assert.rejects(registerMarketIdentity('江湖客'), /昵称已存在/)
    await assert.rejects(registerMarketIdentity('新客户端改昵称'), /此游戏账号已绑定昵称/)
    assert.equal(getMarketIdentity(), null)
    const wrong = { ...JSON.parse(exported), privateSignature: 'a'.repeat(43) }
    await assert.rejects(importMarketIdentityText(JSON.stringify(wrong)), /私密签名无效/)
    assert.equal(getMarketIdentity(), null)
    const imported = await importMarketIdentityText(exported)
    assert.equal(imported.id, created.id)
    assert.equal(getMarketIdentity().privateSignature, JSON.parse(exported).privateSignature)
    const updated = await publishMarketItem({ ...content, version: '2' }, item.id, item.revision, created.id)
    assert.equal(updated.authorId, created.id)
    assert.equal(updated.revision, 2)
    assert.throws(() => deleteMarketItem(updated, 'wrong-identity'), /昵称已切换/)
    assert.equal((await deleteMarketItem(updated, created.id)).deleted, true)
    assert.equal(requests.at(-1).method, 'DELETE')
    assert.equal(requests.at(-1).data.expectedRevision, 2)
    await assert.rejects(importMarketIdentityText(JSON.stringify({ ...JSON.parse(exported), nickname: '冒充昵称' })), /先导出旧签名/)
    await assert.rejects(importMarketIdentityText(JSON.stringify({ ...JSON.parse(exported), nickname: '冒充昵称' }), { replace: true }), /私密签名无效/)
    await assert.rejects(importMarketIdentityText('{invalid'), /有效 JSON/)
    assert.equal(currentMarketAuthor().id, created.id)
    login({ ...game, account: 'other' })
    assert.equal(currentMarketAuthor(), null)
    await assert.rejects(registerMarketIdentity('江湖客'), /昵称已存在/)
    const other = await registerMarketIdentity('另一昵称')
    assert.notEqual(other.id, created.id)
    assert.throws(() => publishMarketItem(content, '', undefined, created.id), /昵称已切换/)
    storage = savedDevice
    login(game)
    assert.equal(currentMarketAuthor().id, created.id)
    state.connected = false
    assert.equal(currentMarketAuthor(), null)
  } finally {
    for (const session of gameSessions.value) closeGameSession(session.id)
    resetPlatform(); server.close(); await once(server, 'close'); await rm(dataDir, { recursive: true, force: true })
  }
})

test('downloaded content reuses local validation and supports selection, replacement and file export without execution', () => {
  const storage = new Map()
  configurePlatform({ openSocket() {}, getStorageSync: key => storage.get(key), setStorageSync: (key, value) => storage.set(key, value) })
  const script = { id: 'test-script', type: 'script', name: 'market-script', description: '查看房间', version: '1.0', payload: { source: 'exports.main = () => game.get("here");' } }
  const skill = { id: 'test-skill', type: 'skill', name: 'market-guide', description: '房间指南', version: '1.0', payload: { content: '先查看当前房间。' } }
  try {
    assert.equal(installedMarketTarget(script), null)
    const result = installMarketItem(script)
    assert.equal(result.created, 1)
    assert.equal(getStoredScript('market-script').source, script.payload.source)
    assert.equal(JSON.parse(marketItemFile(script)).format, 'mud-agent-script')
    assert.equal(listPublishableItems('script')[0].key, result.scriptId)
    const renamed = { ...script, name: 'renamed', version: '2' }
    assert.equal(installedMarketTarget(renamed).id, result.scriptId)
    installMarketItem(renamed)
    assert.equal(getStoredScript(result.scriptId).name, 'renamed')
    installMarketItem(skill)
    assert.equal(getAiSkill(skill.name).content, skill.payload.content)
    assert.equal(installedMarketTarget(skill).name, skill.name)
    assert.ok(listPublishableItems('skill').some(item => item.key === skill.name))
    assert.throws(() => installMarketItem({ ...script, payload: { source: 'exports.main = () => process.exit();' } }), /受限全局对象/)
    assert.throws(() => installMarketItem({ ...skill, name: 'write-game-script' }), /不能覆盖内置/)
  } finally { resetPlatform() }
})
