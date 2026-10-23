// TCP 协议核心层：负责编解码、分帧、队列和连接状态。
// 平台网络 API 由 utils/network/platform.js 注入，默认使用 uni-app 实现，
// Electron 等桌面端只需实现同一适配器接口。
// 负责: 建立连接 / 收发字节 / GBK、UTF-8 解码与按行分帧 / 注入发送函数给协议层
import { consumableBoundary, decodeText, encodeText, encodingLabel, normalizeTextEncoding, TEXT_ENCODING_UTF8 } from './textEncoding.js'


import { log, dbg, err, toHex, escapeStr, isDebugEnabled } from './log.js'
import { getPlatform as getNetworkPlatform, configurePlatform as setNetworkPlatform } from './platform/index.js'
import { clientConfig } from './config.js'

export function createNetworkClient(state, protocol, options = {}) {
const { handleLine, setSend, beginMessageBatch, endMessageBatch, resetMessageBatch } = protocol
const HANDSHAKE_LINE = clientConfig.game.handshakeToken
  ? clientConfig.game.handshakeToken.replace(/[\r\n]+$/, '') + '\n'
  : ''

// 动态判断，避免模块初始化早于平台运行时注入。
function isAndroidApp() {
  const platform = getNetworkPlatform()
  return Boolean(platform.isAndroidApp && platform.isAndroidApp())
}

let android = null

let nativeTcp = null
let nativeTcpChecked = false
let nativeTcpActive = false

function getNativeTcp() {
  if (options.disableNativeTcp || !isAndroidApp()) return null
  if (nativeTcpChecked) return nativeTcp
  nativeTcpChecked = true
  try {
    const platform = getNetworkPlatform()
    const plugin = platform.getNativeTcpPlugin ? platform.getNativeTcpPlugin() : null
    if (plugin && typeof plugin.connect === 'function' && typeof plugin.send === 'function') {
      if (options.sessionId) {
        if (typeof plugin.connectSession !== 'function' || typeof plugin.sendSession !== 'function' || typeof plugin.closeSession !== 'function') return null
        nativeTcp = {
          connect: (host, port, timeout, callback) => plugin.connectSession(options.sessionId, host, port, timeout, 'GBK', callback),
          connectWithEncoding: (host, port, timeout, encoding, callback) => plugin.connectSession(options.sessionId, host, port, timeout, encoding, callback),
          send: (text, callback) => plugin.sendSession(options.sessionId, text, callback),
          close: () => plugin.closeSession(options.sessionId)
        }
      } else nativeTcp = plugin
      log('NET', '检测到原生 TCP 插件 MudAgent-TCP')
    } else {
      log('NET', '未检测到 MudAgent-TCP，回退 plus.android Socket')
    }
  } catch (e) {
    log('NET', '原生 TCP 插件不可用，回退 plus.android Socket:', e && (e.message || e.errMsg))
  }
  return nativeTcp
}

const CONNECT_BLOCK = clientConfig.game.nativeConnectTimeoutMs // 安卓 Socket.connect 阻塞上限 (ms)
const TX_TRACE_WINDOW = 30000 // 超过 30 秒的最近发送不再归因给新收到的弹窗

let gen = 0 // 连接代次, 防止旧连接的回调串入新连接
let buf = [] // 未解码的字节缓冲
let partial = '' // 尚未以 \n 结束的完整接收块
let partialPerf = null // 半包首段的时间信息，避免拆包时低估等待时间
let txSeq = 0 // 发送序号
let rxSeq = 0 // 接收序号
let lastTxPerf = null // 最近一次成功发送，用于估算 dialog 请求到首包的等待时间
let activeEncoding = 'gbk' // 每次连接建立前固定，避免连接中途切换导致半包被错误解码

// ---- 完整消息队列 ----
// 网络层只负责持续收包、解码和入队；协议/UI 在独立时间片中消费，
// 避免一次粘包中大量消息同步渲染，阻塞后续 TCP 数据读取。
let messageQueue = []
let queueHead = 0
let queueTimer = null
let queueScheduled = false
let queueEpoch = 0
let lastVisualFlushAt = 0
const QUEUE_BATCH_MAX = 512
const QUEUE_BATCH_MIN = 40 // 每个消费时间片至少处理 40 条完整换行消息
const QUEUE_TIME_BUDGET = 6 // 多行粘包也尽快提交第一批 UI，不占满一整帧
const DIALOG_PROTOCOLS = new Set(['001', '007', '008', '009', '010', '011', '013', '020'])

function pendingQueueSize() {
  return messageQueue.length - queueHead
}

function runScheduledDrain(epoch) {
  if (epoch !== queueEpoch) return
  queueTimer = null
  queueScheduled = false
  drainMessageQueue()
}

function scheduleQueueDrain(yieldToUi = false) {
  if (queueScheduled || pendingQueueSize() <= 0) return
  queueScheduled = true
  const epoch = queueEpoch
  if (yieldToUi) {
    queueTimer = setTimeout(() => runScheduledDrain(epoch), 0)
  } else {
    // 首批消息不等待定时器，当前 TCP 轮询/消息回调结束后立即处理。
    Promise.resolve().then(() => runScheduledDrain(epoch))
  }
}

function drainMessageQueue() {
  const started = Date.now()
  let count = 0
  beginMessageBatch()
  try {
    while (queueHead < messageQueue.length && count < QUEUE_BATCH_MAX) {
      const item = messageQueue[queueHead++]
      const traced = typeof item !== 'string'
      const line = traced ? item.line : item
      try {
        if (traced) {
          item.perf.protoStartedAt = Date.now()
          handleLine(line, item.perf)
        } else {
          handleLine(line)
        }
      } catch (e) {
        err('PROTO', '处理队列消息异常:', e && (e.message || e.errMsg), '行:', escapeStr(line))
      }
      count++
      // 先保证每批至少消费 40 条；达到下限后每 8 条检查时间预算。
      // 队列不足 40 条时会一次处理完，不会等待凑批。
      if (count >= QUEUE_BATCH_MIN && (count & 7) === 0 && Date.now() - started >= QUEUE_TIME_BUDGET) break
    }
  } finally {
    // 队列积压时最多每帧提交一次 UI，避免每个小批次都重绘 100/300 行。
    // 第一批和最后一批始终提交，保证及时反馈与最终状态完整。
    const now = Date.now()
    const hasMore = queueHead < messageQueue.length
    const shouldFlush = !hasMore || lastVisualFlushAt === 0 || now - lastVisualFlushAt >= 16
    endMessageBatch(shouldFlush)
    if (shouldFlush) lastVisualFlushAt = now
  }

  if (queueHead >= messageQueue.length) {
    messageQueue = []
    queueHead = 0
  } else {
    // 超出一帧预算才让出 UI；普通操作通常在首个微任务中已经完成。
    scheduleQueueDrain(true)
  }
  if (count > 0) dbg('TCP', '队列消费: ' + count + ' 条, 剩余 ' + pendingQueueSize() + ' 条')
}

function enqueueLines(lines, receivePerf) {
  const framedAt = Date.now()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const protocol = line && line.charCodeAt(0) === 27 ? line.slice(1, 4) : ''
    if (!DIALOG_PROTOCOLS.has(protocol)) {
      messageQueue.push(line)
      continue
    }
    messageQueue.push({
      line,
      perf: {
        ...receivePerf,
        traceId: 'RX' + receivePerf.rxId + '-L' + (i + 1),
        framedAt,
        enqueuedAt: Date.now()
      }
    })
  }
  if (lines.length > 0) {
    dbg('TCP', '完整消息入队: ' + lines.length + ' 条, 待处理 ' + pendingQueueSize() + ' 条')
    scheduleQueueDrain()
  }
}

