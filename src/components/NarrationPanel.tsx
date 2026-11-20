import { useEffect, useMemo, useRef, useState } from 'react'
import { narrateLayers } from '../lib/narrate'
import type { Node } from '../lib/parser'
import { speak, speechAvailable } from '../lib/speak'

interface Props {
  /** 面包屑路径文本，如「等式 › 右边 › 分式 › 分子」 */
  path: string
  node?: Node
  rootDetail?: string
  isRoot: boolean
  error?: string
}

const layers = [
  { key: 'skeleton', num: '①', label: '骨架', hint: '先听结构：这是什么式子，由哪几块组成' },
  { key: 'local', num: '②', label: '局部', hint: '再听关键部分：每一块里有什么' },
  { key: 'detail', num: '③', label: '细节', hint: '最后逐字听完整表达式' },
] as const

type LayerKey = (typeof layers)[number]['key']

export default function NarrationPanel({ path, node, rootDetail, isRoot, error }: Props) {
  const [notice, setNotice] = useState('')
  const [playing, setPlaying] = useState<LayerKey | ''>('')
  const copyRef = useRef<HTMLTextAreaElement>(null)
  const scriptRef = useRef<HTMLDetailsElement>(null)
  const text = useMemo(() => (node ? narrateLayers(node) : undefined), [node])
  // 换节点后清除上一层的播放高亮
  useEffect(() => setPlaying(''), [node])

  if (error || !text || !node) {
    return (
      <section className="panel narr-panel" aria-label="朗读区">
        <h2>朗读区</h2>
        {error ? (
          <>
            <p role="alert">该公式含暂不支持的结构，可查看但不能朗读。</p>
            <p className="muted">原因：{error}</p>
          </>
        ) : (
          <p role="alert">暂无可朗读的内容。</p>
        )}
        <p className="muted">
          支持的结构：分式、根号、上下标、求和/积分（含上下限）、矩阵、分段函数。
        </p>
      </section>
    )
  }

  const handleSpeak = (t: string) => {
    const ok = speak(t)
    setNotice(ok ? '' : '语音不可用，请直接阅读下方文本。')
  }

  const playLayer = (key: LayerKey) => {
    const ok = speak(text[key])
    if (ok) setPlaying(key)
    setNotice(ok ? '' : '语音不可用，请直接阅读下方文本。')
  }

  const script = `骨架：${text.skeleton}\n局部：${text.local}\n细节：${text.detail}`

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(script)
      setNotice('朗读稿已复制。')
    } catch {
      // 回退路径需要 textarea 可见：折叠态先展开
      if (scriptRef.current) scriptRef.current.open = true
      const ta = copyRef.current
      if (ta) {
        ta.focus()
        ta.select()
        try {
          document.execCommand('copy')
          setNotice('朗读稿已复制。')
        } catch {
          setNotice('复制失败，请手动全选文本复制。')
        }
      }
    }
  }

  return (
    <section className="panel narr-panel" aria-label="朗读区">
      <h2>朗读区 · {path}</h2>
      {!speechAvailable() && (
        <p className="muted" role="status">
          此浏览器不支持语音，三层文本仍可正常阅读。
        </p>
      )}
      <div className="node-actions" role="group" aria-label="朗读动作">
        <button type="button" className="primary" onClick={() => handleSpeak(text.detail)}>
          读这个节点
        </button>
        <button
          type="button"
          onClick={() => rootDetail && handleSpeak(rootDetail)}
          disabled={isRoot || !rootDetail}
          title={isRoot ? '当前已在整式根节点' : '从头朗读整个公式'}
        >
          从头读
        </button>
      </div>
      {layers.map(({ key, num, label, hint }) => (
        <div className={`layer layer-${key}${playing === key ? ' playing' : ''}`} key={key}>
          <div className="layer-head">
            <h3>
              {num} {label}
            </h3>
            <span className="muted">{hint}</span>
            <button type="button" onClick={() => playLayer(key)}>
              播放{label}
            </button>
          </div>
          <p className="layer-text">{text[key]}</p>
        </div>
      ))}
      <details className="layer script-details" ref={scriptRef}>
        <summary>
          <h3>朗读稿</h3>
          <span className="muted">纯文本，可复制带走</span>
        </summary>
        <div className="script-body">
          <button type="button" onClick={copyScript}>
            复制朗读稿
          </button>
          <textarea ref={copyRef} className="script-area" readOnly rows={4} value={script} aria-label="朗读稿纯文本" />
        </div>
      </details>
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
    </section>
  )
}