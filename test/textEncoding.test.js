import test from 'node:test'
import assert from 'node:assert/strict'

import { consumableBoundary, decodeText, encodeText, normalizeTextEncoding } from '../utils/textEncoding.js'

test('UTF-8 encodes and decodes Chinese text', () => {
  const bytes = encodeText('踏入江湖\n', 'utf-8')
  assert.equal(decodeText(bytes, 'utf-8'), '踏入江湖\n')
  assert.equal(normalizeTextEncoding('UTF8'), 'utf-8')
})

test('UTF-8 boundary retains an incomplete multibyte character', () => {
  const bytes = encodeText('A江', 'utf-8')
  assert.equal(consumableBoundary(bytes.subarray(0, bytes.length - 1), 'utf-8'), 1)
  assert.equal(consumableBoundary(bytes, 'utf-8'), bytes.length)
})

test('GBK behavior remains available', () => {
  const bytes = encodeText('江湖', 'gbk')
  assert.equal(decodeText(bytes, 'gbk'), '江湖')
  assert.equal(consumableBoundary(bytes.subarray(0, 3), 'gbk'), 2)
})
