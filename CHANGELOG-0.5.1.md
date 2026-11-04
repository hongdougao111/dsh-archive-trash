## 🗑️ dsh-archive-trash v0.5.1

> 修 v0.5.0 的空会话 tab —— 勾了也删不掉。

---

### 🐛 修复

**空会话点「移入回收站」报 `none-qualified`**

v0.5.0 加「空会话」tab 时漏改一处：`keyOf()` 原本只区分「归档」和「回收站」两种来源。

```js
// 错的
const keyOf = (row) => (tab === 'archived' ? row.sessionId : row.entryId)
```

空会话不是回收站条目，**没有 `entryId` 字段**，于是 `keyOf()` 返回 `undefined`。勾选集合里塞满了 `undefined`，交到后端一比对空集合，一个都不合格 → `none-qualified`。

```js
// 对的：只有回收站用 entryId
const keyOf = (row) => (tab === 'trash' ? row.entryId : row.sessionId)
```

**顺带修：选中体积显示不出来**

`selectedBytes` 只读了 `row.bytes`，而空会话的体积字段叫 `size`：

```js
// 改前
sum += Number(row.bytes) || 0
// 改后
sum += Number(row.bytes) || Number(row.size) || 0
```

现在「已选 2 项 · 5.0 KB」能正常显示了。

---

### 🧪 自检

20 组照旧全绿：

```sh
node selftest.mjs
```

---

### 📦 升级

```sh
dsh plugin --profile web add dsh-archive-trash@0.5.1
```

桌面端把 `web` 换成 `desktop`。装完**重启 DSH** ⚡

---

### 📋 变更摘要

| | |
|---|---|
| npm | `dsh-archive-trash@0.5.1` |
| 自检 | 20 / 20 |
| 修复 | `keyOf()` 对空会话返回 undefined；选中体积读错字段 |
