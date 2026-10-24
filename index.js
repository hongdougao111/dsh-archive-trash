/**
 * dsh-archive-trash · Host 半边
 *
 * 职责：
 *  - 列出所有「已归档」会话（workspaceRegistry.archivedSessionIds）；
 *  - 把选中的（或全部）会话目录整体移进回收站（$DSH_HOME/.trash/sessions/），可还原；
 *  - 彻底删除回收站条目；
 *  - 维护归档集合的一致性（幽灵 id 自动清理）。
 *
 * 会话在磁盘上的布局（jsonl 持久化后端）：
 *   $DSH_HOME/sessions/<cwd 编码目录>/<sessionId>/session.v4.jsonl.zstd
 * cwd 编码规则属于后端内部实现，这里不重写它，改为按 sessionId 反查目录，
 * 这样后端换编码规则也不会把插件弄坏。
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { existsSync } from 'node:fs'

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const SESSIONS_ROOT = path.join(DSH_HOME, 'sessions')
const TRASH_ROOT = path.join(DSH_HOME, '.trash', 'sessions')
const API_PATH = '/dsh-archive-trash'
/** 一次移动操作的上限，防止误传超大数组把事件循环堵死。 */
const MAX_BATCH = 2000

/** 读取目录，失败返回空数组（目录不存在 = 还没建过会话）。 */
async function readdirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/** 递归求目录总字节数（只算文件）。 */
async function dirBytes(dir) {
  let total = 0
  const entries = await readdirSafe(dir)
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      total += await dirBytes(full)
    } else if (entry.isFile()) {
      try {
        total += (await fs.stat(full)).size
      } catch {}
    }
  }
  return total
}

/**
 * 建一份 sessionId → 会话目录 的索引。
 * 一次遍历 sessions 根下的两层目录，避免每个 id 都全盘扫一遍。
 * @returns {Promise<Map<string, string>>} sessionId → 绝对目录路径
 */
async function indexSessionDirs() {
  const index = new Map()
  const cwdDirs = await readdirSafe(SESSIONS_ROOT)
  for (const cwdDir of cwdDirs) {
    if (!cwdDir.isDirectory()) continue
    const cwdPath = path.join(SESSIONS_ROOT, cwdDir.name)
    const sessionDirs = await readdirSafe(cwdPath)
    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory()) continue
      // 只认「目录里真的有会话日志」的，防止把别的同名目录当会话
      const target = path.join(cwdPath, sessionDir.name)
      const files = await readdirSafe(target)
      if (!files.some((f) => f.isFile() && /^session\..+\.jsonl(\.zstd)?$/.test(f.name))) continue
      index.set(sessionDir.name, target)
    }
  }
  return index
}

/** 回收站里的一个条目。 */
async function listTrashEntries() {
  const entries = await readdirSafe(TRASH_ROOT)
  const out = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(TRASH_ROOT, entry.name)
    let meta = null
    try {
      meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'))
    } catch {
      meta = null
    }
    let bytes = 0
    const payloadDir = path.join(dir, 'payload')
    try {
      const stat = await fs.stat(payloadDir)
      if (stat.isDirectory()) bytes = await dirBytes(payloadDir)
    } catch {}
    out.push({
      entryId: entry.name,
      sessionId: meta?.sessionId ?? entry.name,
      title: meta?.title ?? '',
      cwd: meta?.cwd ?? '',
      originalPath: meta?.originalPath ?? '',
      deletedAt: meta?.deletedAt ?? 0,
      bytes,
    })
  }
  out.sort((a, b) => b.deletedAt - a.deletedAt)
  return out
}

/** 当前已归档的会话（带标题、cwd、磁盘大小）。 */
async function listArchived(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (!registry) return { items: [], missingRegistry: true }
  const archivedIds = [...(registry.archivedSessionIds ?? [])].map(String)
  if (archivedIds.length === 0) return { items: [], missingRegistry: false, prunedOrphans: 0 }

  const titles = new Map()
  const cwds = new Map()
  const createdAts = new Map()
  const query = ctx.get('sessionQuery')
  if (query) {
    try {
      const records = await query.listSessions()
      for (const record of records) {
        const id = String(record.header?.id ?? '')
        if (!id) continue
        cwds.set(id, record.header?.cwd ?? '')
        createdAts.set(id, record.header?.createdAt ?? 0)
      }
    } catch {
      /* 列不出 header 就退化成只有 id */
    }
    // 标题一次批量折叠，比逐个读省事
    try {
      const observations = await query.readTitleSnapshots(archivedIds)
      for (const result of observations) {
        if (result.status === 'fulfilled') {
          titles.set(String(result.sessionId), result.value.title?.title ?? '')
        }
      }
    } catch {
      /* 标题拿不到就显示空标题 */
    }
  }

  const index = await indexSessionDirs()
  const items = []
  /** 归档集合里指向「磁盘上已经没有」的 id —— 属于历史残留，顺手清掉。 */
  const orphans = []
  for (const id of archivedIds) {
    const dir = index.get(id) ?? ''
    if (!dir) {
      // 磁盘上不再有这个会话：不要再展示成「日志已不在磁盘上」这种幽灵行，
      // 记下来待清理，然后跳过。
      orphans.push(id)
      continue
    }
    items.push({
      sessionId: id,
      title: titles.get(id) ?? '',
      cwd: cwds.get(id) ?? '',
      createdAt: createdAts.get(id) ?? 0,
      dir,
      exists: true,
      bytes: await dirBytes(dir),
    })
  }

  // 清理幽灵条目：它们既不在磁盘上、也不该继续占着归档集合。
  if (orphans.length > 0) {
    for (const id of orphans) {
      try {
        await registry.unarchiveSession(id)
      } catch {}
    }
  }

  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return { items, missingRegistry: false, prunedOrphans: orphans.length }
}

