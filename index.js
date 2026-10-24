/**
 * dsh-archive-trash · Host 半边
 *
 * 职责：
 *  - 列出所有「已归档」会话（workspaceRegistry.archivedSessionIds）；
 *  - 把选中的会话目录整体移进回收站（$DSH_HOME/.trash/sessions/），可还原；
 *  - 彻底清空回收站；
 *  - 从 workspace 的归档集合 / 会话归属里摘掉对应 id，避免残留脏数据。
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

/** 读取目录，失败返回空数组（目录不存在 = 还没建过会话）。 */
async function readdirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
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
    try {
      const stat = await fs.stat(path.join(dir, 'payload'))
      if (stat.isDirectory()) {
        for (const f of await readdirSafe(path.join(dir, 'payload'))) {
          if (!f.isFile()) continue
          try {
            bytes += (await fs.stat(path.join(dir, 'payload', f.name))).size
          } catch {}
        }
      }
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
  if (archivedIds.length === 0) return { items: [], missingRegistry: false }

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
  for (const id of archivedIds) {
    const dir = index.get(id) ?? ''
    let bytes = 0
    let exists = false
    if (dir) {
      exists = true
      const files = await readdirSafe(dir)
      for (const f of files) {
        if (!f.isFile()) continue
        try {
          bytes += (await fs.stat(path.join(dir, f.name))).size
        } catch {}
      }
    }
    items.push({
      sessionId: id,
      title: titles.get(id) ?? '',
      cwd: cwds.get(id) ?? '',
      createdAt: createdAts.get(id) ?? 0,
      dir,
      exists,
      bytes,
    })
  }
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return { items, missingRegistry: false }
}

/** 从 workspace 注册表里摘掉这些 id（归档集合 + 各 workspace 的归属）。 */
async function forgetSessions(ctx, sessionIds) {
  const registry = ctx.get('workspaceRegistry')
  if (!registry) return
  for (const id of sessionIds) {
    try {
      await registry.unarchiveSession(id)
    } catch {}
    try {
      const workspace = (registry.list?.() ?? []).find((w) =>
        (w.sessionIds ?? []).some((sid) => String(sid) === String(id)),
      )
      if (workspace) await workspace.detachSession(id)
    } catch {}
  }
}

/** 把若干会话移进回收站。 */
async function moveToTrash(ctx, sessionIds) {
  const index = await indexSessionDirs()
  const archived = await listArchived(ctx)
  const known = new Map(archived.items.map((item) => [item.sessionId, item]))
  await fs.mkdir(TRASH_ROOT, { recursive: true })
  const moved = []
  const failed = []
  for (const rawId of sessionIds) {
    const id = String(rawId)
    const dir = index.get(id)
    if (!dir) {
      failed.push({ sessionId: id, reason: 'not-found' })
      continue
    }
    const entryId = `${Date.now()}-${id}`
    const entryDir = path.join(TRASH_ROOT, entryId)
    try {
      await fs.mkdir(entryDir, { recursive: true })
      const payload = path.join(entryDir, 'payload')
      await fs.rename(dir, payload)
      const cwd = known.get(id)?.cwd ?? ''
      await fs.writeFile(
        path.join(entryDir, 'meta.json'),
        JSON.stringify(
          {
            sessionId: id,
            originalPath: dir,
            cwd,
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
  return { moved, failed }
}

/** 从回收站还原。 */
async function restoreFromTrash(ctx, entryIds) {
  const restored = []
  const failed = []
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
      restored.push({ entryId, sessionId: meta.sessionId ?? '' })
    } catch (error) {
      failed.push({ entryId, reason: String(error?.message ?? error) })
    }
  }
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
            const ids = Array.isArray(body.sessionIds) ? body.sessionIds : []
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
            const entryIds = Array.isArray(body.entryIds) ? body.entryIds : []
            const result = await purgeTrash(entryIds)
            return sendJson(res, 200, { ok: true, ...result })
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
