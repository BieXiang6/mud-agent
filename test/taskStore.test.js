import test from 'node:test'
import assert from 'node:assert/strict'
import { configurePlatform, resetPlatform } from '../utils/platform/index.js'

const storage = new Map()
configurePlatform({
  name: 'task-store-test',
  openSocket() {},
  getStorageSync(key) { return storage.get(key) },
  setStorageSync(key, value) { storage.set(key, value) },
  removeStorageSync(key) { storage.delete(key) }
})

const { createStoredTask, loadStoredTasks, saveStoredTasks } = await import('../utils/ai/taskStore.js')

test('persists task-level activated skills and tool groups without duplicates', () => {
  const task = createStoredTask('model-1')
  task.activatedSkills.push('write-game-script', 'write-game-script', 'INVALID')
  task.activatedToolGroups.push('script', 'script', 'unknown')
  saveStoredTasks([task])
  const loaded = loadStoredTasks()[0]
  assert.deepEqual(loaded.activatedSkills, ['write-game-script'])
  assert.deepEqual(loaded.activatedToolGroups, ['script'])
  resetPlatform()
})

test('persists normalized text attachments with conversation turns', () => {
  configurePlatform({
    name: 'task-store-attachment-test',
    openSocket() {},
    getStorageSync(key) { return storage.get(key) },
    setStorageSync(key, value) { storage.set(key, value) },
    removeStorageSync(key) { storage.delete(key) }
  })
  const task = createStoredTask('model-1')
  task.conversation.push({ role: 'user', text: '总结', attachments: [{ name: 'notes.md', text: 'hello' }] })
  saveStoredTasks([task])
  const attachment = loadStoredTasks()[0].conversation[0].attachments[0]
  assert.deepEqual(attachment, { name: 'notes.md', text: 'hello', size: 5 })
  resetPlatform()
})