/**
 * 让这批会话从「已归档集合」和「前端列表」里同时消失。
 *
 * 关键动作是 **emit `api-session/removed`** —— 这是 DSH 自己的移除通道：
 *
 *   Host  session/disposed  →  ctx.emit('api-session/removed', id)
 *   Client 远端事件转发      →  sessions.handleSessionRemoved(id)
 *                           →  recordMutation({ kind: 'remove', sessionId })
 *                           →  列表里删掉这一行
 *
 * 我们只是把文件搬进回收站，并没有真的 dispose 会话，所以 Host 不会自发这个事件。
 * 不补发的话，前端内存里的会话列表仍然保留那一行 —— 这就是「删了还显示、
 * 必须重启才消失」的真正原因（重启时列表从磁盘重建，文件已经没了）。
 *
 * ⚠️ 同时**不调用 `workspace.detachSession()`**。
 * 前端 `groupByWorkspace` 会把「在列表里但没被任何 workspace 记账」的会话
 * 归入 `stray`，渲染成一个「未分组」分组。所以这里保留记账、只让会话从
 * 列表消失：`summary === undefined` 的行会被跳过，记账里的残留 id 无害；
 * 下次 DSH 启动时注册表对账会把失效 id 自然清掉。
 */
async function forgetSessions(ctx, sessionIds) {
  const registry = ctx.get('workspaceRegistry')
  if (registry) {
    for (const id of sessionIds) {
      try {
        await registry.unarchiveSession(id)
      } catch {}
    }
  }

  // ① 先让前端把这几行从列表里拿掉（立刻生效，无需重启）
  for (const id of sessionIds) {
    try {
      ctx.emit('api-session/removed', id)
    } catch {}
  }

  // ② 再拉一次基线兜底：万一某个前端没订阅到事件，重拉也能丢掉这些 id
  try {
    const sessions = ctx.get('sessions')
    if (sessions && typeof sessions.refresh === 'function') await sessions.refresh()
  } catch {}
}

/**
 * 取若干会话的标题与 cwd（**不限归档状态**）。
 *
 * 会话行上的删除按钮对普通会话也开放，所以这里不能只查归档集合；
 * 但普通会话在归档集合里查不到标题，就按需回退到 sessionQuery。
 *
 * @returns {Promise<Map<string, {title: string, cwd: string}>>}
 */
async function describeSessions(ctx, ids) {
  const out = new Map()
  if (ids.length === 0) return out

  // 先吃归档集合这份「便宜」的来源
  try {
    const archived = await listArchived(ctx)
    for (const item of archived.items) {
      if (ids.includes(item.sessionId)) {
        out.set(item.sessionId, { title: item.title || '', cwd: item.cwd || '' })
      }
    }
  } catch {}

  // 还缺的，用 sessionQuery 补（一次批量读标题 + 一次列表拿 cwd）
  const missing = ids.filter((id) => !out.has(id))
  if (missing.length === 0) return out
  const query = ctx.get('sessionQuery')
  if (!query) {
    for (const id of missing) out.set(id, { title: '', cwd: '' })
    return out
  }
  const cwds = new Map()
  try {
    for (const record of await query.listSessions()) {
      cwds.set(String(record.header?.id ?? ''), record.header?.cwd ?? '')
    }
  } catch {}
  const titles = new Map()
  try {
    for (const result of await query.readTitleSnapshots(missing)) {
      if (result.status === 'fulfilled') {
        titles.set(String(result.sessionId), result.value.title?.title ?? '')
      }
    }
  } catch {}
  for (const id of missing) {
    out.set(id, { title: titles.get(id) ?? '', cwd: cwds.get(id) ?? '' })
  }
  return out
}

