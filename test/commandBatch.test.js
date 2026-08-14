import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCommandBatch } from '../utils/ai/commandBatch.js'

test('accepts multiple game commands separated by newlines', () => {
  const result = validateCommandBatch('look\ngo north\nget sword')

  assert.equal(result.command, 'look\ngo north\nget sword')
  assert.deepEqual(result.commands, ['look', 'go north', 'get sword'])
  assert.deepEqual(result.verbs, ['look', 'go', 'get'])
})

test('normalizes CRLF and surrounding whitespace in command batches', () => {
  const result = validateCommandBatch('  look  \r\n  go north  ')

  assert.equal(result.command, 'look\ngo north')
})

test('checks the command blacklist for every command in a batch', () => {
  assert.throws(
    () => validateCommandBatch('look\ndrop sword', new Set(['drop'])),
    /第2条指令已被黑名单阻止：drop/
  )
})

test('rejects empty commands, semicolons, and protocol control characters', () => {
  assert.throws(() => validateCommandBatch('look\n\ngo north'), /第2条指令不能为空/)
  assert.throws(() => validateCommandBatch('look;go north'), /不允许发送分号或协议控制字符/)
  assert.throws(() => validateCommandBatch('look' + String.fromCharCode(27) + '020'), /不允许发送分号或协议控制字符/)
  assert.throws(() => validateCommandBatch('look\rgo north'), /指令只能使用换行符分隔/)
})
