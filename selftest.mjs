/**
 * dsh-archive-trash 自检脚本（不碰真实 $DSH_HOME）
 *
 * 在临时目录里搭一套假的 DSH_HOME：
 *   sessions/<cwd目录>/<sessionId>/session.v4.jsonl.zstd
 * 然后加载 index.js，用假 ctx 触发 apply，再用假 req/res 打真实 HTTP handler。
 *
 * 覆盖：list / delete(移入回收站) / restore / purge / 空选择 / 未知 action / 跨站拒绝
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'

const TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'ac-selftest-'))
process.env.DSH_HOME = TMP

const SESSIONS = path.join(TMP, 'sessions')
const CWD_KEY = '--E-fake-workspace--'
const S1 = 'session-aaaa1111-2222-3333-4444-555566667777'
const S2 = 'session-bbbb1111-2222-3333-4444-555566667777'

async function makeSession(id, cwd, payload) {
  const dir = path.join(SESSIONS, CWD_KEY, id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'session.v4.jsonl.zstd'), payload)
  return dir
}

const dir1 = await makeSession(S1, 'E:/fake/workspace', 'x'.repeat(100))
const dir2 = await makeSession(S2, 'E:/fake/workspace', 'y'.repeat(250))

// 无关目录：不该被当成会话
await fs.mkdir(path.join(SESSIONS, CWD_KEY, 'not-a-session'), { recursive: true })

const archived = new Set([S1, S2])
const detached = []

const registry = {
  get archivedSessionIds() {
    return [...archived]
  },
  async unarchiveSession(id) {
    archived.delete(String(id))
  },
  list() {
    return [
      {
        id: 'ws-1',
        sessionIds: [S1, S2],
        async detachSession(id) {
          detached.push(String(id))
        },
      },
    ]
  },
}

const query = {
  async listSessions() {
    return [
      { header: { id: S1, cwd: 'E:/fake/workspace', createdAt: 1000 } },
      { header: { id: S2, cwd: 'E:/fake/workspace', createdAt: 2000 } },
    ]
  },
  async readTitleSnapshots(ids) {
    return ids.map((id) => ({
      sessionId: id,
      status: 'fulfilled',
      value: { title: { title: id === S1 ? '第一个会话' : '第二个会话' } },
    }))
  },
}

let handler = null
const ctx = {
  get(name) {
    if (name === 'workspaceRegistry') return registry
    if (name === 'sessionQuery') return query
    if (name === 'connection') return { requestRejection: () => undefined }
    return undefined
  },
  inject(_names, cb) {
    cb({ webServer: { register: (route) => { handler = route.handler } } })
  },
  logger: { warn: () => {} },
  effect: (fn) => fn(),
  on: () => () => {},
}

const mod = await import(pathToFileURL(path.resolve('./index.js')).href)
mod.apply(ctx)
if (!handler) throw new Error('webServer.register 没有被调用')

// ── 假 HTTP ──────────────────────────────────────────────────────────────
async function request(action, payload = {}, headers = {}) {
  const body = Buffer.from(JSON.stringify({ action, ...payload }))
  const req = Readable.from([body])
  req.method = 'POST'
  req.url = '/dsh-archive-trash'
  req.headers = { host: '127.0.0.1:62240', 'content-type': 'application/json', ...headers }
  const chunks = []
  let done
  const finished = new Promise((resolve) => {
    done = resolve
  })
  const res = {
    statusCode: 200,
    setHeader() {},
    end(text) {
      chunks.push(text)
      done()
    },
  }
  // route.handler 是 `(req,res) => void inner(req,res)`，不能靠它的返回值等待，
  // 所以等 res.end 真正被调用。
  await handler(req, res)
  await Promise.race([finished, new Promise((r) => setTimeout(r, 2000))])
  return { status: res.statusCode, body: JSON.parse(chunks.join('') || '{}') }
}

let failures = 0
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.log(`  ✗ ${label}${detail === undefined ? '' : ' → ' + JSON.stringify(detail)}`)
  }
}

console.log('1) list —— 列出已归档会话')
{
  const r = await request('list')
  check('返回 200', r.status === 200, r)
  check('列出 2 条', r.body.items?.length === 2, r.body.items)
  check('标题折叠正确', r.body.items?.some((i) => i.title === '第一个会话'), r.body.items)
  check('字节数 > 0', r.body.items?.every((i) => i.bytes > 0), r.body.items)
  check('回收站初始为空', r.body.trash?.length === 0, r.body.trash)
}

console.log('2) 跨站请求被拒')
{
  const r = await request('list', {}, { 'sec-fetch-site': 'cross-site' })
  check('返回 403', r.status === 403, r)
}

console.log('3) delete —— 空选择被拒')
{
  const r = await request('delete', { sessionIds: [] })
  check('返回 400', r.status === 400, r)
}

console.log('4) delete —— 移入回收站')
{
  const r = await request('delete', { sessionIds: [S1] })
  check('返回 200', r.status === 200, r)
  check('moved 1 个', r.body.moved?.length === 1, r.body)
  check('原目录已消失', !(await fs.stat(dir1).catch(() => null)))
  check('归档集合已摘除', !archived.has(S1), [...archived])
  // ⚠️ 故意不 detach：detach 会让前端把该会话当 stray，多出一个「未分组」分组。
  check('workspace 归属保持不变（避免未分组幽灵）', !detached.includes(S1), detached)
  const trashDirs = await fs.readdir(path.join(TMP, '.trash', 'sessions'))
  check('回收站里有 1 个条目', trashDirs.length === 1, trashDirs)
  const entry = path.join(TMP, '.trash', 'sessions', trashDirs[0])
  const meta = JSON.parse(await fs.readFile(path.join(entry, 'meta.json'), 'utf8'))
  check('meta 记下了 originalPath', meta.originalPath === dir1, meta)
  check('meta 记下了标题', meta.title === '第一个会话', meta)
  const payload = await fs.readdir(path.join(entry, 'payload'))
  check('payload 里会话日志还在', payload.includes('session.v4.jsonl.zstd'), payload)
}

console.log('5) list —— 归档只剩 1 条，回收站 1 条')
{
  const r = await request('list')
  check('归档 1 条', r.body.items?.length === 1, r.body.items)
  check('回收站 1 条', r.body.trash?.length === 1, r.body.trash)
  check('回收站条目带 sessionId', r.body.trash?.[0]?.sessionId === S1, r.body.trash)
}

console.log('6) restore —— 还原')
{
  const list = await request('list')
  const entryId = list.body.trash[0].entryId
  const r = await request('restore', { entryIds: [entryId] })
  check('返回 200', r.status === 200, r)
  check('restored 1 个', r.body.restored?.length === 1, r.body)
  const back = await fs.stat(dir1).catch(() => null)
  check('会话目录回到原位', back?.isDirectory() === true)
  check('回收站已空', (await fs.readdir(path.join(TMP, '.trash', 'sessions'))).length === 0)
}

console.log('7) restore —— 目标已存在时拒绝覆盖')
{
  await request('delete', { sessionIds: [S1] })
  const list = await request('list')
  const entryId = list.body.trash[0].entryId
  // 手工在原位造一个同名目录，模拟"还原目标被占"
  await fs.mkdir(dir1, { recursive: true })
  const r = await request('restore', { entryIds: [entryId] })
  check('failed 1 个', r.body.failed?.length === 1, r.body)
  check('失败原因是 target-exists', r.body.failed?.[0]?.reason === 'target-exists', r.body.failed)
  await fs.rm(dir1, { recursive: true, force: true })
  const again = await request('restore', { entryIds: [entryId] })
  check('腾出位置后能还原', again.body.restored?.length === 1, again.body)
}

console.log('8) purge —— 彻底删除')
{
  await request('delete', { sessionIds: [S2] })
  const list = await request('list')
  const entryId = list.body.trash[0].entryId
  const r = await request('purge', { entryIds: [entryId] })
  check('purged 1 个', r.body.purged?.length === 1, r.body)
  check('回收站目录已删', (await fs.readdir(path.join(TMP, '.trash', 'sessions'))).length === 0)
}

console.log('9) purge —— 清空回收站')
{
  // 此时 S2 的日志在步骤 8 已被永久删除，只有 S1 还能移动
  await request('delete', { sessionIds: [S1] })
  const before = (await request('list')).body.trash.length
  check('回收站有 1 条', before === 1, before)
  const r = await request('purge', { entryIds: [] })
  check('purged 1 个', r.body.purged?.length === 1, r.body)
  check('回收站已空', (await request('list')).body.trash.length === 0)
}

console.log('10) delete —— 不存在的会话')
{
  const r = await request('delete', { sessionIds: ['session-does-not-exist'] })
  check('failed 1 个', r.body.failed?.length === 1, r.body)
  check('原因是 not-found', r.body.failed?.[0]?.reason === 'not-found', r.body.failed)
}

console.log('11) 未知 action')
{
  const r = await request('nope')
  check('返回 400', r.status === 400, r)
}

console.log('12) 幽灵归档条目自动清理')
{
  // 造一个归档集合里有、磁盘上却没有的 id
  const ghost = 'session-ghost-0000-0000-0000-000000000000'
  archived.add(ghost)
  const r = await request('list')
  check('幽灵条目不出现在列表里', !r.body.items?.some((i) => i.sessionId === ghost), r.body.items)
  check('归档集合里的幽灵已被摘除', !archived.has(ghost), [...archived])
  check('返回 prunedOrphans 计数', r.body.prunedOrphans >= 1, r.body)
}

console.log('13) delete all —— 批量清空归档')
{
  // 重新造两个会话
  const d1 = await makeSession(S1, 'E:/fake/workspace', 'x'.repeat(80))
  const d2 = await makeSession(S2, 'E:/fake/workspace', 'y'.repeat(90))
  archived.add(S1)
  archived.add(S2)
  const before = (await request('list')).body.items.length
  check('归档里有 2 条', before === 2, before)
  const r = await request('delete', { all: true })
  check('moved 2 个', r.body.moved?.length === 2, r.body)
  check('两个目录都已消失', !(await fs.stat(d1).catch(() => null)) && !(await fs.stat(d2).catch(() => null)))
  check('归档集合已清空', archived.size === 0, [...archived])
  check('回收站里有 2 条', (await request('list')).body.trash.length === 2)
}

console.log('14) 同一毫秒批量移动 —— entryId 不撞车')
{
  // 归档集合里现在应为空，补两个再一起删
  await makeSession(S1, 'E:/fake/workspace', 'a'.repeat(50))
  await makeSession(S2, 'E:/fake/workspace', 'b'.repeat(50))
  archived.add(S1)
  archived.add(S2)
  const before = (await request('list')).body.trash.length
  await request('delete', { all: true })
  const after = (await request('list')).body.trash.length
  check('回收站增加 2 条（无覆盖）', after === before + 2, { before, after })
  // entryId 唯一性
  const ids = (await request('list')).body.trash.map((t) => t.entryId)
  check('entryId 全部唯一', new Set(ids).size === ids.length, ids)
}

console.log('15) prune —— 只做一致性维护，不删数据')
{
  const ghost = 'session-ghost-1111-1111-1111-111111111111'
  archived.add(ghost)
  const r = await request('prune')
  check('返回 pruned=1', r.body.pruned === 1, r.body)
  check('幽灵已移除', !archived.has(ghost), [...archived])
  check('回收站未受影响', (await request('list')).body.trash.length > 0)
}

await fs.rm(TMP, { recursive: true, force: true })
console.log('')
console.log(failures === 0 ? '全部通过 ✓' : `${failures} 项失败 ✗`)
process.exit(failures === 0 ? 0 : 1)