/** 把若干会话移进回收站。 */
async function moveToTrash(ctx, sessionIds) {
  const ids = sessionIds.slice(0, MAX_BATCH).map(String)
  const index = await indexSessionDirs()
  // 不限归档状态：会话行上的删除按钮对普通会话也生效
  const known = await describeSessions(ctx, ids)
  await fs.mkdir(TRASH_ROOT, { recursive: true })
  const moved = []
  const failed = []
  // 同一个毫秒内移动多个会话时会撞 entryId，这里加个序号。
  let seq = 0
  for (const id of ids) {
    const dir = index.get(id)
    if (!dir) {
      failed.push({ sessionId: id, reason: 'not-found' })
      continue
    }
    const entryId = `${Date.now()}-${seq++}-${id}`
    const entryDir = path.join(TRASH_ROOT, entryId)
    try {
      await fs.mkdir(entryDir, { recursive: true })
      const payload = path.join(entryDir, 'payload')
      await fs.rename(dir, payload)
      await fs.writeFile(
        path.join(entryDir, 'meta.json'),
        JSON.stringify(
          {
            sessionId: id,
            originalPath: dir,
            cwd: known.get(id)?.cwd ?? '',
            title: known.get(id)?.title ?? '',
            deletedAt: Date.now(),
          },
          null,
          2,
        ),
        'utf8',
      )
      moved.push(id)
    } catch (error) {
      failed.push({ sessionId: id, reason: String(error?.message ?? error) })
    }
  }
  if (moved.length > 0) await forgetSessions(ctx, moved)
  return { moved, failed, truncated: sessionIds.length > ids.length }
}

/**
 * 还原之后，让会话重新出现在前端列表里。
 *
 * 与删除对称：删除时补发 `api-session/removed`，还原时就得补发
 * `api-session/added`，否则前端内存里的列表里没有这行 —— 同样是
 * 「还原了但侧边栏看不到，必须重启」。
 *
 * `added` 的载荷是一个 summary（见 Host 的 ApiSessionList.summaryFor）：
 *   { sessionId, updatedAt, agentAvailable, formatStatus, running, blank,
 *     cwd?, parentSessionId?, origin?, projections? }
 * 还原回来的会话必然是冷会话，所以 running=false、agentAvailable=false，
 * 那两个 optional 字段按 header 补上就行。
 *
 * @param {Map<string, object>} headers sessionId → SessionHeader
 */
async function announceRestored(ctx, headers) {
  if (headers.size === 0) return
  for (const [id, header] of headers) {
    const summary = {
      sessionId: id,
      updatedAt: Number(header?.createdAt) || Date.now(),
      agentAvailable: false,
      formatStatus: 'current',
      running: false,
      blank: false,
      ...(header?.parentSession === undefined ? {} : { parentSessionId: header.parentSession }),
      ...(header?.origin === undefined ? {} : { origin: header.origin }),
      ...(header?.cwd === undefined ? {} : { cwd: header.cwd }),
    }
    try {
      ctx.emit('api-session/added', summary)
    } catch {}
  }
  // 再拉一次基线兜底：确保 projections / updatedAt 跟真实磁盘状态对齐
  try {
    const sessions = ctx.get('sessions')
    if (sessions && typeof sessions.refresh === 'function') await sessions.refresh()
  } catch {}
}

/** 从回收站还原。 */
async function restoreFromTrash(ctx, entryIds) {
  const restored = []
  const failed = []
  /** sessionId → header，供还原后补发 added 用 */
  const restoredHeaders = new Map()
  for (const entryId of entryIds.map(String)) {
    const entryDir = path.join(TRASH_ROOT, entryId)
    const payload = path.join(entryDir, 'payload')
    try {
      const meta = JSON.parse(await fs.readFile(path.join(entryDir, 'meta.json'), 'utf8'))
      const originalPath = String(meta.originalPath ?? '')
      if (!originalPath || !originalPath.startsWith(SESSIONS_ROOT)) {
        failed.push({ entryId, reason: 'bad-meta' })
        continue
      }
      if (existsSync(originalPath)) {
        failed.push({ entryId, reason: 'target-exists' })
        continue
      }
      await fs.mkdir(path.dirname(originalPath), { recursive: true })
      await fs.rename(payload, originalPath)
      await fs.rm(entryDir, { recursive: true, force: true })
      const sessionId = String(meta.sessionId ?? '')
      restored.push({ entryId, sessionId })
      if (sessionId) {
        restoredHeaders.set(sessionId, {
          id: sessionId,
          cwd: meta.cwd || undefined,
          createdAt: meta.deletedAt || Date.now(),
        })
      }
    } catch (error) {
      failed.push({ entryId, reason: String(error?.message ?? error) })
    }
  }
  if (restoredHeaders.size > 0) await announceRestored(ctx, restoredHeaders)
  return { restored, failed }
}

