/**
 * 游离会话扫描：找出「磁盘上有、但没被任何工作区记账」的会话。
 *
 * 背景：
 *   DSH 侧边栏按 Workspace 的 sessionIds 分组渲染。会话一旦从记账里被摘掉
 *   （卸载插件、切换 profile、后端迁移……），文件仍留在 $DSH_HOME/sessions，
 *   但界面上再也看不见它 —— 这就是「游离会话」。
 *
 * 与「空会话」的区别：
 *   空会话 = 从没发过消息（判定看日志内容）
 *   游离会话 = 界面上没有归属（判定看工作区记账）
 *   两者正交：一个游离会话可能有几十条对话。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

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
      i += 3
    }
  }
  return starts.map((start, k) =>
    buf.subarray(start, k + 1 < starts.length ? starts[k + 1] : buf.length),
  )
}

export function decodeSessionLog(buf) {
  if (!buf.includes(ZSTD_MAGIC)) return buf.toString('utf8').split('\n').filter(Boolean)
  const lines = []
  for (const frame of splitZstdFrames(buf)) {
    try {
      const text = zlib.zstdDecompressSync(frame).toString('utf8')
      for (const line of text.split('\n')) if (line) lines.push(line)
    } catch {}
  }
  return lines
}

/**
 * 读一条会话日志的概要：标题 / cwd / 时间 / 对话条数。
 */
export function summarizeSessionLog(buf) {
  const lines = decodeSessionLog(buf)
  let title = ''
  let cwd = ''
  let createdAt = 0
  let userMessages = 0
  let assistantMessages = 0
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
    if (type === 'session') {
      cwd = String(evt.cwd ?? '')
      createdAt = Number(evt.createdAt ?? 0)
    } else if (type === 'session/title') {
      title = String(evt.title ?? '')
    } else if (type === 'user/message') {
      userMessages++
    } else if (type === 'assistant/message') {
      assistantMessages++
    }
  }

  return {
    title,
    cwd,
    createdAt,
    userMessages,
    assistantMessages,
    dialogCount: userMessages + assistantMessages,
    eventCount: parsed,
    corrupt: parsed === 0,
  }
}

/** 递归算目录总字节数。 */
async function dirBytes(dir) {
  let total = 0
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += await dirBytes(full)
    else if (entry.isFile()) {
      try {
        total += (await fs.stat(full)).size
      } catch {}
    }
  }
  return total
}

/**
 * 扫描游离会话。
 *
 * @param {Map<string,string>} index - sessionId → 会话目录（来自 indexSessionDirs）
 * @param {Set<string>} tracked - 被任意工作区记账的 sessionId
 * @param {object} [opts]
 * @param {number} [opts.olderThanDays] - 只返回最后活动早于 N 天的
 * @returns {Promise<{items: object[], skipped: object[]}>}
 */
export async function scanStraySessions(index, tracked, opts = {}) {
  const olderThanDays = Number(opts.olderThanDays) > 0 ? Number(opts.olderThanDays) : 0
  const cutoff = olderThanDays > 0 ? Date.now() - olderThanDays * 86400000 : 0
  const items = []
  const skipped = []

  for (const [sessionId, dir] of index) {
    if (tracked.has(sessionId)) continue // 有归属，不是游离的

    let logPath = null
    let mtime = 0
    try {
      const names = await fs.readdir(dir)
      const candidate = names.find((n) => /^session\..+\.jsonl(\.zstd)?$/.test(n))
      if (!candidate) continue
      logPath = path.join(dir, candidate)
      mtime = (await fs.stat(logPath)).mtimeMs
    } catch {
      continue
    }

    if (cutoff && mtime > cutoff) continue // 太新，用户可能还在用

    let info
    try {
      const buf = await fs.readFile(logPath)
      info = summarizeSessionLog(buf)
    } catch {
      skipped.push({ sessionId, dir, reason: 'unreadable' })
      continue
    }

    if (info.corrupt) {
      skipped.push({ sessionId, dir, reason: 'parse-failed' })
      continue
    }

    items.push({
      sessionId,
      dir,
      title: info.title || null,
      cwd: info.cwd,
      createdAt: info.createdAt,
      mtime,
      userMessages: info.userMessages,
      assistantMessages: info.assistantMessages,
      dialogCount: info.dialogCount,
      eventCount: info.eventCount,
      bytes: 0,
    })
  }

  // 并发补齐目录体积（串行 await 在 36 个会话上要 300ms+）
  await Promise.all(
    items.map(async (item) => {
      item.bytes = await dirBytes(item.dir)
    }),
  )

  // 最久没动的排前面 —— 清理时优先看到它们
  items.sort((a, b) => (a.mtime || 0) - (b.mtime || 0))
  return { items, skipped }
}
