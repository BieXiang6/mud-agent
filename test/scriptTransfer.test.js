import test from 'node:test'
import assert from 'node:assert/strict'
import { configurePlatform, resetPlatform } from '../utils/platform/index.js'

const storage = new Map()
configurePlatform({
  name: 'script-transfer-test',
  openSocket() {},
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) },
  removeStorageSync(key) { storage.delete(key) }
})

const { getStoredScript, listStoredScripts, saveStoredScript } = await import('../utils/ai/scriptStore.js')
const { exportStoredScriptText, importStoredScriptText, scriptBundleInfo } = await import('../utils/ai/scriptTransfer.js')

test('exports and imports exactly one validated script', () => {
  const saved = saveStoredScript({ name: 'alpha', description: 'first', source: 'exports.main = async function () { return 1; };' })
  const bundle = JSON.parse(exportStoredScriptText(saved.id))
  assert.equal(bundle.format, scriptBundleInfo.format)
  assert.equal(bundle.script.id, saved.id)
  bundle.script.source = 'exports.main = async function () { return 2; };'
  const result = importStoredScriptText(JSON.stringify(bundle))
  assert.deepEqual(result, { created: 0, updated: 1, total: 1, scriptId: saved.id, name: 'alpha' })
  assert.match(getStoredScript(saved.id).source, /return 2/)
})

test('rejects unsafe and multi-script bundles before changing stored scripts', () => {
  const before = listStoredScripts()
  const bundle = {
    format: scriptBundleInfo.format,
    version: scriptBundleInfo.version,
    script: { name: 'unsafe', source: 'exports.main = async function () { return window.location; };' }
  }
  assert.throws(() => importStoredScriptText(JSON.stringify(bundle)), /受限全局对象/)
  assert.throws(() => importStoredScriptText(JSON.stringify({
    format: 'mud-agent-scripts', version: 1, scripts: [bundle.script, bundle.script]
  })), /不允许批量导入/)
  assert.deepEqual(listStoredScripts(), before)
  resetPlatform()
})
