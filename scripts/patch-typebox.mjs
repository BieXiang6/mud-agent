import { readFile, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const emitTarget = fileURLToPath(new URL('../node_modules/typebox/build/guard/emit.mjs', import.meta.url))
const emailTarget = fileURLToPath(new URL('../node_modules/typebox/build/format/idn_email.mjs', import.meta.url))
const hashTarget = fileURLToPath(new URL('../node_modules/typebox/build/system/hashing/hash.mjs', import.meta.url))
const unicodePattern = String.raw`/^[\p{ID_Start}_$][\p{ID_Continue}_$\u200C\u200D]*$/u`
const legacyPattern = '/^[A-Za-z_$][A-Za-z0-9_$]*$/'
const idnEmailLine = String.raw`const IdnEmail = /^(?!.*\.\.)[\p{L}\p{N}!#$%&'*+/=?^_` + '`' + String.raw`{|}~-]+(?:\.[\p{L}\p{N}!#$%&'*+/=?^_` + '`' + String.raw`{|}~-]+)*@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)*$/iu;`
const legacyEmailLine = String.raw`const IdnEmail = /^(?!.*\.\.)[^\s@]+@[^\s@]+\.[^\s@]+$/i;`
const textEncoderBlock = `const encoder = new TextEncoder();\nfunction FromString(value) {\n    FNV1A64_OP(ByteMarker.String);\n    for (const byte of encoder.encode(value)) {`
const legacyEncoderBlock = `function EncodeUtf8(value) {\n    const binary = unescape(encodeURIComponent(value));\n    const bytes = new Uint8Array(binary.length);\n    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);\n    return bytes;\n}\nfunction FromString(value) {\n    FNV1A64_OP(ByteMarker.String);\n    for (const byte of EncodeUtf8(value)) {`
const bigintZeroLiteral = 'BigInt(dividend) % BigInt(divisor) === 0n'
const legacyBigintZero = 'BigInt(dividend) % BigInt(divisor) === BigInt(0)'
const piAiDist = fileURLToPath(new URL('../node_modules/@earendil-works/pi-ai/dist', import.meta.url))
const eventStreamTarget = fileURLToPath(new URL('../node_modules/@earendil-works/pi-ai/dist/utils/event-stream.js', import.meta.url))
const agentTarget = fileURLToPath(new URL('../node_modules/@earendil-works/pi-agent-core/dist/agent.js', import.meta.url))

async function patchClassFields() {
  const eventSource = await readFile(eventStreamTarget, 'utf8')
  const compatibleEventSource = eventSource.replace(
    `export class EventStream {\n    queue = [];\n    waiting = [];\n    done = false;\n    finalResultPromise;\n    resolveFinalResult;\n    isComplete;\n    extractResult;\n    constructor(isComplete, extractResult) {\n        this.isComplete = isComplete;`,
    `export class EventStream {\n    constructor(isComplete, extractResult) {\n        this.queue = [];\n        this.waiting = [];\n        this.done = false;\n        this.isComplete = isComplete;`
  )
  if (compatibleEventSource !== eventSource) await writeFile(eventStreamTarget, compatibleEventSource, 'utf8')

  const agentSource = await readFile(agentTarget, 'utf8')
  const compatibleAgentSource = agentSource
    .replace(
      `class PendingMessageQueue {\n    messages = [];\n    mode;\n    constructor(mode) {\n        this.mode = mode;`,
      `class PendingMessageQueue {\n    constructor(mode) {\n        this.messages = [];\n        this.mode = mode;`
    )
    .replace(/export class Agent \{\n[\s\S]*?    constructor\(options\) \{/, `export class Agent {\n    constructor(options) {\n        this.listeners = new Set();`)
  if (compatibleAgentSource !== agentSource) await writeFile(agentTarget, compatibleAgentSource, 'utf8')
}

async function patchPiAiLogicalAssignments(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const target = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      await patchPiAiLogicalAssignments(target)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const source = await readFile(target, 'utf8')
    const compatible = source
      .replace(/output\.responseId \|\|= ([^;]+);/g, 'if (!output.responseId) output.responseId = $1;')
      .replace(/output\.responseModel \|\|= ([^;]+);/g, 'if (!output.responseModel) output.responseModel = $1;')
      .replace(/openRouterImagesProviderModulePromise \|\|= ([^;]+);/g, 'if (!openRouterImagesProviderModulePromise) openRouterImagesProviderModulePromise = $1;')
    if (compatible !== source) await writeFile(target, compatible, 'utf8')
  }
}

try {
  const emitSource = await readFile(emitTarget, 'utf8')
  if (emitSource.includes(unicodePattern)) {
    await writeFile(emitTarget, emitSource.replace(unicodePattern, legacyPattern), 'utf8')
  }
  const emailSource = await readFile(emailTarget, 'utf8')
  if (emailSource.includes(idnEmailLine)) {
    await writeFile(emailTarget, emailSource.replace(idnEmailLine, legacyEmailLine), 'utf8')
  }
  const hashSource = await readFile(hashTarget, 'utf8')
  if (hashSource.includes(textEncoderBlock)) {
    await writeFile(hashTarget, hashSource.replace(textEncoderBlock, legacyEncoderBlock), 'utf8')
  }
  const guardTarget = fileURLToPath(new URL('../node_modules/typebox/build/guard/guard.mjs', import.meta.url))
  const guardSource = await readFile(guardTarget, 'utf8')
  if (guardSource.includes(bigintZeroLiteral)) {
    await writeFile(guardTarget, guardSource.replaceAll(bigintZeroLiteral, legacyBigintZero), 'utf8')
  }
  await patchPiAiLogicalAssignments(piAiDist)
  await patchClassFields()
  console.log('Dependencies are compatible with the App legacy JS engine.')
} catch (error) {
  if (error && error.code === 'ENOENT') {
    console.warn('TypeBox patch skipped because the dependency is not installed.')
  } else {
    throw error
  }
}
