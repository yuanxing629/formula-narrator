import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

interface Props {
  latex: string
}

export default function FormulaView({ latex }: Props) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        output: 'html',
      })
    } catch {
      return ''
    }
  }, [latex])

  if (!html) {
    return <p role="alert">公式渲染失败，请检查 LaTeX 是否完整。</p>
  }

  return (
    <div
      className="formula-view"
      aria-label="公式渲染区"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}