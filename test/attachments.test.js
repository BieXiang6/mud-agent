import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TEXT_ATTACHMENT_MAX_BYTES,
  formatTextAttachments,
  normalizeTextAttachments,
  validateNewTextAttachment
} from '../utils/ai/attachments.js'

test('normalizes and safely formats text attachments for the model', () => {
  const attachment = validateNewTextAttachment({ name: 'notes<1>.md', text: '\uFEFFhello' })
  assert.equal(attachment.text, 'hello')
  assert.match(formatTextAttachments([attachment]), /name="notes&lt;1&gt;\.md"/)
  assert.match(formatTextAttachments([attachment]), /\nhello\n<\/attachment>/)
})

test('rejects binary-looking and oversized attachments', () => {
  assert.throws(() => validateNewTextAttachment({ name: 'bad.bin', text: 'a\0b' }), /不是可读取的文本或代码文件/)
  assert.throws(() => validateNewTextAttachment({ name: 'bad.dat', text: '\uFFFD'.repeat(20) }), /不是可读取的文本或代码文件/)
  assert.throws(() => validateNewTextAttachment({ name: 'large.txt', text: 'x'.repeat(TEXT_ATTACHMENT_MAX_BYTES + 1) }), /超过 256 KiB/)
})

test('accepts C# and extensionless source files', () => {
  assert.equal(validateNewTextAttachment({ name: 'Program.cs', text: 'class Program {}' }).name, 'Program.cs')
  assert.equal(validateNewTextAttachment({ name: 'Dockerfile', text: 'FROM node:20' }).name, 'Dockerfile')
})

test('limits attachments restored from stored conversations', () => {
  const values = Array.from({ length: 5 }, (_, index) => ({ name: index + '.txt', text: 'ok' }))
  assert.equal(normalizeTextAttachments(values).length, 3)
})
