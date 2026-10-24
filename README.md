# dsh-archive-trash 🗑️

> 归档只是把会话**藏起来**，日志还赖在硬盘上不走。这个插件给它一个体面的下场 👋

## 你的 `sessions/` 里住着一窝僵尸 🧟

DeepSeek Harness 的「归档」很温柔：从侧边栏消失，文件原地不动。温柔到有点问题——那些你再也不会打开的会话，日志会**永久**躺在 `$DSH_HOME/sessions/` 里，一天天攒，几十个、上百个目录，每个都还在偷偷占地方。

官方的按钮叫「归档」，不叫「删除」。因为删除这件事，它没做 😅

这个插件来补上：**删得掉，而且删错了能捡回来** 🪄

## 能干什么 🎁

- **设置页里开了个抽屉** — `设置 → 归档清理`，两个标签：已归档 / 回收站，清清爽爽
- **会话行上直接删** — 已归档的会话，鼠标划过去行尾就冒出一个小垃圾桶按钮 🗑️ 点一下变 ✓/✕ 二选一，不用跑去设置页
- **`...` 菜单里也有一行** — 「移入回收站（可还原）」，顺手
- **批量删除** — 「全部移入回收站」一键清空所有归档会话，不用一个个勾
- **移入回收站** — 整个会话目录搬进 `$DSH_HOME/.trash/sessions/`，原位置立刻腾空 🧹
- **后悔药管够** — 回收站里勾一下就能放回原位。目标位置被占了？它会**明确拒绝**，而不是悄悄覆盖 💊
- **彻底删除** — 单选删，或者一键清空整个回收站。都要二次确认，防手滑 ✋
- **自动清理幽灵条目** — 归档集合里指向已删文件的失效 id 会被自动摘掉，不会再显示成「日志已不在磁盘上」的僵尸行 👻➡️🚫
- **中英双语** — 跟着 DSH 的界面语言走 🌏
- **跟皮肤不打架** — 只用 `--dsw-alias-*` 主题 token，亮色暗色都服帖 🎨

## 它不干什么 🙅

- **不碰你的工作目录** — 只动会话日志目录，项目文件一根头发都不动
- **不重写持久化后端的目录编码规则** — 会话位置是按 sessionId **反查**出来的，后端哪天改了编码，它也不会跟着坏
- **不在归档时自动删除** — 归档还是归档。删除永远是你主动点的那一下 👆

## 安装 📦

```sh
dsh plugin --profile web add dsh-archive-trash
```

桌面端把 `web` 换成 `desktop`。

或者下 [Release 里的预构建 tarball](https://github.com/hongdougao111/dsh-archive-trash/releases/latest/download/dsh-archive-trash-0.2.0.tgz)，本地装，免构建授权：

```sh
dsh plugin --profile web add ./dsh-archive-trash-0.2.0.tgz
```

> 也可以直接在 DSH 里点 **设置 → 插件 → + 添加插件**，把 `dsh-archive-trash` 粘进去 🖱️

装完重启 `dsh web`（桌面端重开应用），Host 半边才会上线 ⚡

## 怎么用 🕹️

**最快的路子**：侧边栏里把鼠标划到已归档的会话行上 → 行尾垃圾桶按钮 🗑️ → ✓ 确认。

**批量**：`设置 → 归档清理` → 「全部移入回收站 (N)」一键清空。

**精细操作**：

1. 打开 `设置 → 归档清理`
2. 「已归档」里能看到所有归档会话——标题、cwd、时间、**占了多少空间**
3. 勾选 → `移入回收站 🧹`
4. 反悔了？切到「回收站」→ 勾选 → `还原 💊`
5. 确定不要了？`彻底删除 🔥` 或 `清空回收站 🔥`

## 磁盘布局 🗂️

```
$DSH_HOME/
├── sessions/<cwd 编码>/<sessionId>/session.v4.jsonl.zstd   ← 会话日志
└── .trash/sessions/<时间戳>-<sessionId>/
    ├── payload/                    ← 原会话目录整体搬过来
    └── meta.json                   ← { sessionId, originalPath, title, cwd, deletedAt }
```

`meta.json` 里的 `originalPath` 是还原的唯一依据——所以回收站条目**别手工改名**，改了它就不认得回家的路了 🏠

## 本地 API 🔌

Host 半边注册了 `POST /dsh-archive-trash`，body 是 `{ action, ... }`：

| action | 参数 | 作用 |
| --- | --- | --- |
| `list` | — | 返回 `{ items, trash, missingRegistry, prunedOrphans }` |
| `delete` | `sessionIds: string[]` 或 `all: true` | 移入回收站；`all: true` = 当前全部归档会话 |
| `restore` | `entryIds: string[]` | 从回收站还原 |
| `purge` | `entryIds: string[]`（空数组 = 清空全部） | 彻底删除 |
| `prune` | — | 只做一致性维护：清掉归档集合里指向已删文件的幽灵 id |

所有请求都过一道信任栅栏 🛡️：跨站标记（`Sec-Fetch-Site: cross-site`）一律拒，`Origin` 与 `Host` 不同源一律拒，非回环地址交给宿主的 `connection.requestRejection` 判。

## 自检 🧪

仓库里带一个**不碰真实 `$DSH_HOME`** 的自检脚本——临时目录搭一套假会话布局，加载 Host 半边，用假 req/res 打真实 handler：

```sh
node selftest.mjs
```

15 组场景全绿 ✅：列表 / 跨站拒绝 / 空选择 / 移入回收站 / 回收站列表 / 还原 / 目标占用拒绝 / 彻底删除 / 清空回收站 / 不存在的会话 / 未知 action / 幽灵条目自动清理 / 批量清空 / 同毫秒批量不撞 entryId / prune 一致性维护

## 踩过的两个坑 🕳️

这两个都是这个插件自己修掉的真 bug，记下来省得以后又踩：

**① 删完会话冒出个「未分组」工作区**

DSH 前端 `groupByWorkspace` 的算法是：按各 Workspace 的 `sessionIds` 记账，凡是「在会话列表里、但没被任何 Workspace 记账」的会话都会掉进 stray，渲染成一个额外的「未分组」分组。

插件的 `detachSession()` 恰好就是把 id 从记账里摘掉 —— 但此刻前端内存里的会话列表还没刷新，那条会话仍在，于是立刻变成 stray。重启后从磁盘重载，文件已经没了，stray 才消失（所以表现为「重启才好了」）。

**修法**：不 detach，保留记账，只摘归档集合；紧接着调 `ctx.sessions.refresh()` 让 Client 重拉基线。文件没了 → 列表里没了 → 记账里的残留 id 被跳过，`stray` 为空，不再出现「未分组」。

**② 归档列表里挂着「日志已不在磁盘上」的僵尸行**

`archivedSessionIds` 是持久化的，文件被删（或手工删掉）之后，那个 id 会永远留着。原来的实现老老实实把它列出来，标一句「日志已不在磁盘上」——看着像坏掉了。

**修法**：`list` 时顺手对账，磁盘上找不到的 id 直接从归档集合摘掉，不再渲染；返回值里带 `prunedOrphans` 计数。另外提供 `prune` action 做纯维护。

## 兼容性 📋

- 需要 DSH `0.2.x`（`settings.section` slot + `workspaceRegistry` 服务）
- `web` 与 `desktop` 两种 profile 都适用

## License

MIT
