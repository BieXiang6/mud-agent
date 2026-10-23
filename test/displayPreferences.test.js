import test from 'node:test'
import assert from 'node:assert/strict'
import { configurePlatform, resetPlatform } from '../utils/platform/index.js'

test('scene and chat preferences survive login, reset, account changes and app restart', async () => {
  const storage = new Map()
  configurePlatform({
    openSocket() {},
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value)))
  })
  try {
    const store = await import('../utils/store.js?display-initial')
    const first = store.createGameState('first')
    assert.equal(first.longVisible, true)
    assert.equal(first.chatExpanded, true)
    first.longVisible = false
    first.chatExpanded = false
    assert.deepEqual(storage.get('mud_display_preferences'), { longVisible: false, chatExpanded: false })
    store.enterGame(first, () => {})
    store.resetAll(first)
    const second = store.createGameState('second')
    for (const state of [first, second]) {
      assert.equal(state.longVisible, false)
      assert.equal(state.chatExpanded, false)
    }
    const restarted = await import('../utils/store.js?display-restarted')
    assert.equal(restarted.state.longVisible, false)
    assert.equal(restarted.state.chatExpanded, false)
    restarted.state.longVisible = true
    assert.deepEqual(storage.get('mud_display_preferences'), { longVisible: true, chatExpanded: false })
    const reopened = await import('../utils/store.js?display-reopened')
    assert.equal(reopened.state.longVisible, true)
    assert.equal(reopened.state.chatExpanded, false)
  } finally {
    resetPlatform()
  }
})
