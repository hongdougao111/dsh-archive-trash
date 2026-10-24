# dsh-archive-trash

> DSH 归档会话清理：把已归档的会话移进**可还原的回收站**，或彻底删除。

DeepSeek Harness 的「归档」只是把会话从侧边栏藏起来——日志文件仍然躺在磁盘上，永远不会被回收。时间一长，`$DSH_HOME/sessions/` 会攒下几十上百个再也不会打开的会话目录。

这个插件补上缺失的那一半：**删得掉，而且删错了还能捡回来。**

## 功能

- **设置页内置面板**：`设置 → 归档清理`，两个标签页——已归档 / 回收站。
- **移入回收站**：把选中会话的整个目录搬到 `$DSH_HOME/.trash/sessions/`，原位置立刻腾空，会话从侧边栏消失。
- **还原**：回收站里的条目可以一键放回原位；目标位置已被占用时明确拒绝覆盖，不静默丢数据。
- **彻底删除**：单选删除，或一键清空回收站。二次确认。
- **顺手清理元数据**：删除时同步从 workspace 的归档集合和会话归属里摘掉对应 id，不留脏数据。
- **中英双语**：跟随 DSH 的界面语言。
- **主题一致**：只用 `--dsw-alias-*` 主题 token，亮色/暗色都跟宿主走。

## 它不做什么

- **不碰你的工作目录**。只移动会话日志目录，不删除任何项目文件。
- **不重写持久化后端的目录编码规则**。会话在磁盘上的位置是按 sessionId 反查出来的，后端哪天改了编码规则，这个插件不会跟着坏。
- **不在归档时自动删除**。归档照旧只是归档，删除永远是你主动点的那一下。

## 安装

这个包**尚未发布到 npm**，请从 GitHub 安装：

```sh
dsh plugin --profile web add github:hongdougao111/dsh-archive-trash
```

也可以下载 [Release 里的预构建 tarball](https://github.com/hongdougao111/dsh-archive-trash/releases/latest/download/dsh-archive-trash-0.1.0.tgz) 后本地安装，免去构建授权：

```sh
dsh plugin --profile web add ./dsh-archive-trash-0.1.0.tgz
```

安装后需要重启 `dsh web` 让 Host 半边生效。

## 使用

1. 打开 `设置 → 归档清理`。
2. 「已归档」标签页列出所有归档会话（标题、cwd、时间、占用空间）。
3. 勾选 → `移入回收站`。
4. 想反悔：切到「回收站」→ 勾选 → `还原`。
5. 确定不要了：`彻底删除` 或 `清空回收站`。

## 磁盘布局

```
$DSH_HOME/
├── sessions/<cwd 编码>/<sessionId>/session.v4.jsonl.zstd   ← 会话日志
└── .trash/sessions/<时间戳>-<sessionId>/
    ├── payload/                    ← 原会话目录整体搬过来
    └── meta.json                   ← { sessionId, originalPath, title, cwd, deletedAt }
```

`meta.json` 里的 `originalPath` 是还原的唯一依据，所以回收站条目不要手工改名。

## 本地 API

Host 半边注册了一个本机路由 `POST /dsh-archive-trash`，body 为 `{ action, ... }`：

| action | 参数 | 作用 |
| --- | --- | --- |
| `list` | — | 返回 `{ items, trash, missingRegistry }` |
| `delete` | `sessionIds: string[]` | 移入回收站 |
| `restore` | `entryIds: string[]` | 从回收站还原 |
| `purge` | `entryIds: string[]`（空数组 = 清空全部） | 彻底删除 |

所有请求都过一道信任栅栏：跨站标记（`Sec-Fetch-Site: cross-site`）一律拒，`Origin` 与 `Host` 不同源一律拒，非回环地址交给宿主的 `connection.requestRejection` 判。

## 自检

仓库里带一个不碰真实 `$DSH_HOME` 的自检脚本——它在临时目录搭一套假会话布局，加载 Host 半边，用假 req/res 打真实 handler：

```sh
node selftest.mjs
```

覆盖 11 组场景：列表 / 跨站拒绝 / 空选择 / 移入回收站 / 回收站列表 / 还原 / 目标占用拒绝 / 彻底删除 / 清空回收站 / 不存在的会话 / 未知 action。

## 兼容性

- 需要 DSH `0.2.x`（`settings.section` slot + `workspaceRegistry` 服务）。
- `web` 与 `desktop` 两种 profile 都适用。

## License

MIT