function resetMessageQueue() {
  queueEpoch++
  queueScheduled = false
  if (queueTimer !== null) {
    clearTimeout(queueTimer)
    queueTimer = null
  }
  messageQueue = []
  queueHead = 0
  lastVisualFlushAt = 0
  resetMessageBatch()
}

// ---- 安卓原生连接状态 ----
let socket = null // java.net.Socket
let ins = null // InputStream
let outs = null // OutputStream
let pollTimer = null
let running = false
let curHandlers = {}
let connectTimer = null
const CONNECT_TIMEOUT = clientConfig.game.fallbackConnectTimeoutMs // 平台 socket 回退路径的应用层超时

function clearConnectTimer() {
  if (connectTimer) {
    clearTimeout(connectTimer)
    connectTimer = null
  }
}

// 找到可安全解码的边界：末尾若是未收全的 GBK/UTF-8 字符则等待后续数据。
function consumeBoundary(bytes) {
  return consumableBoundary(bytes, activeEncoding)
}

// 解码待处理字节, 打印该次接收的解码结果
function decodePending(bytes, rxId) {
  // 常见路径没有上次残留半字：直接在当前块上解码，避免逐字节 push、slice 和二次 Uint8Array。
  if (buf.length === 0) {
    const directBoundary = consumeBoundary(bytes)
    let directOut = ''
    if (directBoundary > 0) {
      directOut = decodeText(bytes, activeEncoding, 0, directBoundary)
      if (isDebugEnabled()) dbg('TCP', 'RX#' + rxId + ' <<< 解码文本: ' + escapeStr(directOut))
    }
    if (directBoundary < bytes.length) {
      for (let i = directBoundary; i < bytes.length; i++) buf.push(bytes[i])
      dbg('TCP', 'RX#' + rxId + ' <<< 留缓存 ' + buf.length + 'B (半字待配对)')
    }
    return directOut
  }

  for (const b of bytes) buf.push(b)
  const bd = consumeBoundary(buf)
  let out = ''
  if (bd > 0) {
    out = decodeText(new Uint8Array(buf.slice(0, bd)), activeEncoding)
    buf = buf.slice(bd)
    if (isDebugEnabled()) dbg('TCP', 'RX#' + rxId + ' <<< 解码文本: ' + escapeStr(out))
  } else {
    dbg('TCP', 'RX#' + rxId + ' <<< 均为半字, 等待后续字节')
  }
  if (buf.length > 0) dbg('TCP', 'RX#' + rxId + ' <<< 留缓存 ' + buf.length + 'B (半字待配对)')
  return out
}

