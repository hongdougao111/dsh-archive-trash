/**
 * 用 GitHub REST API（走 api.github.com，绕过被墙的 github.com:443）把仓库内容推上去。
 * 用法：node push-via-api.mjs <owner/repo> <branch> <rootDir>
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const [, , repo, branch, rootDir] = process.argv
const token = (await fs.readFile(process.env.TOKEN_FILE, 'utf8')).trim()
if (!repo || !branch || !rootDir) throw new Error('usage: node push-via-api.mjs owner/repo branch dir')
if (!token) throw new Error('empty token')

const API = 'https://api.github.com'

async function gh(method, url, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${text.slice(0, 400)}`)
  return data
}

const SKIP = new Set(['.git', 'node_modules'])

async function walk(dir, base = '') {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const rel = base ? `${base}/${entry.name}` : entry.name
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(abs, rel)))
    else if (entry.isFile()) out.push({ rel, abs })
  }
  return out
}

const files = await walk(rootDir)
console.log(`收集到 ${files.length} 个文件`)

// 1. 当前分支头（空仓库时 404）
let baseSha = null
try {
  const ref = await gh('GET', `/repos/${repo}/git/ref/heads/${branch}`)
  baseSha = ref.object.sha
  console.log(`现有分支头 ${baseSha}`)
} catch (error) {
  console.log('分支还不存在，创建初始提交')
}

// 2. 上传 blob
const entries = []
for (const file of files) {
  const content = await fs.readFile(file.abs)
  const blob = await gh('POST', `/repos/${repo}/git/blobs`, {
    content: content.toString('base64'),
    encoding: 'base64',
  })
  entries.push({ path: file.rel, mode: '100644', type: 'blob', sha: blob.sha })
  console.log(`  blob ${file.rel}`)
}

// 3. 建 tree（保留已有 tree 以支持增量）
const treeBody = { tree: entries }
if (baseSha) {
  const baseCommit = await gh('GET', `/repos/${repo}/git/commits/${baseSha}`)
  treeBody.base_tree = baseCommit.tree.sha
}
const tree = await gh('POST', `/repos/${repo}/git/trees`, treeBody)
console.log(`tree ${tree.sha}`)

// 4. 建 commit
const message = process.argv[4] || 'feat: 归档会话清理插件 v0.1.0'
const commitBody = { message, tree: tree.sha }
if (baseSha) commitBody.parents = [baseSha]
const commit = await gh('POST', `/repos/${repo}/git/commits`, commitBody)
console.log(`commit ${commit.sha}`)

// 5. 更新 / 创建分支引用
if (baseSha) {
  await gh('PATCH', `/repos/${repo}/git/refs/heads/${branch}`, { sha: commit.sha, force: true })
  console.log('分支已更新')
} else {
  await gh('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha })
  console.log('分支已创建')
}

console.log(`\n完成：https://github.com/${repo}/tree/${branch}`)
