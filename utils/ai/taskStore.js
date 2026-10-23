import { normalizeConversation } from './conversation.js'
import { runtime } from '../platform/index.js'

const TASKS_STORAGE_KEY = 'mud_ai_tasks_v1'
const MAX_TASKS = 30

function storageKey(accountId = '') {
  return accountId ? 'mud_ai_account_tasks_v1:' + encodeURIComponent(accountId) : TASKS_STORAGE_KEY
}

function storageGet(accountId) {
  return runtime.getStorageSync(storageKey(accountId))
}

function storageSet(value, accountId) {
  runtime.setStorageSync(storageKey(accountId), value)
}

function taskId() {
  return 'task-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

export function createStoredTask(modelProfileId = '') {
  const now = Date.now()
  return {
    id: taskId(),
    title: '新任务',
    createdAt: now,
    updatedAt: now,
    modelProfileId,
    conversation: [],
    summary: '',
    contextStartIndex: 0,
    compressionCount: 0,
    activatedSkills: [],
    activatedToolGroups: []
  }
}

function normalizeTask(task) {
  const createdAt = Number(task && task.createdAt) || Date.now()
  const conversation = normalizeConversation(task && task.conversation)
  const activatedSkills = Array.from(new Set((Array.isArray(task && task.activatedSkills) ? task.activatedSkills : [])
    .map((name) => String(name || '').trim())
    .filter((name) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)))).slice(0, 20)
  const activatedToolGroups = Array.from(new Set((Array.isArray(task && task.activatedToolGroups) ? task.activatedToolGroups : [])
    .map((name) => String(name || '').trim())
    .filter((name) => ['appearance', 'script'].includes(name))))
  return {
    id: String(task && task.id || taskId()),
    title: String(task && task.title || '新任务').slice(0, 60),
    createdAt,
    updatedAt: Number(task && task.updatedAt) || createdAt,
    modelProfileId: String(task && task.modelProfileId || ''),
    conversation,
    summary: String(task && task.summary || ''),
    contextStartIndex: Math.max(0, Math.min(Number(task && task.contextStartIndex) || 0, conversation.length)),
    compressionCount: Math.max(0, Number(task && task.compressionCount) || 0),
    activatedSkills,
    activatedToolGroups
  }
}

export function loadStoredTasks(accountId = '') {
  const raw = storageGet(accountId)
  if (!raw) return []
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed.map(normalizeTask).sort((a, b) => b.updatedAt - a.updatedAt) : []
  } catch (_) {
    return []
  }
}

export function saveStoredTasks(tasks, accountId = '') {
  const normalized = tasks.map(normalizeTask).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_TASKS)
  storageSet(JSON.stringify(normalized), accountId)
  return normalized
}
