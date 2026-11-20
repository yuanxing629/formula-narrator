import { useMemo, useState } from 'react'
import FormulaView from './components/FormulaView'
import NarrationPanel from './components/NarrationPanel'
import Breadcrumb from './components/Breadcrumb'
import StructureList from './components/StructureList'
import { defaultPreset, findPreset, presets } from './data/presets'
import { narrate } from './lib/narrate'
import { parse } from './lib/parser'
import { diffFormulae } from './lib/diff'
import { breadcrumbOf, buildIndex, parseSideId, resolveSelected, sideLabel, type AddrEntry } from './lib/address'

function initialLatex(): string {
  const f = new URLSearchParams(window.location.search).get('f')
  return f && f.trim() ? f : defaultPreset.latex
}

function syncUrl(latex: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('f', latex)
  window.history.replaceState(null, '', url)
}

export default function App() {
  const [latex, setLatex] = useState(initialLatex)
  // 选中状态不持久化：刷新后回到根节点（展开记忆是 M3）
  const [selectedId, setSelectedId] = useState('0')
  const [liveMsg, setLiveMsg] = useState('')
  // 钉住对比：基准公式快照（null = 未钉住）；差异卡随输入框改动自动更新
  const [pinned, setPinned] = useState<string | null>(null)
  const preset = findPreset(latex)
  const parsed = useMemo(() => parse(latex), [latex])
  const index = useMemo(
    () => (parsed.ok ? buildIndex(parsed.node) : new Map<string, AddrEntry>()),
    [parsed],
  )
  const unknownCount = parsed.ok ? parsed.unknown.length : 0

  const selectedNode = parsed.ok ? resolveSelected(parsed.node, selectedId) : undefined
  const crumbs = parsed.ok ? breadcrumbOf(index, selectedId) : []
  const path = crumbs.map((c) => c.label).join(' › ')
  const rootDetail = useMemo(() => (parsed.ok ? narrate(parsed.node, 2) : undefined), [parsed])

  const diffText = useMemo(() => {
    if (pinned === null) return ''
    const base = parse(pinned)
    if (!base.ok) return ''
    if (!parsed.ok) return '当前公式无法解析，差异暂不可用。'
    return diffFormulae(base.node, parsed.node)
  }, [pinned, parsed])

  const update = (tex: string) => {
    setLatex(tex)
    setSelectedId('0')
    syncUrl(tex)
  }

  const select = (id: string) => {
    setSelectedId(id)
    const side = parseSideId(id)
    const label = side ? sideLabel(side.side) : index.get(id)?.label ?? '整式'
    setLiveMsg(`已选中：${label}`)
  }

  return (
    <main>
      <header className="hero">
        <h1>
          公式旁白 <span className="en-name">Formula Narrator</span>
        </h1>
        <p className="tagline">
          给视障学生的公式分层朗读器——先听骨架，再听细节。
        </p>
        <details className="about-details">
          <summary>这是什么？</summary>
          <ul>
            <li>屏幕阅读器读公式是一次性念完的一长串：听完记不住，想回听某一项只能从头再来。</li>
            <li>公式旁白把公式拆成结构：先给骨架，再按你点的那一部分展开细节；两条式子还能对比差在哪。</li>
            <li>支持分式、根号、上下标、求和/积分、矩阵、分段六类结构。带参命令读作「未支持的符号」——宁可不读，也不读错。</li>
            <li>不登录、不上传、不请求第三方服务；语音不可用时三层文本照常可读。</li>
            <li>明眼人也能用：核对一段推导里你漏看了哪一项。</li>
          </ul>
        </details>
      </header>

      <div className="layout">
        <section className="panel render-panel" aria-label="渲染区">
          <h2>渲染区</h2>
          <FormulaView
            tree={parsed.ok ? parsed.node : undefined}
            rawLatex={parsed.ok ? undefined : latex}
            selectedId={selectedId}
            index={index}
            onSelect={select}
          />
          <p className="guide-line muted">
            点公式里的任意部分，只听那一部分；按 Tab 可以走「按结构点名」。
          </p>
          <Breadcrumb crumbs={crumbs} onSelect={select} />
          <div className="pin-row" role="group" aria-label="钉住对比">
            <button
              type="button"
              aria-pressed={pinned !== null}
              disabled={pinned === null && !parsed.ok}
              onClick={() => setPinned(pinned === null ? latex : null)}
            >
              {pinned === null ? '钉住对比' : '对比中 · 清除'}
            </button>
            <span className="muted">
              {pinned === null
                ? '把当前公式记为基准，再改输入框，自动说出差异。'
                : '已钉住基准；继续改输入框或换示例，差异会自动更新。'}
            </span>
          </div>
          <p className="diff-card" aria-live="polite">
            {diffText}
          </p>
        </section>

        <NarrationPanel
          path={path || preset?.name || '自定义公式'}
          node={selectedNode}
          rootDetail={rootDetail}
          isRoot={selectedId === '0'}
          error={parsed.ok ? undefined : parsed.error}
        />

        <StructureList index={index} selectedId={selectedId} onSelect={select} />

        <section className="panel input-panel" aria-label="公式输入">
          <h2>公式输入</h2>
          <div className="preset-row" role="group" aria-label="示例公式">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={preset?.id === p.id ? 'preset active' : 'preset'}
                aria-pressed={preset?.id === p.id}
                onClick={() => update(p.latex)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <details className="paste-details">
            <summary>粘贴自己的 LaTeX</summary>
            <label htmlFor="latex-input">LaTeX（可粘贴）</label>
            <textarea
              id="latex-input"
              rows={3}
              value={latex}
              spellCheck={false}
              onChange={(e) => update(e.target.value)}
            />
          </details>
        </section>
      </div>

      <footer className="muted">
        纯前端静态页面 · 不请求任何第三方服务 · 语音不可用时文本完整可读
      </footer>

      {unknownCount > 0 && (
        <p className="corner-note" role="status">
          有 {unknownCount} 个符号未能朗读
        </p>
      )}

      <div className="sr-only" aria-live="polite">
        {liveMsg}
      </div>
    </main>
  )
}