/** 彻底删除回收站条目（entryIds 为空 = 清空整个回收站）。 */
async function purgeTrash(entryIds) {
  const targets = entryIds.length > 0 ? entryIds.map(String) : (await readdirSafe(TRASH_ROOT)).map((e) => e.name)
  const purged = []
  const failed = []
  for (const entryId of targets) {
    try {
      await fs.rm(path.join(TRASH_ROOT, entryId), { recursive: true, force: true })
      purged.push(entryId)
    } catch (error) {
      failed.push({ entryId, reason: String(error?.message ?? error) })
    }
  }
  return { purged, failed }
}

// ── HTTP ──────────────────────────────────────────────────────────────────

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(text)
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

/**
 * 信任栅栏：本机回环 + 同源。Host/Origin 被伪造（DNS rebinding）或跨站请求一律拒。
 * @returns {number|null} 拒绝时返回状态码
 */
function rejectRequest(ctx, req) {
  const deny = (code) => code
  let authority
  try {
    authority = new URL(`http://${String(req.headers.host ?? '')}`)
  } catch {
    return deny(403)
  }
  const hostname = authority.hostname.toLowerCase()
  const isLoopback =
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '::1' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin && origin !== 'null') {
    let originUrl
    try {
      originUrl = new URL(origin)
    } catch {
      return deny(403)
    }
    if (originUrl.host.toLowerCase() !== authority.host.toLowerCase()) return deny(403)
  }
  if (String(req.headers['sec-fetch-site'] ?? '').toLowerCase() === 'cross-site') return deny(403)
  if (!isLoopback) {
    // 非回环：交给宿主的 connection 栅栏判（它知道 --trusted-host 声明了谁）
    const connection = ctx.get('connection')
    if (connection && typeof connection.requestRejection === 'function') {
      try {
        const code = connection.requestRejection(req)
        if (code !== undefined && code !== null && code !== false) return deny(typeof code === 'number' ? code : 403)
      } catch {
        return deny(403)
      }
    } else {
      return deny(403)
    }
  }
  return null
}

/**
 * Host 插件入口。
 * @param ctx - Cordis 根上下文
 */
export function apply(ctx) {
  ctx.inject(['webServer'], (c) => {
    const server = c.webServer
    const handler = async (req, res) => {
      const rejected = rejectRequest(ctx, req)
      if (rejected !== null) return sendJson(res, rejected, { ok: false, error: 'forbidden' })
      let body = {}
      if (String(req.method ?? 'GET').toUpperCase() === 'POST') body = await readBody(req)
      const action = String(body.action ?? new URL(req.url ?? '/', 'http://x').searchParams.get('action') ?? 'list')
      try {
        switch (action) {
          case 'list': {
            const archived = await listArchived(ctx)
            const trash = await listTrashEntries()
            return sendJson(res, 200, { ok: true, ...archived, trash })
          }
          case 'delete': {
            let ids = Array.isArray(body.sessionIds) ? body.sessionIds : []
            // 批量：all=true 时把当前所有归档会话一次性移入回收站
            if (body.all === true) {
              const archived = await listArchived(ctx)
              ids = archived.items.map((item) => item.sessionId)
            }
            if (ids.length === 0) return sendJson(res, 400, { ok: false, error: 'empty-selection' })
            const result = await moveToTrash(ctx, ids)
            return sendJson(res, 200, { ok: true, ...result })
          }
          case 'restore': {
            const entryIds = Array.isArray(body.entryIds) ? body.entryIds : []
            if (entryIds.length === 0) return sendJson(res, 400, { ok: false, error: 'empty-selection' })
            const result = await restoreFromTrash(ctx, entryIds)
            return sendJson(res, 200, { ok: true, ...result })
          }
          case 'purge': {
            // entryIds 为空 = 清空整个回收站（前端「清空」按钮就是这个语义）
            const entryIds = Array.isArray(body.entryIds) ? body.entryIds : []
            const result = await purgeTrash(entryIds)
            return sendJson(res, 200, { ok: true, ...result })
          }
          case 'prune': {
            // 只做一致性维护：清掉归档集合里指向已不存在会话的幽灵 id
            const archived = await listArchived(ctx)
            return sendJson(res, 200, { ok: true, pruned: archived.prunedOrphans ?? 0 })
          }
          default:
            return sendJson(res, 400, { ok: false, error: `unknown-action:${action}` })
        }
      } catch (error) {
        ctx.logger?.warn?.('dsh-archive-trash: %s', String(error?.message ?? error))
        return sendJson(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    }
    server.register({ kind: 'exact', path: API_PATH, handler: (req, res) => void handler(req, res) })
  })
}
