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
import zlib from 'node:zlib'
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

/**
 * 造一个「多帧 zstd」会话日志 —— 和真实环境一样，每行事件一帧。
 * 这是 issue #1 特别强调的：只解第一帧会得到 1 行，必须逐帧解。
 * @param {string} id sessionId
 * @param {object[]} events 事件数组，每个元素会被 JSON.stringify 成一帧
 */
async function makeZstdSession(id, events) {
  const dir = path.join(SESSIONS, CWD_KEY, id)
  await fs.mkdir(dir, { recursive: true })
  const frames = events.map((e) =>
    zlib.zstdCompressSync(Buffer.from(JSON.stringify(e) + '\n', 'utf8')),
  )
  await fs.writeFile(path.join(dir, 'session.v4.jsonl.zstd'), Buffer.concat(frames))
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
/** 记录插件 emit 了哪些 Host 事件（关键：api-session/removed） */
const emitted = []
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
  emit(event, ...args) {
    emitted.push([event, ...args])
  },
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
  // 关键：必须 emit api-session/removed，前端才会立刻把这一行从列表里拿掉，
  // 否则「删了还显示、必须重启」。
  const removed = emitted.filter((e) => e[0] === 'api-session/removed').map((e) => e[1])
  check('emit 了 api-session/removed', removed.includes(S1), removed)
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
  // 与删除对称：还原后必须补发 api-session/added，否则前端列表里看不到
  const added = emitted.filter((e) => e[0] === 'api-session/added').map((e) => e[1])
  const hit = added.find((s) => s && s.sessionId === S1)
  check('emit 了 api-session/added', hit !== undefined, added.map((s) => s?.sessionId))
  check('summary 带 sessionId/running=false', hit?.running === false && hit?.sessionId === S1, hit)
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

console.log('16) delete —— 非归档会话也能删')
{
  const S3 = 'session-cccc3333-4444-5555-6666-777788889999'
  const d3 = await makeSession(S3, 'E:/fake/workspace', 'z'.repeat(70))
  check('删除前不在归档集合', !archived.has(S3))
  const r = await request('delete', { sessionIds: [S3] })
  check('返回 200', r.status === 200, r)
  check('moved 1 个', r.body.moved?.length === 1, r.body)
  check('目录已消失', !(await fs.stat(d3).catch(() => null)))
  const trash = (await request('list')).body.trash
  const entry = trash.find((t) => t.sessionId === S3)
  check('进了回收站', entry !== undefined, trash)
  check('meta 有 cwd（非归档会话也补上了）', typeof entry?.cwd === 'string', entry)
}

console.log('17) delete —— 多选批量（勾选 N 个，非全选）')
{
  const A = 'session-aaa11111-1111-1111-1111-111111111111'
  const B = 'session-bbb22222-2222-2222-2222-222222222222'
  const C = 'session-ccc33333-3333-3333-3333-333333333333'
  const da = await makeSession(A, 'E:/fake/workspace', 'a'.repeat(30))
  const db = await makeSession(B, 'E:/fake/workspace', 'b'.repeat(30))
  await makeSession(C, 'E:/fake/workspace', 'c'.repeat(30))
  archived.add(A)
  archived.add(B)
  archived.add(C)

  const before = (await request('list')).body.trash.length
  // 只勾 A 和 B，C 留着
  const r = await request('delete', { sessionIds: [A, B] })
  check('返回 200', r.status === 200, r)
  check('moved 2 个', r.body.moved?.length === 2, r.body)
  check('A 的目录已消失', !(await fs.stat(da).catch(() => null)))
  check('B 的目录已消失', !(await fs.stat(db).catch(() => null)))
  const list = await request('list')
  check('C 仍在磁盘上', (await fs.stat(path.join(TMP, 'sessions', CWD_KEY, C)).catch(() => null)) !== null)
  check('C 仍在归档集合里', archived.has(C))
  check('回收站增加 2 条', list.body.trash.length === before + 2, { before, after: list.body.trash.length })
  check('A、B 已从归档集合摘除', !archived.has(A) && !archived.has(B))
  // 清理 C
  await request('delete', { sessionIds: [C] })
}

console.log('18) delete —— 超出上限的批量请求被截断')
{
  const many = []
  for (let i = 0; i < 3; i++) {
    const id = `session-bulk${i}000-0000-0000-0000-000000000000`
    await makeSession(id, 'E:/fake/workspace', 'z'.repeat(20))
    many.push(id)
  }
  const r = await request('delete', { sessionIds: many })
  check('moved 3 个', r.body.moved?.length === 3, r.body)
  check('truncated 标记为 false（未超上限）', r.body.truncated === false, r.body.truncated)
}

console.log('19) scanEmpty —— 六种会话的判定边界（issue #1）')
{
  // ① 纯头文件
  const E_HEAD = 'session-e0011111-0000-0000-0000-000000000001'
  await makeZstdSession(E_HEAD, [{ type: 'session', version: 4, id: E_HEAD }])

  // ② 头 + 预设事件（仍算空）
  const E_PRESET = 'session-e0022222-0000-0000-0000-000000000002'
  await makeZstdSession(E_PRESET, [
    { type: 'session', version: 4, id: E_PRESET },
    { type: 'permission/preset', preset: 'default' },
    { type: 'model/selection', model: 'x' },
    { type: 'session/end-seed' },
  ])

  // ③ 头 + 系统消息（只有 system/message，按 issue 要求仍算空）
  const E_SYSTEM = 'session-e0033333-0000-0000-0000-000000000003'
  await makeZstdSession(E_SYSTEM, [
    { type: 'session', version: 4, id: E_SYSTEM },
    { type: 'system/message', text: 'welcome' },
  ])

  // ④ 头 + user 消息（有对话，不算空）
  const E_USER = 'session-e0044444-0000-0000-0000-000000000004'
  await makeZstdSession(E_USER, [
    { type: 'session', version: 4, id: E_USER },
    { type: 'user/message', text: 'hello' },
  ])

  // ⑤ 头 + assistant 消息（有对话，不算空）
  const E_ASSIST = 'session-e0055555-0000-0000-0000-000000000005'
  await makeZstdSession(E_ASSIST, [
    { type: 'session', version: 4, id: E_ASSIST },
    { type: 'assistant/message', text: 'hi' },
  ])

  // ⑥ 损坏日志（不是 zstd 也不是 JSON）—— 应跳过，不能当空会话删掉
  const E_BROKEN = 'session-e0066666-0000-0000-0000-000000000006'
  await makeSession(E_BROKEN, 'E:/fake/workspace', Buffer.from([0x00, 0x01, 0x02, 0x03]))

  const r = await request('scanEmpty')
  check('scanEmpty 返回 200', r.status === 200, r)
  const ids = new Set((r.body.items || []).map((i) => i.sessionId))

  check('① 纯头文件 → 命中', ids.has(E_HEAD), [...ids])
  check('② 头+预设事件 → 命中', ids.has(E_PRESET), [...ids])
  check('③ 头+系统消息 → 命中（system 不算对话）', ids.has(E_SYSTEM), [...ids])
  check('④ 头+user 消息 → 不命中', !ids.has(E_USER), [...ids])
  check('⑤ 头+assistant 消息 → 不命中', !ids.has(E_ASSIST), [...ids])
  check('⑥ 损坏日志 → 不命中（跳过而非误判）', !ids.has(E_BROKEN), [...ids])

  // 多帧解码验证：② 有 4 条事件，若只解第一帧会变成 1
  const presetItem = (r.body.items || []).find((i) => i.sessionId === E_PRESET)
  check('多帧解码正确（4 条事件而非 1 条）', presetItem?.eventCount === 4, presetItem)

  // 标题为 null（空会话本来就没标题）
  const headItem = (r.body.items || []).find((i) => i.sessionId === E_HEAD)
  check('空会话 title 为 null', headItem?.title === null || headItem?.title === '', headItem)

  // 清理：删掉这批测试会话，避免影响后续断言
  for (const id of [E_HEAD, E_PRESET, E_SYSTEM, E_USER, E_ASSIST, E_BROKEN]) {
    await fs.rm(path.join(SESSIONS, CWD_KEY, id), { recursive: true, force: true })
  }
}

console.log('20) deleteEmpty —— 只删判定为空的，拒绝有内容的')
{
  const D_EMPTY = 'session-d0011111-0000-0000-0000-000000000001'
  const D_DIALOG = 'session-d0022222-0000-0000-0000-000000000002'
  await makeZstdSession(D_EMPTY, [{ type: 'session', version: 4, id: D_EMPTY }])
  await makeZstdSession(D_DIALOG, [
    { type: 'session', version: 4, id: D_DIALOG },
    { type: 'user/message', text: 'real' },
  ])

  // 传一个有对话的 id → 应被拒绝
  const r1 = await request('deleteEmpty', { sessionIds: [D_DIALOG] })
  check('有对话的会话被拒绝（400）', r1.status === 400, r1.body)
  check('拒绝原因 none-qualified', r1.body.error === 'none-qualified', r1.body)
  check('目录仍在磁盘上', (await fs.stat(path.join(SESSIONS, CWD_KEY, D_DIALOG)).catch(() => null)) !== null)

  // 混传：空的删掉，有对话的进 rejected
  const r2 = await request('deleteEmpty', { sessionIds: [D_EMPTY, D_DIALOG] })
  check('混合请求返回 200', r2.status === 200, r2.body)
  check('只删了 1 个', r2.body.moved?.length === 1, r2.body)
  check('有对话的被列入 rejected', Array.isArray(r2.body.rejected) && r2.body.rejected.includes(D_DIALOG), r2.body.rejected)
  check('空会话目录已消失', (await fs.stat(path.join(SESSIONS, CWD_KEY, D_EMPTY)).catch(() => null)) === null)

  // 进了回收站且能还原
  const trash = (await request('list')).body.trash
  const entry = trash.find((t) => t.sessionId === D_EMPTY)
  check('空会话进了回收站', entry !== undefined, trash.map((t) => t.sessionId))
  check('回收站 meta 的 title 为 null', entry?.title === null || entry?.title === '', entry)

  if (entry) {
    const r3 = await request('restore', { entryIds: [entry.entryId] })
    check('空会话能还原', r3.status === 200 && r3.body.restored?.length === 1, r3.body)
  }

  await fs.rm(path.join(SESSIONS, CWD_KEY, D_DIALOG), { recursive: true, force: true })
}

console.log('21) scanStray —— 只扫没被工作区记账的会话')
{
  // 先清干净，避免前面用例留下的会话干扰
  const cwdDir = path.join(SESSIONS, CWD_KEY)
  for (const name of await fs.readdir(cwdDir)) {
    if (name.startsWith('session-') && !archived.has(name)) {
      // 保留，后面按需造
    }
  }

  // 造三个会话：一个有归属、一个游离、一个超新
  const S_TRACKED = 'session-57a00001-0000-0000-0000-000000000001'
  const S_STRAY = 'session-57a00002-0000-0000-0000-000000000002'
  await makeZstdSession(S_TRACKED, [
    { type: 'session', version: 4, id: S_TRACKED, cwd: 'E:/fake/workspace', createdAt: Date.now() - 86400000 * 30 },
    { type: 'user/message', text: 'hi' },
  ])
  await makeZstdSession(S_STRAY, [
    { type: 'session', version: 4, id: S_STRAY, cwd: 'E:/fake/workspace', createdAt: Date.now() - 86400000 * 30 },
    { type: 'user/message', text: 'hello' },
  ])

  // 让 S_TRACKED 有工作区归属
  const ws = { id: 'ws-test', sessionIds: [S_TRACKED] }
  registry.list = () => [ws]

  const r = await request('scanStray')
  check('scanStray 返回 200', r.status === 200, r)
  const ids = new Set((r.body.items || []).map((i) => i.sessionId))

  check('有归属的 → 不命中', !ids.has(S_TRACKED), [...ids])
  check('游离的 → 命中', ids.has(S_STRAY), [...ids])
  check('返回 tracked 计数', typeof r.body.tracked === 'number', r.body)
  check('返回 total 计数', typeof r.body.total === 'number', r.body)
  const strayItem = (r.body.items || []).find((i) => i.sessionId === S_STRAY)
  check('游离会话带 dialogCount', strayItem?.dialogCount === 1, strayItem)
  check('游离会话带 bytes', typeof strayItem?.bytes === 'number', strayItem)

  // deleteStray：只删游离的
  const r2 = await request('deleteStray', { sessionIds: [S_STRAY, S_TRACKED] })
  check('混合请求返回 200', r2.status === 200, r2.body)
  check('只删了游离的那个', r2.body.moved?.length === 1, r2.body)
  check('有归属的进 rejected', r2.body.rejected?.includes(S_TRACKED), r2.body.rejected)
  check('游离会话目录已消失', (await fs.stat(path.join(SESSIONS, CWD_KEY, S_STRAY)).catch(() => null)) === null)
  check('有归属的仍在磁盘', (await fs.stat(path.join(SESSIONS, CWD_KEY, S_TRACKED)).catch(() => null)) !== null)

  // 只传有归属的 → 400
  const r3 = await request('deleteStray', { sessionIds: [S_TRACKED] })
  check('只传有归属的 → 400', r3.status === 400, r3.body)
  check('拒绝原因 none-qualified', r3.body.error === 'none-qualified', r3.body)

  await fs.rm(path.join(SESSIONS, CWD_KEY, S_TRACKED), { recursive: true, force: true })
  registry.list = () => []
}

console.log('22) restore —— subagent 会话还原后保留 parentSession / origin')
{
  // 造一个 subagent 会话：带 parentSession 和 origin: 'subagent'
  const SUB = 'subagent-e0011111-2222-3333-4444-555566667777'
  const PARENT = 'session-parent00-0000-0000-0000-000000000000'
  const dir = await makeZstdSession(SUB, [
    {
      type: 'session',
      version: 4,
      id: SUB,
      createdAt: Date.now() - 3600000,
      cwd: 'E:/fake/workspace',
      parentSession: PARENT,
      origin: 'subagent',
      isSeeded: false,
      delegationDepth: 0,
    },
    { type: 'user/message', text: 'sub task' },
    { type: 'assistant/message', text: 'done' },
  ])

  // 移进回收站
  const r1 = await request('delete', { sessionIds: [SUB] })
  check('subagent 移入回收站', r1.body.moved?.length === 1, r1.body)

  const trash = (await request('list')).body.trash
  const entry = trash.find((t) => t.sessionId === SUB)
  check('回收站里有这条', entry !== undefined, trash.map((t) => t.sessionId))

  // 还原
  if (entry) {
    const r2 = await request('restore', { entryIds: [entry.entryId] })
    check('还原成功', r2.body.restored?.length === 1, r2.body)

    // 还原后 emit 的 api-session/added 必须带 parentSessionId 和 origin
    // emitted 的元素是 [event, ...args]，不是 { event, args }
    const added = emitted.filter(
      (e) => e[0] === 'api-session/added' && e[1]?.sessionId === SUB,
    )
    const last = added[added.length - 1]
    const summary = last?.[1]
    check('还原后发了 api-session/added', last !== undefined, emitted.map((e) => e[0]))
    check('summary 带 parentSessionId', summary?.parentSessionId === PARENT, summary)
    check('summary 带 origin=subagent', summary?.origin === 'subagent', summary)
    check(
      'summary 的 updatedAt 用真实 createdAt 而非 deletedAt',
      summary?.updatedAt !== entry.deletedAt,
      { updatedAt: summary?.updatedAt, deletedAt: entry.deletedAt },
    )
  }

  await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
}

await fs.rm(TMP, { recursive: true, force: true })
console.log('')
console.log(failures === 0 ? '全部通过 ✓' : `${failures} 项失败 ✗`)
process.exit(failures === 0 ? 0 : 1)
