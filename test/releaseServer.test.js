import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createReleaseServer, parseReleaseData } from '../server/index.js'
import { parseEnvFile } from '../server/env.js'

test('parses dotenv values without exposing the local env file', () => {
  const values = parseEnvFile('HOST=127.0.0.1\nPORT="4058"\nTOKEN="line\\nvalue"\n')
  assert.deepEqual(values, { HOST: '127.0.0.1', PORT: '4058', TOKEN: 'line\nvalue' })
})

test('accepts release data saved with a UTF-8 BOM', () => {
  const data = parseReleaseData('\uFEFF{"version":{"versionName":"1.0.0"},"announcement":{}}')
  assert.equal(data.version.versionName, '1.0.0')
})

async function withServer(run) {
  const server = createReleaseServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const { port } = server.address()
    await run(`http://127.0.0.1:${port}`)
  } finally {
    server.close()
    await once(server, 'close')
  }
}

test('serves the latest version and announcement', async () => {
  await withServer(async (baseUrl) => {
    const versionResponse = await fetch(baseUrl + '/api/version/latest')
    const version = await versionResponse.json()
    assert.equal(versionResponse.status, 200)
    assert.equal(version.success, true)
    assert.match(version.data.versionName, /^\d+\.\d+\.\d+$/)
    assert.equal(Number.isInteger(version.data.versionCode), true)

    const announcementResponse = await fetch(baseUrl + '/api/announcements/latest')
    const announcement = await announcementResponse.json()
    assert.equal(announcementResponse.status, 200)
    assert.equal(announcement.success, true)
    assert.equal(announcement.data.id, '20260809-welcome')
    assert.ok(announcement.data.content)
  })
})

test('exposes health state and rejects unknown routes', async () => {
  await withServer(async (baseUrl) => {
    assert.equal((await fetch(baseUrl + '/health')).status, 200)
    assert.equal((await fetch(baseUrl + '/missing')).status, 404)
  })
})
