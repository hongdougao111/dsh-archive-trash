## 🗑️ dsh-archive-trash v0.6.2

> 对 DSH 0.2.2-rc.1 重新核了一遍，代码不用改，只补兼容声明。

---

### 🔍 这次核了什么

DSH 升到 **0.2.2-rc.1**，cordis 从 4.0.5 到 **4.1.0**。逐项对了一遍：

| API / Slot | 状态 |
|---|---|
| `ctx.emit('api-session/removed')` | ✅ |
| `ctx.emit('api-session/added')` | ✅ |
| `sessionQuery.listSessions()` | ✅ |
| `workspaceRegistry.unarchiveSession()` | ✅ |
| `workspaceRegistry.list()` | ✅ |
| `webServer` + `register()` | ✅ |
| `settings.section` slot | ✅ 14 处 |
| `sidebar.workspaces.session.row.action` slot | ✅ 8 处 |
| `sessions.refresh()` | ⚠️ 仍无（v0.4.1 已改成能力探测） |
| `connection.requestRejection()` | ⚠️ 仍无（v0.4.1 已改成默认拒绝） |

主题 token 124 个，插件用到 11 个，**缺失 0**。

**结论：代码一行没动，0.6.1 的构建原样兼容。**

---

### ✅ 运行实例实测

对 0.2.2-rc.1 的活实例打过四个 action：

```
list       HTTP 200 | 归档 1 | 回收站 28 | 96ms
scanEmpty  HTTP 200 | 空会话 1 | 跳过 19
scanStray  HTTP 200 | 游离 3 | 有归属 17/20
```

`scanEmpty` 那 19 个跳过全是 `too-large` —— 体积从 87 KB 到 19 MB，都是真有内容的会话。安全阀按设计工作，没误判。

自检 **22 组全绿**：

```sh
node selftest.mjs
```

---

### 📋 变更

只改了两处：

- `README.md` 的实测声明：`0.2.1-rc.5` → `0.2.2-rc.1`（附 cordis 4.1.0）
- `package.json` 版本号

**没有任何功能改动。**0.6.1 已经能跑了，这版只是把"验证过"这句话说准。

---

### 📦 升级

```sh
dsh plugin --profile web add dsh-archive-trash@0.6.2
```

桌面端把 `web` 换成 `desktop`。装完**重启 DSH** ⚡

> 已经在 0.6.1 上的话，不升也照样跑。

---

### 📋 变更摘要

| | |
|---|---|
| npm | `dsh-archive-trash@0.6.2` |
| 自检 | 22 / 22 |
| 适配 | DSH 0.2.2-rc.1 · cordis 4.1.0 |
| 功能改动 | 无 |
