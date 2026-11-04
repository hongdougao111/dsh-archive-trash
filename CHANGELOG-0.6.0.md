## 🗑️ dsh-archive-trash v0.6.0

> 新增「游离会话」—— 看不见、删不掉、一直占着磁盘的那种。

---

### ✨ 新增：游离会话清理

设置 → 归档清理，多了第四个 tab **「游离 (N)」**。

**什么叫游离**：DSH 侧边栏按 Workspace 的 `sessionIds` 分组渲染。会话一旦从记账里被摘掉（卸载插件、切 profile、后端迁移……），文件还留在 `$DSH_HOME/sessions`，但**界面上再也看不见它**。

它们不会自己消失，也不会出现在任何列表里。你的机器上有 44 个会话日志，侧边栏只显示 8 个 —— 剩下 36 个就是游离的。

**和「空会话」的区别**：

|  | 判定依据 | 可能有大量对话 |
|---|---|---|
| 空会话 | 日志里没有任何 `user/message` / `assistant/message` | 否 |
| 游离会话 | 没被任何工作区的 `sessionIds` 记账 | **是** |

两者正交：一个游离会话可能塞着几十条对话。

---

### 🎯 怎么用

`设置 → 归档清理 → 游离` → 自动扫描 → 每行显示 **最后活动时间 / 对话条数 / 占用大小**

按**最久没动的排前面** —— 清理时优先看到它们。

勾选 → 「移入回收站 🧹 (N)」→ 可还原。

---

### 📋 API

| action | 参数 | 作用 |
|---|---|---|
| `scanStray` | `olderThanDays?` | 返回 `{ items, skipped, tracked, total }` |
| `deleteStray` | `sessionIds[]` 或 `all: true` | 只删判定为游离的，返回 `{ moved, failed, rejected }` |

`items` 每项：`{ sessionId, title, cwd, createdAt, mtime, userMessages, assistantMessages, dialogCount, eventCount, bytes }`

---

### 🛡️ 安全阀

**① 拿不到注册表就放弃**

```js
function collectTrackedSessionIds(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (!registry || typeof registry.list !== 'function') return null
  ...
}
```

返回 `null` 时 `scanStray` 直接返回 `unsupported: true`，**不会把所有会话都判成游离**。这是最关键的一道 —— 否则注册表一失效就会扫出全部会话。

**② 删除时二次扫描做闸门**

```js
const scan = await scanStraySessions(index, tracked)
const strayIds = new Set(scan.items.map(it => it.sessionId))
const targets = asked.filter(id => strayIds.has(id))
const rejected = asked.filter(id => !strayIds.has(id))
```

有归属的会话被传进来 → 400 `none-qualified`，一个都不动。

**③ 损坏日志跳过**

解不出事件的标记 `parse-failed`，进 `skipped` 不进 `items`。

---

### ✅ 自检 20 → 21 组

```
21) scanStray —— 只扫没被工作区记账的会话
  ✓ 有归属的 → 不命中
  ✓ 游离的 → 命中
  ✓ 返回 tracked / total 计数
  ✓ 游离会话带 dialogCount / bytes
  ✓ 只删了游离的那个
  ✓ 有归属的进 rejected
  ✓ 只传有归属的 → 400 none-qualified
  ✓ 游离会话目录已消失
  ✓ 有归属的仍在磁盘
```

---

### 🧪 真机实测

重启后对运行中的 DSH 实测：

```
=== scanStray ===
HTTP 200 | 耗时 534ms
游离会话: 36
有归属: 8 / 磁盘总数: 44
跳过: 0

最久没动的 5 个:
  15天前   9 条对话
  15天前   8 条对话
  15天前  27 条对话
  15天前  27 条对话
  15天前  32 条对话

=== scanEmpty（对照）=== HTTP 200 | 空会话: 2
=== list（确认没坏）=== HTTP 200 | 归档: 0 | 回收站: 4
```

36 个游离会话，合计 **5.8 MB**。其中 34 个有真实对话，2 个是空会话。

---

### 🎨 UI 细节

- 行尾显示 **「N 条对话」**，一眼看出这个会话值不值得留
- 有 **「游离」** 徽标（橙色 warn 样式）
- 工具栏在游离 tab 下变成 **「扫描游离 🔍」**
- 确认框：**「把 N 个游离会话移进回收站？它们没有工作区归属，之后仍可还原。」**

---

### 📦 升级

```sh
dsh plugin --profile web add dsh-archive-trash@0.6.0
```

桌面端把 `web` 换成 `desktop`。装完**必须重启 DSH** ⚡

---

### 📋 变更摘要

| | |
|---|---|
| npm | `dsh-archive-trash@0.6.0` |
| 自检 | 21 / 21 |
| 新增文件 | `stray-scan.js` |
| 新增 tab | 游离会话 |
