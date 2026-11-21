import { useEffect, useRef, useState } from 'react'
import { loadIndex, loadQuestions } from '../lib/data'
import * as db from '../lib/db'
import { useDB, useToast, Toast } from '../ui'
import {
  applyUpdate,
  checkForUpdate,
  fetchAppUpdate,
  isNewerVersion,
  isRemote,
  APP_VERSION,
  type AppUpdateInfo,
  type UpdateState,
  type VersionInfo,
} from '../lib/content'

export function SettingsScreen() {
  useDB()
  const s = db.settings()
  const [msg, setMsg] = useToast()
  const [importText, setImportText] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [stats, setStats] = useState<{ papers: number; questions: number } | null>(null)
  const [upd, setUpd] = useState<UpdateState>({ kind: 'idle' })
  const [ver, setVer] = useState(db.contentVersion() ?? '')
  const [appUpd, setAppUpd] = useState<AppUpdateInfo | 'checking' | 'latest' | null>(null)

  useEffect(() => {
    void (async () => {
      const v = await fetch('/data/version.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
      setVer(db.contentVersion() ?? (v?.version ?? ''))
    })()
  }, [])

  async function doCheck() {
    setUpd({ kind: 'checking' })
    setUpd(await checkForUpdate())
  }

  async function doApply(remote: VersionInfo) {
    setUpd({ kind: 'downloading', done: 0, total: 0 })
    try {
      await applyUpdate(remote, (done, total) => setUpd({ kind: 'downloading', done, total }))
      setUpd({ kind: 'done', v: remote.version })
    } catch (e) {
      setUpd({ kind: 'error', msg: (e as Error).message || '下载失败' })
    }
  }
  const loaded = useRef(false)
  if (!loaded.current) {
    loaded.current = true
    void Promise.all([loadIndex(), loadQuestions()]).then(([i, q]) => setStats({ papers: i.length, questions: q.length }))
  }

  return (
    <div className="app">
      <div className="pageHead">
        <div>
          <h1>我的</h1>
          <div className="sub">所有数据都存在这台设备上</div>
        </div>
      </div>

      <div className="card">
        <div className="settingRow">
          <div>
            <div className="k">中考日期</div>
            <div className="hint">用来算首页倒计时</div>
          </div>
          <div>
            <input type="date" value={s.examDate} onChange={(e) => db.updateSettings({ examDate: e.target.value })} />
          </div>
        </div>
        <div className="settingRow">
          <div>
            <div className="k">每日目标</div>
            <div className="hint">打算每天练几道</div>
          </div>
          <div>
            <input
              type="number"
              min={5}
              max={200}
              value={s.dailyGoal}
              onChange={(e) => db.updateSettings({ dailyGoal: Math.max(1, Number(e.target.value) || 20) })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">数据备份</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.75 }}>
          换手机或清缓存前，先把这份记录复制保存一份（做题记录、错题、模考成绩都在里面）。
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            className="btn"
            style={{ flex: 1 }}
            onClick={async () => {
              const text = db.exportJSON()
              try {
                await navigator.clipboard.writeText(text)
                setMsg('已复制到剪贴板')
              } catch {
                setImportText(text)
                setMsg('已放到下面的输入框，手动复制')
              }
            }}
          >
            导出并复制
          </button>
          <button
            className="btn"
            style={{ flex: 1 }}
            onClick={() => {
              const blob = new Blob([db.exportJSON()], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `中考做题记录-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          >
            下载文件
          </button>
        </div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="把备份内容粘贴到这里，然后点「导入」"
          style={{
            width: '100%',
            marginTop: 10,
            minHeight: 72,
            borderRadius: 10,
            border: '1px solid var(--line)',
            padding: 10,
            fontFamily: 'inherit',
            fontSize: 12,
            resize: 'vertical',
          }}
        />
        <button
          className="btn wide"
          style={{ marginTop: 8 }}
          disabled={!importText.trim()}
          onClick={() => {
            if (db.importJSON(importText)) {
              setMsg('导入成功')
              setImportText('')
            } else setMsg('格式不对，导入失败')
          }}
        >
          导入
        </button>
      </div>

      <div className="card">
        <div className="cardTitle">内容更新</div>
        <div className="settingRow">
          <div>
            <div className="k">当前内容版本</div>
            <div className="hint">{isRemote() ? '来自远程内容源' : '跟随 App 一起发布'}</div>
          </div>
          <div style={{ textAlign: 'right', width: 'auto', fontVariantNumeric: 'tabular-nums' }}>{ver || '初始版'}</div>
        </div>
        <div className="settingRow">
          <div>
            <div className="k">自动检查</div>
            <div className="hint">每次打开时看有没有新卷子</div>
          </div>
          <div>
            <button
              className={'switch' + (s.autoUpdate ? ' on' : '')}
              onClick={() => db.updateSettings({ autoUpdate: !s.autoUpdate })}
              aria-label="自动检查更新"
            >
              <i />
            </button>
          </div>
        </div>
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 6 }}>内容源地址（留空 = 用本机自带的题库）</div>
          <input
            className="textInput"
            placeholder={typeof location !== 'undefined' ? location.origin + '/content/' : ''}
            defaultValue={s.contentBase}
            onBlur={(e) => {
              db.updateSettings({ contentBase: e.target.value.trim() })
              setMsg('内容源已保存，下次打开生效')
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={doCheck} disabled={upd.kind === 'checking' || upd.kind === 'downloading'}>
            {upd.kind === 'checking' ? '检查中…' : '检查更新'}
          </button>
          {upd.kind === 'available' && (
            <button className="btn primary" style={{ flex: 1 }} onClick={() => doApply(upd.remote)}>
              更新到 {upd.remote.version}
            </button>
          )}
        </div>
        {upd.kind === 'latest' && <div className="tiny muted" style={{ marginTop: 8 }}>已是最新（{upd.v}）</div>}
        {upd.kind === 'downloading' && (
          <div className="tiny muted" style={{ marginTop: 8 }}>
            正在下载内容 {upd.done}/{upd.total || '…'}，下完会自动刷新
          </div>
        )}
        {upd.kind === 'available' && (
          <div className="tiny muted" style={{ marginTop: 8 }}>
            发现新版本 {upd.remote.version}
            {upd.remote.papers ? ` · ${upd.remote.papers} 套卷` : ''}
            {upd.remote.questions ? ` / ${upd.remote.questions} 道题` : ''}
            {upd.remote.notes ? ` · ${upd.remote.notes}` : ''}
          </div>
        )}
        {upd.kind === 'error' && <div className="tiny" style={{ marginTop: 8, color: 'var(--bad)' }}>{upd.msg}</div>}
        <div className="tiny muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
          内容源可以是任何静态地址（把 content 文件夹传上去即可）。地址留空时，「检查更新」会检查本机题库是否有新版。
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">App 更新</div>
        <div className="settingRow">
          <div>
            <div className="k">当前版本</div>
            <div className="hint">安装到手机 / 桌面的这个 App</div>
          </div>
          <div style={{ textAlign: 'right', width: 'auto', fontVariantNumeric: 'tabular-nums' }}>v{APP_VERSION}</div>
        </div>
        <button
          className="btn wide"
          style={{ marginTop: 12 }}
          disabled={appUpd === 'checking'}
          onClick={async () => {
            setAppUpd('checking')
            const r = await fetchAppUpdate()
            if (r && isNewerVersion(r.version, APP_VERSION)) setAppUpd(r)
            else setAppUpd(r ? 'latest' : null)
            if (!r) setMsg('连不上更新服务器')
          }}
        >
          {appUpd === 'checking' ? '检查中…' : '检查 App 更新'}
        </button>
        {appUpd === 'latest' && (
          <div className="tiny muted" style={{ marginTop: 8 }}>
            已是最新版（v{APP_VERSION}）
          </div>
        )}
        {appUpd && typeof appUpd === 'object' && (
          <div className="tiny" style={{ marginTop: 8, lineHeight: 1.7 }}>
            发现新版本 <b>v{appUpd.version}</b>
            {appUpd.notes ? ` · ${appUpd.notes}` : ''}
            <br />
            <button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => window.open(appUpd.url, '_blank', 'noopener')}>
              去更新
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="cardTitle">题库</div>
        <div className="settingRow">
          <div className="k">收录试卷</div>
          <div style={{ textAlign: 'right', width: 'auto' }}>{stats ? `${stats.papers} 套` : '…'}</div>
        </div>
        <div className="settingRow">
          <div className="k">题目总数</div>
          <div style={{ textAlign: 'right', width: 'auto' }}>{stats ? `${stats.questions} 道` : '…'}</div>
        </div>
        <div className="settingRow">
          <div className="k">来源</div>
          <div style={{ textAlign: 'right', width: 'auto', fontSize: 12.5, color: 'var(--muted)' }}>广州中考真题 2017–2026</div>
        </div>
      </div>

      <div className="card">
        <div className="cardTitle">清空</div>
        {!confirmReset ? (
          <button className="btn wide danger" onClick={() => setConfirmReset(true)}>
            清空全部做题记录
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setConfirmReset(false)}>
              我再想想
            </button>
            <button
              className="btn danger"
              style={{ flex: 1, borderColor: '#f3c7c7' }}
              onClick={() => {
                db.resetAll()
                setConfirmReset(false)
                setMsg('已清空')
              }}
            >
              确认清空
            </button>
          </div>
        )}
      </div>

      <div className="empty" style={{ paddingTop: 8, fontSize: 12 }}>
        真题训练台 · v{APP_VERSION}
        <br />
        离线可用 · 不需要注册 · 数据不上传
      </div>
      <Toast text={msg} />
    </div>
  )
}
