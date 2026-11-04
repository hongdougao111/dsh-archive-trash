/**
 * 空会话扫描：判定「从未发过消息」的会话。
 *
 * 判定标准（来自 issue #1）：
 *   - 解压 session.v4.jsonl.zstd 后，逐条看事件
 *   - 只有存在 user/message 或 assistant/message 才算「有对话」
 *   - 只有 system/tool/自动事件的**不算**有对话（避免误删 bot / 任务会话）
 *
 * ⚠️ 关键坑：zstd 是多帧拼接的（每 append 一句就是一帧）。
 *   zlib.zstdDecompressSync(buf) 只解第一帧 —— 对 181KB 的会话也只得到 1 行。
 *   必须按魔数 0x28B52FFD 切帧，逐帧解压再拼接。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

/** zstd 帧魔数（小端）：FD 2F B5 28，按字节序读是 28 B5 2F FD */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** 单条日志超过这个大小就不当空会话（安全阀） */
export const EMPTY_SIZE_LIMIT = 64 * 1024

/**
 * 按魔数切出所有 zstd 帧。
 * @param {Buffer} buf
 * @returns {Buffer[]}
 */
export function splitZstdFrames(buf) {
  const starts = []
  for (let i = 0; i <= buf.length - 4; i++) {
    if (
      buf[i] === ZSTD_MAGIC[0] &&
      buf[i + 1] === ZSTD_MAGIC[1] &&
      buf[i + 2] === ZSTD_MAGIC[2] &&
      buf[i + 3] === ZSTD_MAGIC[3]
    ) {
      starts.push(i)
      i += 3 // 跳过魔数剩余字节，避免同一帧重复命中
    }
  }
  return starts.map((start, k) =>
    buf.subarray(start, k + 1 < starts.length ? starts[k + 1] : buf.length),
  )
}

/**
 * 解压整条会话日志（多帧）。
 * @param {Buffer} buf
 * @returns {string[]} 每行一条事件（已过滤空行）
 */
export function decodeSessionLog(buf) {
  // 明文日志：直接按行切
  if (!buf.includes(ZSTD_MAGIC)) return buf.toString('utf8').split('\n').filter(Boolean)

  const lines = []
  for (const frame of splitZstdFrames(buf)) {
    try {
      const text = zlib.zstdDecompressSync(frame).toString('utf8')
      for (const line of text.split('\n')) if (line) lines.push(line)
    } catch {
      /* 单帧坏掉就跳过，不因一帧影响整体判定 */
    }
  }
  return lines
}

/**
 * 一条会话日志里有没有真实对话。
 * @param {Buffer} buf
 * @returns {{ hasDialog: boolean, eventCount: number, types: Set<string> }}
 */
export function inspectSessionLog(buf) {
  const lines = decodeSessionLog(buf)
  const types = new Set()
  let hasDialog = false
  let parsed = 0

  for (const line of lines) {
    let evt
    try {
      evt = JSON.parse(line)
    } catch {
      continue
    }
    if (!evt || typeof evt !== 'object') continue
    parsed++
    const type = String(evt.type ?? '')
    if (type) types.add(type)
    // 只要出现过一次真实消息，就不是空会话
    if (type === 'user/message' || type === 'assistant/message') {
      hasDialog = true
    }
  }

  // parsed === 0 表示「有字节但一条事件都解不出来」——日志坏了。
  // 这种情况必须与「真空会话」区分开，否则会把损坏日志当空会话删掉。
  return { hasDialog, eventCount: parsed, types, corrupt: parsed === 0 }
}

/**
 * 扫描所有「空会话」。
 *
 * @param {object} ctx - Cordis 上下文
 * @param {object} opts
 * @param {Map<string,string>} opts.index - sessionId → 会话目录
 * @param {number} [opts.limit] - 单条日志体积上限（字节）
 * @returns {Promise<{items: object[], skipped: object[]}>}
 */
export async function scanEmptySessions(index, opts = {}) {
  const limit = opts.limit ?? EMPTY_SIZE_LIMIT
  const items = []
  const skipped = []

  for (const [sessionId, dir] of index) {
    // 找日志文件（可能带 .zstd，也可能是明文）
    let logPath = null
    let size = 0
    let mtime = 0
    try {
      const names = await fs.readdir(dir)
      const candidate = names.find((n) => /^session\..+\.jsonl(\.zstd)?$/.test(n))
      if (!candidate) continue
      logPath = path.join(dir, candidate)
      const st = await fs.stat(logPath)
      size = st.size
      mtime = st.mtimeMs
    } catch {
      continue
    }

    // 安全阀：太大的不当空会话（真有内容也不会这么小）
    if (size > limit) {
      skipped.push({ sessionId, dir, size, reason: 'too-large' })
      continue
    }

    let buf
    try {
      buf = await fs.readFile(logPath)
    } catch {
      skipped.push({ sessionId, dir, size, reason: 'unreadable' })
      continue
    }

    let verdict
    try {
      verdict = inspectSessionLog(buf)
    } catch {
      skipped.push({ sessionId, dir, size, reason: 'parse-failed' })
      continue
    }

    // 一条事件都解不出来 → 日志损坏，无法判定，跳过（不误删）
    if (verdict.corrupt) {
      skipped.push({ sessionId, dir, size, reason: 'parse-failed' })
      continue
    }

    if (!verdict.hasDialog) {
      items.push({
        sessionId,
        dir,
        size,
        mtime,
        eventCount: verdict.eventCount,
        types: [...verdict.types].sort(),
      })
    }
  }

  items.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
  return { items, skipped }
}
