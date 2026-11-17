import { useState } from 'react'
import FormulaView from './components/FormulaView'
import NarrationPanel from './components/NarrationPanel'
import { defaultPreset, findPreset, presets } from './data/presets'

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
  const preset = findPreset(latex)

  const update = (tex: string) => {
    setLatex(tex)
    syncUrl(tex)
  }

  return (
    <main>
      <header className="hero">
        <h1>公式旁白</h1>
        <p className="tagline">
          给每个数学公式配一位会分层讲解的旁白：先听懂骨架，再按需展开细节。
        </p>
        <ol className="guide" aria-label="30 秒看懂">
          <li>看渲染区：公式长什么样，一眼有数。</li>
          <li>听朗读区：骨架 → 局部 → 细节，同一公式三种粒度，按需播放。</li>
          <li>换示例或粘贴 LaTeX：状态自动存进网址，可直接分享链接。</li>
        </ol>
      </header>

      <section className="panel" aria-label="公式输入">
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
        <label htmlFor="latex-input">LaTeX（可粘贴）</label>
        <textarea
          id="latex-input"
          rows={3}
          value={latex}
          spellCheck={false}
          onChange={(e) => update(e.target.value)}
        />
      </section>

      <section className="panel" aria-label="渲染区">
        <h2>渲染区</h2>
        <FormulaView latex={latex} />
      </section>

      <NarrationPanel preset={preset} />

      <footer className="muted">
        纯前端静态页面 · 不请求任何第三方服务 · 语音不可用时文本完整可读
      </footer>
    </main>
  )
}