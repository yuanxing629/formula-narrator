import { useState } from 'react'
import type { Layers } from '../lib/narrate'
import { speak, speechAvailable } from '../lib/speak'

interface Props {
  title: string
  layers?: Layers
  error?: string
}

const layers = [
  { key: 'skeleton', label: '骨架', hint: '先听结构：这是什么式子，由哪几块组成' },
  { key: 'local', label: '局部', hint: '再听关键部分：每一块里有什么' },
  { key: 'detail', label: '细节', hint: '最后逐字听完整表达式' },
] as const

export default function NarrationPanel({ title, layers: text, error }: Props) {
  const [notice, setNotice] = useState('')

  if (error || !text) {
    return (
      <section className="panel" aria-label="朗读区">
        <h2>朗读区</h2>
        <p role="alert">{error ?? '暂无可朗读的内容。'}</p>
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

  return (
    <section className="panel" aria-label="朗读区">
      <h2>朗读区 · {title}</h2>
      {!speechAvailable() && (
        <p className="muted" role="status">
          此浏览器不支持语音，三层文本仍可正常阅读。
        </p>
      )}
      {layers.map(({ key, label, hint }) => (
        <div className="layer" key={key}>
          <div className="layer-head">
            <h3>{label}</h3>
            <span className="muted">{hint}</span>
            <button type="button" onClick={() => handleSpeak(text[key])}>
              播放{label}
            </button>
          </div>
          <p className="layer-text">{text[key]}</p>
        </div>
      ))}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}
    </section>
  )
}