// TCP 粘包/拆包分帧：每一条完整消息都必须以 \n 结束。
// 已完整的前缀立即入队，只缓存最后一个没有 \n 的残片，避免残片阻塞前面完整消息。
function feedText(text, receivePerf) {
  if (!text) return
  if (!partial) partialPerf = receivePerf
  partial += text
  const boundary = partial.lastIndexOf('\n')
  if (boundary < 0) {
    dbg('TCP', '消息未完整(末尾无\\n), 继续接收: ' + partial.length + ' 字符')
    return
  }

  const complete = partial.slice(0, boundary + 1)
  partial = partial.slice(boundary + 1)
  const completePerf = partialPerf || receivePerf
  partialPerf = partial ? receivePerf : null
  const lines = complete.split('\n')
  lines.pop() // complete 必定以 \n 结尾，最后一项恒为空
  for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/\r$/, '')
  enqueueLines(lines, completePerf)
}

// 处理一批收到的字节：仅解码和尝试入队，不在网络轮询中执行协议/UI。
function processReceived(bytes, desc, readPerf = {}) {
  rxSeq++
  const processingStartedAt = Date.now()
  const relatedTx = lastTxPerf && processingStartedAt - lastTxPerf.txAt <= TX_TRACE_WINDOW
    ? lastTxPerf
    : null
  const receivePerf = {
    rxId: rxSeq,
    bytes: bytes.length,
    readStartedAt: readPerf.readStartedAt || processingStartedAt,
    receivedAt: readPerf.receivedAt || processingStartedAt,
    nativeReadMs: readPerf.nativeReadMs || 0,
    nativeBlockReadMs: readPerf.nativeBlockReadMs || 0,
    readMode: readPerf.readMode || '',
    availableMs: readPerf.availableMs || 0,
    socketReadMs: readPerf.socketReadMs || 0,
    byteCopyMs: readPerf.byteCopyMs || 0,
    requestedBytes: readPerf.requestedBytes || bytes.length,
    txId: relatedTx && relatedTx.txId,
    txAt: relatedTx && relatedTx.txAt,
    txText: relatedTx && relatedTx.txText
  }
  if (isDebugEnabled()) {
    dbg('TCP', 'RX#' + rxSeq + ' <<< 收到: ' + (desc || (bytes.length + 'B')))
    const show = bytes.length > 512 ? bytes.slice(0, 128) : bytes
    const tail = bytes.length > 512 ? (' ... (共' + bytes.length + 'B)') : ''
    dbg('TCP', 'RX#' + rxSeq + ' <<< 字节: ' + toHex(show) + tail)
  }
  try {
    const decoded = decodePending(bytes, rxSeq)
    receivePerf.decodedAt = Date.now()
    feedText(decoded, receivePerf)
  } catch (e) {
    err('NET', '解析接收数据异常:', e && (e.message || e.errMsg))
  }
}

// 对登录凭证行做脱敏 (隐藏密码与验证码), 避免把敏感信息打进日志
// 格式: 账号║密码║验证码║客户端标识
function maskSensitive(text) {
  const m = String(text).match(/^([^║\r\n]*)║([^║\r\n]*)║([^║\r\n]*)║([^\r\n]*)/)
  if (m) return m[1] + '║******║******║[client-tag]'
  return text
}

// ============================================================
// 安卓原生方案: plus.android 反射 java.net.Socket
// ============================================================

// ---- 发送优化 ----
// 原因: ① java.net.Socket 默认开 Nagle, 小命令被延迟合并 → "消息有概率发不出去"
//       ② 逐字节 write(int) 一条命令 N 次桥调用, 易出问题
// 修复: 连接时 setTcpNoDelay(true) 关 Nagle; 写入用 OutputStreamWriter 一次写完

let writer = null // OutputStreamWriter (当前连接编码), 一次 write() 发一整条命令
let useWriter = null // null=未尝试 true=可用 false=不可用(永久逐字节)

function ensureWriter() {
  if (useWriter === true && writer) return true
  if (useWriter === false) return false
  try {
    const OW = android.importClass('java.io.OutputStreamWriter')
    const charset = encodingLabel(activeEncoding)
    const w = new OW(outs, charset)
    android.importClass(w)
    writer = w
    useWriter = true
    log('NET', '启用写入器 (OutputStreamWriter/' + charset + ')')
  } catch (e) {
    useWriter = false
    writer = null
    log('NET', '写入器不可用, 退回逐字节:', e && (e.message || e.errMsg))
  }
  return useWriter === true
}

