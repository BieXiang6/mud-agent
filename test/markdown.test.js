import test from 'node:test'
import assert from 'node:assert/strict'
import { markdownToHtml } from '../utils/markdown.js'

test('renders common markdown blocks used in AI answers', () => {
  const html = markdownToHtml('# 标题\n\n- **重点**\n- `代码`\n\n> 引用')

  assert.match(html, /<h1>标题<\/h1>/)
  assert.match(html, /<ul><li><strong>重点<\/strong><\/li><li><code>代码<\/code><\/li><\/ul>/)
  assert.match(html, /<blockquote>引用<\/blockquote>/)
})

test('escapes raw HTML and rejects unsafe markdown links', () => {
  const html = markdownToHtml('<script>alert(1)</script> [危险](javascript:alert(1)) [安全](https://example.com)')

  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(html, /href="javascript:/)
  assert.match(html, /href="https:\/\/example\.com"/)
})

test('renders fenced code and markdown tables', () => {
  const html = markdownToHtml('```js\nconst x = 1 < 2\n```\n\n名称 | 值\n--- | ---\nA | 1')

  assert.match(html, /<pre><code data-language="js">const x = 1 &lt; 2<\/code><\/pre>/)
  assert.match(html, /<table><thead>/)
  assert.match(html, /<td>A<\/td><td>1<\/td>/)
})
