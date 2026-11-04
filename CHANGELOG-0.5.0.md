## 🗑️ dsh-archive-trash v0.5.0

> 新增「空会话」扫描 —— 一键找出那些从没说过话的会话。

---

### ✨ 新增：空会话清理

设置 → 归档清理，多了第三个 tab **「空会话 (N)」**。

新建后没发消息就退出、误点 `+`、切换工作区时重复开出的空白会话 —— 这些会话没有标题，侧边栏只能回落显示**工作区目录名**，和真正的工作区分不清，越攒越多。现在可以一次清掉。

- **扫描全部会话**，不限归档状态（未归档的空会话以前根本扫不到）
- 显示 cwd、时间、占用空间
- 全选 / 反选 → 「移入回收站 🧹 (N)」
- 进回收站后**照样能还原**

---

### 🔬 判定标准（严格）

解压 `session.v4.jsonl.zstd` 后逐条看事件：

| 事件 | 判定 |
|---|---|
| `user/message` | **有对话**，不算空 |
| `assistant/message` | **有对话**，不算空 |
| `session` 头 | 不算对话 |
| `permission/preset`、`model/selection`、`session/end-seed` | 不算对话 |
| `system/message` | 不算对话 |
| `tool/call`、`job/registered` 等自动事件 | 不算对话 |

只有**从没出现过 `user/message` 或 `assistant/message`** 的才算空会话。这样不会误删 bot 或任务会话。

---

### 🕳️ 踩到的坑：zstd 多帧

这是这个功能最大的技术难点。

DSH 的会话日志是**多帧 zstd 拼接**的（每 append 一句就是一帧）。而 `zlib.zstdDecompressSync(buf)` **只解第一帧**：

```js
zlib.zstdDecompressSync(全部字节)  // 181KB 的文件 → 只得到 1 行
```

实测 47 个真实会话日志，**全部只解出 1 行**，连 202KB 的也是。如果按这个结果判定，所有会话都会被当成「空会话」——**灾难性误删**。

正确做法是按魔数切帧：

```js
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

function splitZstdFrames(buf) {
  const starts = []
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === 0x28 && buf[i+1] === 0xb5 &&
        buf[i+2] === 0x2f && buf[i+3] === 0xfd) {
      starts.push(i)
      i += 3   // 跳过魔数剩余字节，避免同一帧重复命中
    }
  }
  return starts.map((s, k) => buf.subarray(s, k+1 < starts.length ? starts[k+1] : buf.length))
}
```

逐帧解压再拼接，47/47 全部解通，0 坏帧。

---

### 🛡️ 三道安全阀

**① 体积上限 64 KB**

真有内容的会话不会这么小。超过阈值的直接跳过，不当空会话。

**② 损坏日志跳过，不误判**

一条事件都解不出来的日志标记为 `corrupt`，进 `skipped` 而不是 `items`。

```js
return { hasDialog, eventCount: parsed, types, corrupt: parsed === 0 }
```

**③ 删除时二次扫描做闸门**

`deleteEmpty` 不会盲信前端传的 id，而是重新扫一遍，只删「确实判定为空」的：

```js
const scan = await scanEmptySessions(index)
const emptyIds = new Set(scan.items.map(it => it.sessionId))
const targets = asked.filter(id => emptyIds.has(id))
const rejected = asked.filter(id => !emptyIds.has(id))
```

有对话的会话被传进来 → 400 `none-qualified`，一个都不动。

---

### 📋 API

| action | 参数 | 作用 |
|---|---|---|
| `scanEmpty` | `limit?` | 返回 `{ items, skipped, limit }` |
| `deleteEmpty` | `sessionIds: string[]` 或 `all: true` | 只删判定为空的；返回 `{ moved, failed, rejected }` |

`items` 每项：`{ sessionId, title: null, cwd, size, mtime, eventCount, types }`

---

### ✅ 自检 18 → 20 组

新增两组专测判定边界（issue 要求的六种场景）：

```
19) scanEmpty —— 六种会话的判定边界
  ✓ ① 纯头文件 → 命中
  ✓ ② 头+预设事件 → 命中
  ✓ ③ 头+系统消息 → 命中（system 不算对话）
  ✓ ④ 头+user 消息 → 不命中
  ✓ ⑤ 头+assistant 消息 → 不命中
  ✓ ⑥ 损坏日志 → 不命中（跳过而非误判）
  ✓ 多帧解码正确（4 条事件而非 1 条）

20) deleteEmpty —— 只删判定为空的
  ✓ 有对话的会话被拒绝（400）
  ✓ 混合请求：只删空的，有对话的进 rejected
  ✓ 空会话进了回收站，meta 的 title 为 null
  ✓ 空会话能还原
```

测试用的是**真 zstd 多帧**（每事件一帧），和真实环境一致。

---

### 🎨 UI 细节

- 空会话行的标题显示为「无标题」，右侧有 **「空」** 徽标，和工作区名区分开
- 工具栏在空会话 tab 下变成 **「重新扫描 🔍」**
- 确认框写明：**「把 N 个空会话移进回收站？它们从没发过消息，之后仍可还原。」**
- 有跳过的会话时，结果提示里会带上数量

---

### 📦 升级

```sh
dsh plugin --profile web add dsh-archive-trash@0.5.0
```

桌面端把 `web` 换成 `desktop`。装完**必须重启 DSH** —— 新增的 action 要 Host 重新加载才生效 ⚡

---

### 📋 变更摘要

| | |
|---|---|
| npm | `dsh-archive-trash@0.5.0` |
| 自检 | 20 / 20 |
| 新增文件 | `empty-scan.js` |
| 关联 issue | [#1](https://github.com/hongdougao111/dsh-archive-trash/issues/1) |
