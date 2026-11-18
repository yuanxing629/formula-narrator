import { useEffect, useMemo, useRef, type SyntheticEvent } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { RowNode } from '../lib/parser'
import { toWrappedLatex } from '../lib/renderTex'
import { parseSideId, sideChildIds, type AddrEntry } from '../lib/address'

interface Props {
  tree?: RowNode
  selectedId: string
  index: Map<string, AddrEntry>
  onSelect: (id: string) => void
}

// rules.md 渲染映射：trust 只放行 htmlData、strict ignore、output htmlAndMathml、值不加引号
const KATEX_OPTS: katex.KatexOptions = {
  displayMode: true,
  trust: (ctx) => ctx.command === '\\htmlData',
  strict: 'ignore',
  output: 'htmlAndMathml',
  throwOnError: false,
}

export default function FormulaView({ tree, selectedId, index, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const html = useMemo(() => {
    if (!tree) return ''
    try {
      return katex.renderToString(toWrappedLatex(tree), KATEX_OPTS)
    } catch {
      return ''
    }
  }, [tree])

  // 可点结构 tabindex=0 + role/aria-label；交互走 HTML 侧，MathML 侧对读屏隐藏避免重复播报
  useEffect(() => {
    const el = ref.current
    if (!el || !html) return
    el.querySelector('.katex-html')?.removeAttribute('aria-hidden')
    el.querySelector('.katex-mathml')?.setAttribute('aria-hidden', 'true')
    el.querySelectorAll<HTMLElement>('.katex-html [data-node]').forEach((span) => {
      const id = span.dataset.node ?? ''
      const entry = index.get(id)
      if (!entry) return
      span.tabIndex = 0
      span.setAttribute('role', 'button')
      span.setAttribute('aria-label', entry.label)
    })
  }, [html, index])

  // 命中宽度不足 24px 的叶子小目标加 fn-tiny，由 ::after 外扩热区；不改 padding，保证插桩渲染与原始渲染排版一致。
  // 祖先若也加 ::after，会作为末尾子盒盖住后代小目标的命中，故只标无 [data-node] 后代的叶子节点（A3）。
  useEffect(() => {
    const el = ref.current
    if (!el || !html) return
    const mark = () => {
      el.querySelectorAll<HTMLElement>('.katex-html [data-node]').forEach((span) => {
        const tiny = span.getBoundingClientRect().width < 24 && !span.querySelector('[data-node]')
        span.classList.toggle('fn-tiny', tiny)
      })
    }
    mark()
    document.fonts?.ready.then(mark).catch(() => {})
    window.addEventListener('resize', mark)
    return () => window.removeEventListener('resize', mark)
  }, [html])

  // 高亮：先清上一轮，再涂当前节点（实心）与祖先链（虚线），不允许残留
  useEffect(() => {
    const el = ref.current
    if (!el || !html) return
    el.querySelectorAll('.fn-selected, .fn-ancestor').forEach((span) => {
      span.classList.remove('fn-selected', 'fn-ancestor')
    })
    const paint = (id: string, cls: string) => {
      el.querySelectorAll(`.katex-html [data-node="${id}"]`).forEach((span) => span.classList.add(cls))
    }
    const side = parseSideId(selectedId)
    if (side) {
      for (const id of sideChildIds(index, selectedId)) paint(id, 'fn-selected')
    } else {
      paint(selectedId, 'fn-selected')
    }
    let cur = side ? side.parentId : index.get(selectedId)?.parentId
    while (cur) {
      paint(cur, 'fn-ancestor')
      cur = index.get(cur)?.parentId
    }
  }, [selectedId, html, index])

  if (!tree || !html) {
    return <p role="alert">公式渲染失败，请检查 LaTeX 是否完整。</p>
  }

  const idFromEvent = (e: SyntheticEvent): string | undefined => {
    const target = e.target as Element
    const span = target.closest?.('[data-node]')
    return span?.getAttribute('data-node') ?? undefined
  }

  return (
    <div
      ref={ref}
      className="formula-view"
      aria-label="公式渲染区，点选任意结构可定位朗读"
      onClick={(e) => {
        const id = idFromEvent(e)
        if (id) onSelect(id)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        const id = idFromEvent(e)
        if (id) {
          e.preventDefault()
          onSelect(id)
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}