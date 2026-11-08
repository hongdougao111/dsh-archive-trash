## 🗑️ dsh-archive-trash v0.6.1

> 归档再还原，会话有概率打不开 —— 修了。

---

### 🐛 这个 bug 是怎么来的

还原之后要告诉 DSH「这个会话回来了」，做法是补发一条 `api-session/added` 事件。这条事件带着一个 summary，前端拿它重建侧边栏那一行。

问题出在 summary 的字段来源。之前是拿 `meta.json` 拼的：

```js
// 改前
restoredHeaders.set(sessionId, {
  id: sessionId,
  cwd: meta.cwd || undefined,
  createdAt: meta.deletedAt || Date.now(),
})
```

而 `meta.json` 是我们自己写的，只有 `sessionId` / `cwd` / `title` / `deletedAt` 四个字段。

**subagent 会话还带着两个字段：`parentSession` 和 `origin`。**这两样只存在于会话日志里，meta 里根本没有。

于是还原后的 summary 少了 `parentSessionId` 和 `origin`，前端拿到的会话没有父会话归属 —— 打开就是「会话不可用」。

**为什么是「有概率」**：只有 subagent 会话会中。普通会话本来就没有这两个字段，不受影响。

---

### 🔧 改法

不再拿 meta 拼，**直接从刚落盘的会话日志里读真实 header**：

```js
const realHeader = await readSessionHeader(originalPath)
restoredHeaders.set(sessionId, {
  header: realHeader,              // 真实 header 优先
  fallbackCwd: meta.cwd || undefined,
  fallbackCreatedAt: meta.deletedAt || Date.now(),
})
```

`announceRestored` 改成优先用真实 header：

```js
const header = entry?.header ?? null
const cwd = header?.cwd ?? entry?.fallbackCwd
const createdAt = Number(header?.createdAt) || Number(entry?.fallbackCreatedAt) || Date.now()
```

读不到日志时退回 meta 的老路，不会更糟。

**顺带修好的**：`updatedAt` 之前用的是 `deletedAt`（删除那一刻的时间），现在用真实的 `createdAt`。会话的时间线不会因为删过一次就错乱。

---

### ✅ 新测试能抓到这个 bug

加了第 22 组，造一个带 `parentSession` + `origin: 'subagent'` 的会话，走完整流程：移入回收站 → 还原 → 检查 emit 出来的 summary。

```
22) restore —— subagent 会话还原后保留 parentSession / origin
  ✓ subagent 移入回收站
  ✓ 回收站里有这条
  ✓ 还原成功
  ✓ 还原后发了 api-session/added
  ✓ summary 带 parentSessionId
  ✓ summary 带 origin=subagent
  ✓ summary 的 updatedAt 用真实 createdAt 而非 deletedAt
```

**验证过测试确实有效**：把修复临时退回去，这两条立刻失败，报错里的 summary 正好缺 `parentSessionId` 和 `origin` —— 和线上症状对得上。

---

### 📋 自检 21 → 22 组

```sh
node selftest.mjs
```

---

### 📦 升级

```sh
dsh plugin --profile web add dsh-archive-trash@0.6.1
```

桌面端把 `web` 换成 `desktop`。装完**重启 DSH** ⚡

---

### ⚠️ 已经坏掉的会话

这个版本修的是**以后的还原**。

已经被旧版本还原过、打成「会话不可用」的那些会话，文件其实还在磁盘上（`$DSH_HOME/sessions/<cwd编码>/<sessionId>/`），只是前端那一行的 summary 是残缺的。**重启 DSH 会让它从磁盘重建，大概率能恢复。**

如果重启还不行，用 `设置 → 归档清理 → 游离` 扫一遍，能看到那些没归属的会话，再移回回收站重新还原一次（这次会用新逻辑读真实 header）。

---

### 📋 变更摘要

| | |
|---|---|
| npm | `dsh-archive-trash@0.6.1` |
| 自检 | 22 / 22 |
| 修复 | 还原后 summary 丢 `parentSessionId` / `origin` |
| 顺带 | `updatedAt` 改用真实 `createdAt` |
