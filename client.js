window.__ModuleLoader__.load({
  id: 'dsh-archive-trash',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useMemo } = React

    const API = '/dsh-archive-trash'

    // ── 样式（用宿主主题 token，跟着亮/暗主题走）──────────────────────────
    const STYLE_ID = 'dsh-archive-trash-style'
    const CSS = `
.ac-wrap{display:flex;flex-direction:column;gap:14px;font-size:13px;color:var(--dsw-alias-label-primary)}
.ac-head{display:flex;flex-direction:column;gap:6px}
.ac-title{font-size:15px;font-weight:600;margin:0}
.ac-desc{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.ac-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ac-tabs{display:flex;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.ac-tab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:5px 12px;border-radius:6px;cursor:pointer}
.ac-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.12)}
.ac-tab:hover{color:var(--dsw-alias-label-primary)}
.ac-spacer{flex:1}
.ac-btn{appearance:none;font:inherit;font-size:12px;line-height:1;padding:7px 12px;border-radius:7px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);transition:background .12s,border-color .12s}
.ac-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}
.ac-btn:disabled{opacity:.45;cursor:default}
.ac-btn.primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}
.ac-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.ac-btn.danger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);color:#fff}
.ac-btn.ghost{border-color:transparent;background:transparent;color:var(--dsw-alias-label-secondary)}
.ac-btn.ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}
.ac-list{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.ac-row{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l1);min-height:44px}
.ac-row:first-child{border-top:0}
.ac-row:hover{background:var(--dsw-alias-bg-layer-2)}
.ac-check{flex:0 0 auto;width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.ac-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.ac-name{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ac-name.empty{color:var(--dsw-alias-label-secondary);font-style:italic}
.ac-meta{font-size:11px;color:var(--dsw-alias-label-secondary);display:flex;gap:10px;flex-wrap:wrap}
.ac-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.ac-tag{flex:0 0 auto;font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}
.ac-tag.warn{color:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary)}
.ac-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:38px 16px;text-align:center;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;color:var(--dsw-alias-label-secondary)}
.ac-empty-emoji{font-size:26px;line-height:1}
.ac-msg{padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.5}
.ac-msg.ok{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);color:var(--dsw-alias-state-success-primary)}
.ac-msg.err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent);color:var(--dsw-alias-state-error-primary)}
.ac-msg.warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent);color:var(--dsw-alias-state-warn-primary)}
.ac-confirm{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:8px;border:1px solid var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);font-size:12px;color:var(--dsw-alias-label-primary)}
.ac-hint{font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.6;margin:0}
/* 会话行上的删除图标按钮（hover 出现） */
.ac-rowbtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex:none}
.ac-rowbtn:hover{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent)}
.ac-rowbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.ac-rowbtn:disabled{opacity:.4;cursor:default}
/* 会话 “...” 菜单里的一行 */
.ac-menuitem{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1;text-align:left;padding:8px 10px;border-radius:6px;width:100%;display:flex;align-items:center;gap:8px;cursor:pointer}
.ac-menuitem:hover{background:var(--dsw-alias-state-error-primary);color:#fff}
.ac-menuitem:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.ac-menuitem:disabled{opacity:.4;cursor:default}
.ac-menuitem.danger{color:var(--dsw-alias-state-error-primary)}
.ac-menuitem.danger:hover{background:var(--dsw-alias-state-error-primary);color:#fff}
.ac-menuitem-icon{display:inline-flex;width:14px;height:14px;align-items:center;justify-content:center;flex:none}
`

    function ensureStyle() {
      if (typeof document === 'undefined') return () => {}
      let el = document.getElementById(STYLE_ID)
      if (el) return () => {}
      el = document.createElement('style')
      el.id = STYLE_ID
      el.textContent = CSS
      document.head.appendChild(el)
      return () => {
        try {
          el.remove()
        } catch {}
      }
    }

    // ── 文案 ────────────────────────────────────────────────────────────
    const ZH = {
      sectionLabel: '归档清理',
      title: '归档会话清理 🗑️',
      desc: '归档只是把会话藏起来，日志还赖在硬盘上不走 🧟 在这里给它一个体面的下场：移进回收站（还能捡回来），或者彻底删掉。只动会话日志，你的工作目录一根头发都不碰。',
      tabArchived: '已归档',
      tabTrash: '回收站',
      selectAll: '全选',
      clearSel: '取消选择',
      refresh: '刷新',
      loading: '读取中…',
      moveToTrash: '移入回收站 🧹',
      restore: '还原 💊',
      purgeSelected: '彻底删除 🔥',
      purgeAll: '清空回收站 🔥',
      confirmTrash: (n) => `把 ${n} 个会话移进回收站？放心，之后还能还原。`,
      confirmPurge: (n) => `彻底删除 ${n} 项，删了就真没了。确定？`,
      confirmPurgeAll: (n) => `清空回收站里全部 ${n} 项，删了就真没了。确定？`,
      yes: '确认',
      no: '再想想',
      emptyArchived: '这里空空如也 ✨',
      emptyArchivedHint: '去侧边栏会话菜单里点「归档」，会话就会乖乖出现在这里。',
      emptyTrash: '回收站干净得发亮 🧼',
      emptyTrashHint: '移进回收站的会话会在这儿待命，随时可以捡回来。',
      selectedN: (n) => `已选 ${n} 项`,
      noTitle: '（未命名会话）',
      missing: '日志已不在磁盘上',
      deletedAt: '删除于',
      moved: (n) => `已移入回收站：${n} 个 🧹`,
      restored: (n) => `已还原：${n} 个 💊`,
      purged: (n) => `已彻底删除：${n} 个 🔥`,
      failedN: (n) => `，失败 ${n} 个`,
      needSelection: '先选中至少一项',
      loadFailed: (e) => `读取失败：${e}`,
      opFailed: (e) => `操作失败：${e}`,
      noRegistry: '当前 profile 没有 workspace 注册表，无法列出归档会话。',
      // ── 会话行上的删除入口 ──────────────────────────────────────────
      rowDelete: '删除这个会话',
      menuDelete: '移入回收站',
      menuDeleteHint: '（可还原）',
      rowRunning: '正在运行的会话不能删除，先等它结束',
      menuRunning: '（运行中）',
      rowConfirmTitle: '把这个会话移进回收站？',
      rowConfirmBody: (name) => `「${name}」会被移到回收站，随时可以还原。只删除会话日志，工作目录不受影响。`,
      rowDone: '已移入回收站，可在 设置 → 归档清理 里还原 🧹',
      bulkAll: '全部移入回收站',
      confirmTrashAll: (n) => `把当前 ${n} 个归档会话**全部**移进回收站？之后可以一起还原。`,
      bulkDone: (n) => `已全部移入回收站：${n} 个 🧹`,
      bulkNothing: '当前没有可删除的归档会话',
    }
    const EN = {
      sectionLabel: 'Archive Cleanup',
      title: 'Archived session cleanup 🗑️',
      desc: 'Archiving only hides a session — its log keeps squatting on your disk forever 🧟 Give it a proper send-off: move it to a recoverable trash, or delete it for good. Only session logs are touched; your working directories stay untouched.',
      tabArchived: 'Archived',
      tabTrash: 'Trash',
      selectAll: 'Select all',
      clearSel: 'Clear',
      refresh: 'Refresh',
      loading: 'Loading…',
      moveToTrash: 'Move to trash 🧹',
      restore: 'Restore 💊',
      purgeSelected: 'Delete forever 🔥',
      purgeAll: 'Empty trash 🔥',
      confirmTrash: (n) => `Move ${n} session(s) to trash? You can always restore them later.`,
      confirmPurge: (n) => `Permanently delete ${n} item(s). Gone means gone. Continue?`,
      confirmPurgeAll: (n) => `Empty all ${n} item(s) from the trash. Gone means gone. Continue?`,
      yes: 'Confirm',
      no: 'Never mind',
      emptyArchived: 'Nothing here ✨',
      emptyArchivedHint: 'Archive a session from its sidebar menu and it will show up here.',
      emptyTrash: 'Trash is squeaky clean 🧼',
      emptyTrashHint: 'Sessions moved to the trash wait here until you bring them back.',
      selectedN: (n) => `${n} selected`,
      noTitle: '(untitled session)',
      missing: 'log file missing',
      deletedAt: 'deleted',
      moved: (n) => `Moved to trash: ${n} 🧹`,
      restored: (n) => `Restored: ${n} 💊`,
      purged: (n) => `Deleted forever: ${n} 🔥`,
      failedN: (n) => `, ${n} failed`,
      needSelection: 'Select at least one item first',
      loadFailed: (e) => `Load failed: ${e}`,
      opFailed: (e) => `Operation failed: ${e}`,
      noRegistry: 'This profile has no workspace registry, so archived sessions cannot be listed.',
      // ── per-row delete entry ────────────────────────────────────────
      rowDelete: 'Delete this session',
      menuDelete: 'Move to trash',
      menuDeleteHint: '(recoverable)',
      rowRunning: 'A running session cannot be deleted — wait for it to finish',
      menuRunning: '(running)',
      rowConfirmTitle: 'Move this session to the trash?',
      rowConfirmBody: (name) => `“${name}” will be moved to the trash and can be restored anytime. Only the session log is removed; working directories are untouched.`,
      rowDone: 'Moved to trash — restore it from Settings → Archive Cleanup 🧹',
      bulkAll: 'Move all to trash',
      confirmTrashAll: (n) => `Move **all ${n}** archived sessions to the trash? You can restore them together later.`,
      bulkDone: (n) => `Moved all to trash: ${n} 🧹`,
      bulkNothing: 'No archived sessions to delete right now',
    }
    let locale = 'zh'
    function t(key, ...args) {
      const dict = locale === 'en' ? EN : ZH
      const value = dict[key]
      if (typeof value === 'function') return value(...args)
      return value ?? key
    }

    // ── 数据 ────────────────────────────────────────────────────────────
    async function callApi(action, payload) {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, ...(payload || {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
      return data
    }

    function formatBytes(bytes) {
      const n = Number(bytes) || 0
      if (n < 1024) return `${n} B`
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
      if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
      return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
    }

    function formatDate(ms) {
      const n = Number(ms) || 0
      if (!n) return '—'
      try {
        return new Date(n).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })
      } catch {
        return '—'
      }
    }

    function shortCwd(cwd) {
      const s = String(cwd || '')
      if (!s) return ''
      const parts = s.split(/[\\/]+/).filter(Boolean)
      if (parts.length <= 2) return s
      return '…' + '/' + parts.slice(-2).join('/')
    }

    // ── 图标（内联 SVG，避免依赖 primitives 包）───────────────────────────
    function TrashIcon({ size = 14 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M2.5 4.5h11' }),
        h('path', { d: 'M6 4.5V3a.5.5 0 0 1 .5-.5h3A.5.5 0 0 1 10 3v1.5' }),
        h('path', { d: 'M4 4.5l.6 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L12 4.5' }),
        h('path', { d: 'M6.7 7v4M9.3 7v4' }),
      )
    }

    // ── 会话行上的删除按钮（sidebar.workspaces.session.row.action）─────────
    /**
     * ownerProps 只给 sessionId 与 displayTitle；useWorkspaces 是本 slot 的标准 prop。
     * 删除按钮对**所有**会话开放（不限归档状态）——归档是宿主的事，
     * 删除是这个插件的事，两个入口分开，用户不用先归档再删。
     */
    function SessionRowDeleteAction({ sessionId, displayTitle, useSessions, useSessionStatus }) {
      useEffect(() => ensureStyle(), [])
      // ⚠️ hook 必须无条件调用：不能用 `a || useXxx()` 这种短路写法，
      //    否则某些行少调用一个 hook，React 会直接报 "rendered fewer hooks"。
      const sessionTitle = useSessions((s) => s.byId[sessionId]?.displayTitle)
      // 正在跑的会话（含当前正打开的这个）不给删 —— 删了会拖着一堆活着的引用。
      const running = useSessionStatus((s) => s[sessionId]?.running ?? false)
      const fallbackTitle = String(sessionTitle || '').trim()
      const title = String(displayTitle || '').trim() || fallbackTitle
      const [phase, setPhase] = useState('idle') // idle | confirm | busy
      const [error, setError] = useState(null)

      // 没有任何会话可删的理由：只有「不知道是谁」才不显示
      if (!sessionId) return null

      const doDelete = async () => {
        setPhase('busy')
        setError(null)
        try {
          const data = await callApi('delete', { sessionIds: [sessionId] })
          if (Array.isArray(data.failed) && data.failed.length > 0) {
            throw new Error(data.failed[0].reason || 'failed')
          }
          setPhase('idle')
        } catch (e) {
          setError(String(e?.message ?? e))
          setPhase('idle')
        }
      }

      if (phase === 'confirm') {
        return h(
          'div',
          {
            className: 'ac-rowbtn',
            style: { width: 'auto', padding: '0 6px', background: 'transparent' },
            role: 'group',
            'aria-label': t('rowConfirmTitle'),
            title: t('rowConfirmBody', title || t('noTitle')),
          },
          h(
            'button',
            {
              type: 'button',
              className: 'ac-rowbtn',
              title: t('yes'),
              'aria-label': t('yes'),
              onClick: (e) => {
                e.stopPropagation()
                void doDelete()
              },
            },
            h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-state-error-primary)' } }, '✓'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'ac-rowbtn',
              title: t('no'),
              'aria-label': t('no'),
              onClick: (e) => {
                e.stopPropagation()
                setPhase('idle')
              },
            },
            h('span', { style: { fontSize: 11 } }, '✕'),
          ),
        )
      }

      return h(
        'button',
        {
          type: 'button',
          className: 'ac-rowbtn',
          title: running
            ? t('rowRunning')
            : error
              ? `${t('rowDelete')} — ${error}`
              : t('rowDelete'),
          'aria-label': running ? t('rowRunning') : t('rowDelete'),
          disabled: phase === 'busy' || running,
          onClick: (e) => {
            e.stopPropagation()
            e.preventDefault()
            if (running) return
            setPhase('confirm')
          },
        },
        h(TrashIcon, { size: 13 }),
      )
    }

    // ── 会话 “...” 菜单里的一行（sidebar.workspaces.session.menu.item）─────
    function SessionMenuDeleteItem({ sessionId, displayTitle, useSessions, useMenuOpenState, useSessionStatus }) {
      useEffect(() => ensureStyle(), [])
      // 菜单项同样对所有会话开放
      // useMenuOpenState() 返回 [open, setOpen] 这个 pair（宿主 ArchiveSessionMenuItem 同款用法）
      const menuState = useMenuOpenState ? useMenuOpenState() : undefined
      const setMenuOpen = Array.isArray(menuState) ? menuState[1] : undefined
      const sessionTitle = useSessions((s) => s.byId[sessionId]?.displayTitle)
      const running = useSessionStatus((s) => s[sessionId]?.running ?? false)
      const fallbackTitle = String(sessionTitle || '').trim()
      const title = String(displayTitle || '').trim() || fallbackTitle
      const [busy, setBusy] = useState(false)

      if (!sessionId) return null

      const onClick = async () => {
        setBusy(true)
        try {
          if (typeof setMenuOpen === 'function') setMenuOpen(false)
          await callApi('delete', { sessionIds: [sessionId] })
        } catch {
          /* 失败就保持菜单开着，用户能看到会话还在 */
        } finally {
          setBusy(false)
        }
      }

      return h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: 'ac-menuitem danger',
          disabled: busy || running,
          title: running ? t('rowRunning') : t('rowConfirmBody', title || t('noTitle')),
          onClick: running ? undefined : onClick,
        },
        h('span', { className: 'ac-menuitem-icon' }, h(TrashIcon, { size: 13 })),
        h('span', null, t('menuDelete')),
        h('span', { style: { fontSize: 11, opacity: 0.6 } }, running ? t('menuRunning') : t('menuDeleteHint')),
      )
    }

    // ── 主面板 ──────────────────────────────────────────────────────────
    function ArchiveCleanerPanel() {
      const [tab, setTab] = useState('archived')
      const [state, setState] = useState({ status: 'loading', archived: [], trash: [], missingRegistry: false, error: null })
      const [selected, setSelected] = useState(() => new Set())
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState(null)
      const [confirm, setConfirm] = useState(null)

      useEffect(() => ensureStyle(), [])

      const load = useCallback(async () => {
        setState((prev) => ({ ...prev, status: 'loading' }))
        try {
          const data = await callApi('list')
          setState({
            status: 'ready',
            archived: Array.isArray(data.items) ? data.items : [],
            trash: Array.isArray(data.trash) ? data.trash : [],
            missingRegistry: data.missingRegistry === true,
            error: null,
          })
        } catch (error) {
          setState({ status: 'error', archived: [], trash: [], missingRegistry: false, error: String(error?.message ?? error) })
        }
      }, [])

      useEffect(() => {
        void load()
      }, [load])

      useEffect(() => {
        setSelected(new Set())
        setConfirm(null)
      }, [tab])

      const rows = tab === 'archived' ? state.archived : state.trash
      const keyOf = (row) => (tab === 'archived' ? row.sessionId : row.entryId)

      const toggle = (key) => {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
      }
      const allSelected = rows.length > 0 && selected.size === rows.length
      const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(keyOf)))

      const run = async (fn, successText) => {
        setBusy(true)
        setNotice(null)
        try {
          const message = await fn()
          setNotice({ kind: 'ok', text: message })
          setConfirm(null)
          setSelected(new Set())
          await load()
        } catch (error) {
          setNotice({ kind: 'err', text: t('opFailed', String(error?.message ?? error)) })
        } finally {
          setBusy(false)
        }
      }

      const doMoveToTrash = () =>
        run(async () => {
          const ids = [...selected]
          const data = await callApi('delete', { sessionIds: ids })
          const failed = data.failed?.length ?? 0
          return t('moved', data.moved?.length ?? 0) + (failed ? t('failedN', failed) : '')
        })

      // 批量：一次把当前所有归档会话移入回收站（不需要逐个勾选）
      const doMoveAllToTrash = () =>
        run(async () => {
          const data = await callApi('delete', { all: true })
          const failed = data.failed?.length ?? 0
          return t('bulkDone', data.moved?.length ?? 0) + (failed ? t('failedN', failed) : '')
        })

      const doRestore = () =>
        run(async () => {
          const ids = [...selected]
          const data = await callApi('restore', { entryIds: ids })
          const failed = data.failed?.length ?? 0
          return t('restored', data.restored?.length ?? 0) + (failed ? t('failedN', failed) : '')
        })

      const doPurge = (all) =>
        run(async () => {
          const entryIds = all ? [] : [...selected]
          const data = await callApi('purge', { entryIds })
          return t('purged', data.purged?.length ?? 0)
        })

      const confirmText =
        confirm === 'trash'
          ? t('confirmTrash', selected.size)
          : confirm === 'restore'
            ? `${t('restore')} ${selected.size}?`
            : confirm === 'trashAll'
              ? t('confirmTrashAll', state.archived.length)
              : confirm === 'purge'
                ? t('confirmPurge', selected.size)
                : confirm === 'purgeAll'
                  ? t('confirmPurgeAll', state.trash.length)
                  : ''
      const confirmDanger = confirm === 'trash' || confirm === 'trashAll' || confirm === 'purge' || confirm === 'purgeAll'

      const onConfirm = () => {
        if (confirm === 'trash') void doMoveToTrash()
        else if (confirm === 'trashAll') void doMoveAllToTrash()
        else if (confirm === 'restore') void doRestore()
        else if (confirm === 'purge') void doPurge(false)
        else if (confirm === 'purgeAll') void doPurge(true)
      }

      const archivedBytes = useMemo(
        () => state.archived.reduce((sum, item) => sum + (Number(item.bytes) || 0), 0),
        [state.archived],
      )

      return h(
        'div',
        { className: 'ac-wrap' },
        h(
          'div',
          { className: 'ac-head' },
          h('h3', { className: 'ac-title' }, t('title')),
          h('p', { className: 'ac-desc' }, t('desc')),
        ),
        h(
          'div',
          { className: 'ac-bar' },
          h(
            'div',
            { className: 'ac-tabs', role: 'tablist' },
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                className: 'ac-tab',
                'aria-selected': String(tab === 'archived'),
                onClick: () => setTab('archived'),
              },
              `${t('tabArchived')} (${state.archived.length})`,
            ),
            h(
              'button',
              {
                type: 'button',
                role: 'tab',
                className: 'ac-tab',
                'aria-selected': String(tab === 'trash'),
                onClick: () => setTab('trash'),
              },
              `${t('tabTrash')} (${state.trash.length})`,
            ),
          ),
          h('span', { className: 'ac-spacer' }),
          rows.length > 0
            ? h(
                'button',
                { type: 'button', className: 'ac-btn ghost', onClick: toggleAll, disabled: busy },
                allSelected ? t('clearSel') : t('selectAll'),
              )
            : null,
          h('button', { type: 'button', className: 'ac-btn ghost', onClick: () => void load(), disabled: busy || state.status === 'loading' }, t('refresh')),
        ),
        state.status === 'error'
          ? h('div', { className: 'ac-msg err', role: 'alert' }, t('loadFailed', state.error || ''))
          : null,
        state.missingRegistry ? h('div', { className: 'ac-msg warn' }, t('noRegistry')) : null,
        notice ? h('div', { className: `ac-msg ${notice.kind}`, role: 'status' }, notice.text) : null,
        selected.size > 0 ? h('p', { className: 'ac-hint' }, t('selectedN', selected.size)) : null,
        state.status === 'loading' && rows.length === 0
          ? h('div', { className: 'ac-empty' }, h('span', { className: 'ac-empty-emoji' }, '⏳'), h('span', null, t('loading')))
          : rows.length === 0
            ? h(
                'div',
                { className: 'ac-empty' },
                h('span', { className: 'ac-empty-emoji' }, tab === 'archived' ? '🗂️' : '🗑️'),
                h('span', null, tab === 'archived' ? t('emptyArchived') : t('emptyTrash')),
                h('span', { className: 'ac-hint' }, tab === 'archived' ? t('emptyArchivedHint') : t('emptyTrashHint')),
              )
            : h(
                'div',
                { className: 'ac-list', role: 'list' },
                rows.map((row) => {
                  const key = keyOf(row)
                  const checked = selected.has(key)
                  const title = String(row.title || '').trim()
                  const when = tab === 'archived' ? row.createdAt : row.deletedAt
                  return h(
                    'label',
                    { className: 'ac-row', role: 'listitem', key },
                    h('input', {
                      className: 'ac-check',
                      type: 'checkbox',
                      checked,
                      disabled: busy,
                      onChange: () => toggle(key),
                    }),
                    h(
                      'span',
                      { className: 'ac-main' },
                      h(
                        'span',
                        { className: title ? 'ac-name' : 'ac-name empty', title: title || undefined },
                        title || t('noTitle'),
                      ),
                      h(
                        'span',
                        { className: 'ac-meta' },
                        h('span', { className: 'ac-mono' }, key),
                        row.cwd ? h('span', { title: row.cwd }, shortCwd(row.cwd)) : null,
                        h('span', null, formatDate(when)),
                        row.bytes ? h('span', null, formatBytes(row.bytes)) : null,
                      ),
                    ),
                    tab === 'archived' && row.exists === false
                      ? h('span', { className: 'ac-tag warn' }, t('missing'))
                      : null,
                  )
                }),
              ),
        confirm
          ? h(
              'div',
              {
                className: 'ac-confirm',
                role: 'alertdialog',
                style: confirmDanger ? undefined : { borderColor: 'var(--dsw-alias-brand-primary)' },
              },
              h('span', null, confirmText),
              h('span', { className: 'ac-spacer' }),
              h('button', { type: 'button', className: 'ac-btn', onClick: () => setConfirm(null), disabled: busy }, t('no')),
              h(
                'button',
                {
                  type: 'button',
                  className: confirmDanger ? 'ac-btn danger' : 'ac-btn primary',
                  onClick: onConfirm,
                  disabled: busy,
                },
                t('yes'),
              ),
            )
          : null,
        h(
          'div',
          { className: 'ac-bar' },
          tab === 'archived'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'ac-btn danger',
                  disabled: busy || selected.size === 0,
                  onClick: () => setConfirm('trash'),
                },
                t('moveToTrash'),
              )
            : h(
                'button',
                {
                  type: 'button',
                  className: 'ac-btn primary',
                  disabled: busy || selected.size === 0,
                  onClick: () => setConfirm('restore'),
                },
                t('restore'),
              ),
          tab === 'archived'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'ac-btn',
                  disabled: busy || state.archived.length === 0,
                  title: t('bulkAll'),
                  onClick: () => setConfirm('trashAll'),
                },
                `${t('bulkAll')} (${state.archived.length})`,
              )
            : null,
          tab === 'trash'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'ac-btn danger',
                  disabled: busy || selected.size === 0,
                  onClick: () => setConfirm('purge'),
                },
                t('purgeSelected'),
              )
            : null,
          tab === 'trash'
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'ac-btn danger',
                  disabled: busy || state.trash.length === 0,
                  onClick: () => setConfirm('purgeAll'),
                },
                t('purgeAll'),
              )
            : null,
          h('span', { className: 'ac-spacer' }),
          tab === 'archived' && archivedBytes > 0 ? h('span', { className: 'ac-hint' }, formatBytes(archivedBytes)) : null,
        ),
        h('p', { className: 'ac-hint' }, `$DSH_HOME/.trash/sessions`),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => ensureStyle(), 'archive-trash: style')
        ctx.inject(['locale'], (c) => {
          try {
            locale = String(c.locale.getSnapshot?.()?.active ?? 'zh')
            const off = c.locale.subscribe?.(() => {
              locale = String(c.locale.getSnapshot?.()?.active ?? 'zh')
            })
            if (typeof off === 'function') c.effect(() => off, 'archive-trash: locale')
          } catch {}
        })
        const slots = ctx.slots
        slots.inject('settings.section', () =>
          slots.register(
            {
              name: 'settings.section',
              id: 'archive-trash',
              order: 40,
              label: () => (locale === 'en' ? EN.sectionLabel : ZH.sectionLabel),
            },
            ArchiveCleanerPanel,
          ),
        )

        // 会话行尾的删除按钮（只对已归档会话出现）
        slots.inject('sidebar.workspaces.session.row.action', () =>
          slots.register(
            { name: 'sidebar.workspaces.session.row.action', id: 'archive-trash-delete', order: 150 },
            SessionRowDeleteAction,
          ),
        )

        // “...” 菜单里的一行（只对已归档会话出现）
        slots.inject('sidebar.workspaces.session.menu.item', () =>
          slots.register(
            { name: 'sidebar.workspaces.session.menu.item', id: 'archive-trash-menu-delete', order: 410 },
            SessionMenuDeleteItem,
          ),
        )
      },
    }
  },
})