// 发送文本到服务器 (写入端负责当前连接编码; 不可用时逐字节回退)
function writeText(text) {
  if (!socket || !outs) return false
  try {
    if (ensureWriter()) {
      writer.write(text)
      writer.flush()
    } else {
      // Native.js 能直接接收 Java String.getBytes() 返回的原生 byte[]，
      // 小命令可一次写入；仅在运行时不支持时才退回逐字节。
      try {
        const nativeBytes = android.invoke(String(text), 'getBytes', encodingLabel(activeEncoding))
        if (nativeBytes) {
          outs.write(nativeBytes)
          outs.flush()
          return true
        }
      } catch (e) {
        // fall through
      }
      const bytes = Array.from(encodeText(text, activeEncoding))
      for (let i = 0; i < bytes.length; i++) outs.write(bytes[i] & 0xff)
      outs.flush()
    }
    return true
  } catch (e) {
    err('NET', '写入失败:', e && (e.message || e.errMsg))
    // 若 socket 已真正关闭, 主动触发断开流程, 让界面回到登录
    try {
      if (socket && socket.isClosed()) handleClose('写入失败, 连接已关闭')
    } catch (e2) { /* ignore */ }
    return false
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// ---- 接收轮询优化 ----
// 原实现逐字节 read(), 数据一多桥调用就占满 JS 线程导致"不响应"。
// 改为: 批量 read(byte[]) + 每轮限量 + 20ms 快速轮询; 批量读不可用时自动退回逐字节。
const POLL_INTERVAL = 10 // 轮询间隔 ms, 接收更快 (接近 www 事件驱动)
const MAX_PER_TICK = 4096 // 单次 Java 批量读取缓冲
const MAX_BYTES_PER_TICK = 65536 // 单轮排空上限，兼顾吞吐与 UI 响应

let readBuf = null // 复用的 Java byte[] 缓冲
let exactReadBuf = null // 长度严格等于本次 available() 的缓冲，兼容只支持 read(byte[]) 的 Native.js
let exactReadBufSize = 0
let JavaArrayClass = null
let javaByteType = null
let useBatchRead = false
let batchReadDisabled = false // 批量读失败一次后永久禁用, 避免每轮重试刷屏
let JavaString = null
let fastByteCopyDisabled = false
let lastReadBreakdown = null

function saveReadBreakdown(mode, availableMs, socketReadMs, byteCopyMs, requestedBytes) {
  lastReadBreakdown = { mode, availableMs, socketReadMs, byteCopyMs, requestedBytes }
}

// 原生插件已经在 Java 读线程按当前连接编码解码；JS 只做分帧和协议入队。
function processPluginText(text, nativeReceivedAt, nativeBlockReadMs) {
  if (!text) return
  const jsReceivedAt = Date.now()
  const relatedTx = lastTxPerf && nativeReceivedAt - lastTxPerf.txAt <= TX_TRACE_WINDOW
    ? lastTxPerf
    : null
  rxSeq++
  log('TCP', 'RX#' + rxSeq + ' <<< 原生插件文本 ' + text.length + ' 字符')
  if (isDebugEnabled()) dbg('TCP', 'RX#' + rxSeq + ' <<< 文本: ' + escapeStr(text))
  feedText(text, {
    rxId: rxSeq,
    bytes: text.length,
    readStartedAt: nativeReceivedAt,
    receivedAt: jsReceivedAt,
    nativeReadMs: jsReceivedAt - nativeReceivedAt,
    nativeBlockReadMs: nativeBlockReadMs || 0,
    readMode: 'Java插件',
    requestedBytes: text.length,
    txId: relatedTx && relatedTx.txId,
    txAt: relatedTx && relatedTx.txAt,
    txText: relatedTx && relatedTx.txText
  })
}

// 通过反射 Array.newInstance 创建 byte[] (本运行时没有 createObject)
// 关键: 创建后先 getArrayValue 探测一次, 确认能取出字节才启用批量读;
//       否则直接逐字节, 绝不"先读进缓冲再取不出", 避免第一批数据丢失
function ensureReadBuf() {
  if (useBatchRead) return readBuf
  if (batchReadDisabled) return null
  try {
    JavaArrayClass = android.importClass('java.lang.reflect.Array')
    const ByteCls = android.importClass('java.lang.Byte')
    javaByteType = android.getAttribute(ByteCls, 'TYPE')
    readBuf = android.invoke(JavaArrayClass, 'newInstance', javaByteType, MAX_PER_TICK)
    // 探测: 能取到值说明 byte[] + getArrayValue 都可用, 批量读才是安全的
    android.getArrayValue(readBuf, 0)
    useBatchRead = true
    log('NET', '接收模式: 动态定长批量读取 (byte[1-' + MAX_PER_TICK + ']) — 快')
  } catch (e) {
    batchReadDisabled = true
    useBatchRead = false
    readBuf = null
    log('NET', '批量读取不可用, 已永久退回逐字节:', e && (e.message || e.errMsg))
  }
  return readBuf
}

function getExactReadBuf(size) {
  if (size === MAX_PER_TICK) return readBuf
  if (exactReadBuf && exactReadBufSize === size) return exactReadBuf
  exactReadBuf = android.invoke(JavaArrayClass, 'newInstance', javaByteType, size)
  exactReadBufSize = size
  return exactReadBuf
}

// 逐字节读取 (回退方案): 一次读当前可读的全部字节, available() 只调用一次
function readPerByte() {
  const availableStartedAt = Date.now()
  const avail = ins.available()
  const availableDoneAt = Date.now()
  if (avail <= 0) {
    saveReadBreakdown('逐字节', availableDoneAt - availableStartedAt, 0, 0, 0)
    return []
  }
  const n = Math.min(avail, MAX_PER_TICK)
  const bytes = new Array(n)
  const readStartedAt = Date.now()
  for (let i = 0; i < n; i++) {
    const b = ins.read()
    if (b < 0) {
      handleClose('服务器关闭连接 (EOF)')
      return null
    }
    bytes[i] = b
  }
  saveReadBreakdown('逐字节', availableDoneAt - availableStartedAt, Date.now() - readStartedAt, 0, n)
  return bytes
}

// 当前 Native.js 不支持 read(byte[], off, len) 重载，因此创建长度恰好等于
// available() 的 byte[]，继续使用已验证可用的 read(byte[]) 单次跨桥调用。
function readBatch() {
  try {
    const availableStartedAt = Date.now()
    const avail = ins.available()
    const availableDoneAt = Date.now()
    if (avail <= 0) {
      saveReadBreakdown('批量', availableDoneAt - availableStartedAt, 0, 0, 0)
      return []
    }
    const requested = Math.min(avail, MAX_PER_TICK)
    const targetBuf = getExactReadBuf(requested)
    const socketReadStartedAt = Date.now()
    const n = ins.read(targetBuf)
    const socketReadDoneAt = Date.now()
    if (n < 0) {
      handleClose('服务器关闭连接 (EOF)')
      return null
    }
    // 用 ISO-8859-1 在 Java 侧一次性把 byte[] 映射为等长字符串，
    // JS 只做本地 charCodeAt，避免每个字节一次 plus.android 跨桥调用。
    if (!fastByteCopyDisabled) {
      try {
        let javaText
        if (typeof android.newObject === 'function') {
          javaText = android.newObject('java.lang.String', targetBuf, 0, n, 'ISO-8859-1')
        } else {
          if (!JavaString) JavaString = android.importClass('java.lang.String')
          javaText = new JavaString(targetBuf, 0, n, 'ISO-8859-1')
        }
        const raw = String(android.invoke(javaText, 'toString'))
        if (raw.length !== n) throw new Error('Java byte string 长度不匹配')
        const bytes = new Uint8Array(n)
        for (let i = 0; i < n; i++) bytes[i] = raw.charCodeAt(i) & 0xff
        saveReadBreakdown(
          '批量',
          availableDoneAt - availableStartedAt,
          socketReadDoneAt - socketReadStartedAt,
          Date.now() - socketReadDoneAt,
          requested
        )
        return bytes
      } catch (copyErr) {
        fastByteCopyDisabled = true
        log('NET', '整块字节转换不可用，回退兼容复制:', copyErr && (copyErr.message || copyErr.errMsg))
      }
    }

    // 仅用于不支持 Java String 构造的旧运行时；数据已经在 targetBuf 中，不会丢包。
    const bytes = new Uint8Array(n)
    for (let i = 0; i < n; i++) bytes[i] = android.getArrayValue(targetBuf, i) & 0xff
    saveReadBreakdown(
      '批量兼容复制',
      availableDoneAt - availableStartedAt,
      socketReadDoneAt - socketReadStartedAt,
      Date.now() - socketReadDoneAt,
      requested
    )
    return bytes
  } catch (e) {
    // 批量读在此环境不可用, 永久退回逐字节 (只提示一次)
    batchReadDisabled = true
    useBatchRead = false
    readBuf = null
    log('NET', '批量读取不可用, 已永久退回逐字节:', e && (e.message || e.errMsg))
    return readPerByte()
  }
}

function readAvailable() {
  if (useBatchRead || (ensureReadBuf() && useBatchRead)) return readBatch()
  return readPerByte()
}

function startPoll() {
  stopPoll()
  const pGen = gen
  pollTimer = setInterval(() => {
    if (pGen !== gen || !running || !socket || !ins) return
    try {
      if (socket.isClosed()) {
        handleClose('连接已关闭')
        return
      }
      let total = 0
      while (total < MAX_BYTES_PER_TICK) {
        const readStartedAt = Date.now()
        const bytes = readAvailable()
        const receivedAt = Date.now()
        if (bytes === null) return // 已 EOF/异常, handleClose 内部已处理
        if (bytes.length === 0) break
        total += bytes.length
        processReceived(bytes, null, {
          readStartedAt,
          receivedAt,
          nativeReadMs: receivedAt - readStartedAt,
          readMode: lastReadBreakdown && lastReadBreakdown.mode,
          availableMs: lastReadBreakdown && lastReadBreakdown.availableMs,
          socketReadMs: lastReadBreakdown && lastReadBreakdown.socketReadMs,
          byteCopyMs: lastReadBreakdown && lastReadBreakdown.byteCopyMs,
          requestedBytes: lastReadBreakdown && lastReadBreakdown.requestedBytes
        })
      }
      if (total >= MAX_BYTES_PER_TICK) dbg('TCP', '本轮已处理 ' + total + 'B，余量下轮继续')
    } catch (e) {
      if (pGen === gen && running) handleClose('读取异常: ' + (e && (e.message || e.errMsg)))
    }
  }, POLL_INTERVAL)
}

function handleClose(reason) {
  if (!running) return
  running = false
  stopPoll()
  writer = null
  useWriter = null
  try { if (socket) socket.close() } catch (e) { /* ignore */ }
  socket = null
  ins = null
  outs = null
  state.connected = false
  log('NET', '连接结束:', reason || '')
  if (curHandlers.onClose) curHandlers.onClose()
}

// 安卓原生连接 (阻塞式, 受 CONNECT_BLOCK 限制)
function connectAndroid(host, port, handlers) {
  close()
  buf = []
  partial = ''
  partialPerf = null
  txSeq = 0
  rxSeq = 0
  lastTxPerf = null
  state.connected = false
  state.statusMsg = '正在连接服务器...'

  const myGen = ++gen
  log('NET', '安卓原生 TCP: 正在连接', host + ':' + port, '(连接超时 ' + (CONNECT_BLOCK / 1000) + 's)')
  try {
    android = getNetworkPlatform().getAndroidApi()
    if (!android) throw new Error('当前平台未提供 Android 网络 API')
    const Socket = android.importClass('java.net.Socket')
    const InetSocketAddress = android.importClass('java.net.InetSocketAddress')
    const s = new Socket()
    android.importClass(s)
    s.connect(new InetSocketAddress(host, port), CONNECT_BLOCK)

    if (myGen !== gen) {
      // 连接期间被新的连接取代
      try { s.close() } catch (e) { /* ignore */ }
      return
    }

    socket = s
    ins = s.getInputStream()
    android.importClass(ins)
    outs = s.getOutputStream()
    android.importClass(outs)
    writer = null
    useWriter = null
    running = true
    curHandlers = handlers

    // 关闭 Nagle: 小命令立即发出, 不再被 TCP 延迟合并 (修复"消息发不出去/延迟")
    try { s.setTcpNoDelay(true) } catch (e) { /* 忽略, 非关键 */ }
    // 保持连接探测: 及时发现服务器断开
    try { s.setKeepAlive(true) } catch (e) { /* 忽略 */ }

    log('NET', 'TCP 连接已建立 ✓')
    state.connected = true
    state.statusMsg = '服务器连接成功，正在验证版本...'
    startPoll()
    if (handlers.onOpen) handlers.onOpen()
  } catch (e) {
    if (myGen !== gen) return
    const msg = (e && (e.message || e.errMsg)) || '连接失败'
    err('NET', '连接失败:', msg)
    err('NET', '请检查: 地址/端口是否正确、服务器是否运行、防火墙/云安全组是否放行、手机网络是否可达')
    state.connected = false
    state.statusMsg = ''
    if (handlers.onError) handlers.onError({ errMsg: msg })
  }
}

// ============================================================
// 回退方案: 平台 socket 适配器 (非 Android App / 开发环境 / Electron)
// ============================================================

let task = null

function isArrayBuffer(v) {
  return v instanceof ArrayBuffer ||
    (typeof ArrayBuffer !== 'undefined' && Object.prototype.toString.call(v) === '[object ArrayBuffer]')
}

function onData(raw) {
  if (typeof raw === 'string') {
    let hasHigh = false
    for (let i = 0; i < raw.length; i++) {
      if (raw.charCodeAt(i) > 0xff) { hasHigh = true; break }
    }
    if (hasHigh) {
      // 平台已按 Unicode 解码, 直接作为文本处理
      const receivedAt = Date.now()
      processPluginText(raw, receivedAt, 0)
    } else {
      // 二进制字符串 (每字符一个字节)
      const bytes = []
      for (let i = 0; i < raw.length; i++) bytes.push(raw.charCodeAt(i) & 0xff)
      processReceived(bytes, '二进制字符串 ' + bytes.length + 'B')
    }
    return
  }
  if (isArrayBuffer(raw)) {
    const u8 = new Uint8Array(raw)
    const bytes = new Array(u8.length)
    for (let i = 0; i < u8.length; i++) bytes[i] = u8[i]
    processReceived(bytes, 'ArrayBuffer ' + bytes.length + 'B')
    return
  }
  if (raw && typeof raw.length === 'number' && typeof raw[0] === 'number') {
    processReceived(Array.from(raw), '字节数组 ' + raw.length + 'B')
  }
}

function connectNativeTcp(host, port, handlers, plugin) {
  close()
  buf = []
  partial = ''
  partialPerf = null
  txSeq = 0
  rxSeq = 0
  lastTxPerf = null
  state.connected = false
  state.statusMsg = '正在连接服务器...'
  const myGen = ++gen
  nativeTcpActive = true
  log('NET', '原生 TCP 插件: 后台线程连接', host + ':' + port)
  try {
    const callback = (event) => {
      if (myGen !== gen || !nativeTcpActive) return
      const type = event && event.type
      if (type === 'open') {
        log('NET', '原生 TCP 插件连接已建立 ✓ (Java 读线程)')
        state.connected = true
        state.statusMsg = '服务器连接成功，正在验证版本...'
        curHandlers = handlers
        handlers.onOpen && handlers.onOpen()
      } else if (type === 'data') {
        processPluginText(String(event.data || ''), Number(event.nativeReceivedAt || Date.now()), Number(event.nativeReadMs || 0))
      } else if (type === 'error') {
        err('NET', '原生 TCP 插件错误:', event && event.data)
        state.connected = false
        handlers.onError && handlers.onError({ errMsg: event && event.data })
      } else if (type === 'close') {
        nativeTcpActive = false
        nativeTcp = nativeTcp || plugin
        state.connected = false
        log('NET', '原生 TCP 插件连接已关闭:', event && event.data)
        handlers.onClose && handlers.onClose()
      }
    }
    if (typeof plugin.connectWithEncoding === 'function') {
      plugin.connectWithEncoding(host, Number(port), CONNECT_BLOCK, encodingLabel(activeEncoding), callback)
    } else {
      plugin.connect(host, Number(port), CONNECT_BLOCK, callback)
    }
  } catch (e) {
    nativeTcpActive = false
    state.connected = false
    err('NET', '原生 TCP 插件调用失败:', e && (e.message || e.errMsg))
    handlers.onError && handlers.onError(e)
  }
}

function connectSocket(host, port, handlers) {
  close()
  buf = []
  partial = ''
  partialPerf = null
  txSeq = 0
  rxSeq = 0
  lastTxPerf = null
  state.connected = false
  state.statusMsg = '正在连接服务器...'

  const myGen = ++gen
  const platform = getNetworkPlatform()
  log('NET', (platform.name || 'platform') + ' socket: 正在连接', host + ':' + port, '(等待 onOpen, 最多 ' + (CONNECT_TIMEOUT / 1000) + 's)')
  clearConnectTimer()
  connectTimer = setTimeout(() => {
    connectTimer = null
    if (myGen !== gen) return
    err('NET', '连接超时(' + (CONNECT_TIMEOUT / 1000) + 's): 未建立 TCP 连接')
    state.connected = false
    state.statusMsg = '连接超时，请检查地址/端口/网络'
    try { if (task) task.close('connect timeout') } catch (e) { /* ignore */ }
    task = null
    if (handlers.onError) handlers.onError({ errMsg: '连接超时' })
  }, CONNECT_TIMEOUT)

  try {
    task = platform.openSocket({
      host,
      port: Number(port),
      onOpen: () => {
        if (myGen !== gen) return
        clearConnectTimer()
        log('NET', 'TCP 连接已建立 ✓ (' + (platform.name || 'platform') + ')')
        state.connected = true
        state.statusMsg = '服务器连接成功，正在验证版本...'
        if (handlers.onOpen) handlers.onOpen()
      },
      onData: (data) => {
        if (myGen !== gen) return
        onData(data)
      },
      onError: (errObj) => {
        if (myGen !== gen) return
        clearConnectTimer()
        state.connected = false
        err('NET', '连接错误:', errObj && (errObj.errMsg || errObj.message))
        if (handlers.onError) handlers.onError(errObj)
      },
      onClose: () => {
        if (myGen !== gen) return
        state.connected = false
        clearConnectTimer()
        log('NET', '连接已关闭 (' + (platform.name || 'platform') + ')')
        if (handlers.onClose) handlers.onClose()
      }
    })
  } catch (errObj) {
    clearConnectTimer()
    err('NET', 'connectSocket 抛错', errObj)
    if (handlers.onError) handlers.onError(errObj)
    return
  }
}

// ============================================================
// 对外接口
// ============================================================

// 建立 TCP 连接: 安卓 App 走原生通道，其他平台使用注入的 socket 适配器。
function connect(host, port, handlers = {}) {
  activeEncoding = normalizeTextEncoding(handlers.encoding)
  log('NET', '本次连接字符编码:', encodingLabel(activeEncoding))
  if (isAndroidApp()) {
    const plugin = getNativeTcp()
    // 旧版插件只支持 GBK；选择 UTF-8 时回退到支持动态编码的 Android Socket 路径。
    if (plugin && (activeEncoding !== TEXT_ENCODING_UTF8 || typeof plugin.connectWithEncoding === 'function')) {
      connectNativeTcp(host, port, handlers, plugin)
    }
    else connectAndroid(host, port, handlers)
  } else {
    connectSocket(host, port, handlers)
  }
}

function sendText(text) {
  if (nativeTcpActive && nativeTcp && state.connected) {
    try {
      nativeTcp.send(text, (event) => {
        if (event && event.type === 'error') err('TCP', '原生插件发送失败:', event.data)
      })
      return true
    } catch (e) {
      err('TCP', '原生插件发送异常:', e && (e.message || e.errMsg))
      return false
    }
  }
  if (isAndroidApp()) return writeText(text)
  if (task && state.connected) {
    try {
      task.sendBytes(
        encodeText(text, activeEncoding),
        (sendErr) => err('TCP', '异步发送失败:', sendErr && (sendErr.errMsg || sendErr.message))
      )
      return true
    } catch (e) {
      err('TCP', 'send error', e && (e.message || e.errMsg))
      return false
    }
  }
  return false
}

// 发送文本 (需包含结尾 \n); 任何异常都不静默, 都会打日志
function send(text) {
  try {
    const masked = maskSensitive(text)
    txSeq++
    const txAt = Date.now()
    log('TCP', 'TX#' + txSeq + ' >>> 发送: ' + escapeStr(masked))
    const ok = sendText(text)
    if (!ok) {
      err('TCP', 'TX#' + txSeq + ' 发送失败: ' + escapeStr(masked))
      return false
    }
    lastTxPerf = {
      txId: txSeq,
      txAt,
      txText: escapeStr(masked).slice(0, 80)
    }
    return true
  } catch (e) {
    err('TCP', '发送异常:', e && (e.message || e.errMsg), '内容:', escapeStr(maskSensitive(String(text))))
    return false
  }
}

// 发送一条或以 \n 分隔的多条命令：保证整批指令以且仅以一个 \n 结尾
function sendLine(cmd) {
  if (cmd == null) {
    err('TCP', 'sendLine 收到空指令, 已忽略')
    return false
  }
  const s = String(cmd).replace(/[\r\n]+$/, '') + '\n'
  return send(s)
}

// 向服务器发送握手口令 + 起始换行 (原客户端在连接建立后发送)
function sendHandshake() {
  if (!HANDSHAKE_LINE) {
    err('NET', '缺少 VITE_GAME_HANDSHAKE_TOKEN，未发送握手口令')
    return false
  }
  log('NET', '发送握手口令(版本验证) + 起始换行')
  send(HANDSHAKE_LINE)
  const handshakeGen = gen
  setTimeout(() => {
    if (handshakeGen !== gen) return
    send('\n')
  }, 200)
  return true
}

// 关闭连接
function close() {
  gen++
  clearConnectTimer()
  running = false
  stopPoll()
  writer = null
  useWriter = null
  const plugin = (nativeTcpActive || options.sessionId) ? nativeTcp : null
  nativeTcpActive = false
  readBuf = null
  exactReadBuf = null
  exactReadBufSize = 0
  JavaArrayClass = null
  javaByteType = null
  useBatchRead = false
  batchReadDisabled = false
  JavaString = null
  fastByteCopyDisabled = false
  lastReadBreakdown = null
  if (plugin) {
    try { plugin.close() } catch (e) { /* ignore */ }
  }
  if (socket) {
    log('NET', '关闭安卓连接')
    try { socket.close() } catch (e) { /* ignore */ }
    socket = null
    ins = null
    outs = null
  }
  if (task) {
    log('NET', '关闭旧连接')
    try { task.close('close') } catch (e) { /* ignore */ }
    task = null
  }
  buf = []
  partial = ''
  partialPerf = null
  lastTxPerf = null
  resetMessageQueue()
  state.connected = false
}

// 启动阶段注入 Electron / 其他运行时的网络实现。
// 更换平台会先关闭现有连接，避免旧平台回调进入新连接。
function configureNetworkPlatform(platform) {
  close()
  nativeTcp = null
  nativeTcpChecked = false
  android = null
  return setNetworkPlatform(platform)
}

// 退出游戏: 发送 quit 并断开
function quit() {
  log('NET', '退出游戏: 发送 quit')
  try { send('quit\n') } catch (e) { /* ignore */ }
  const quitGen = gen
  setTimeout(() => {
    if (quitGen === gen) close()
  }, 150)
}

setSend(send)

return { send, sendLine, sendHandshake, connect, close, quit, configureNetworkPlatform }
}
