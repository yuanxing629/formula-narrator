import { useState } from 'react'
import type { Preset } from '../data/presets'
import { speak, speechAvailable } from '../lib/speak'

interface Props {
  preset: Preset | undefined
}

const layers = [
  { key: 'skeleton', label: '骨架', hint: '先听结构：这是什么式子，由哪几块组成' },
  { key: 'local', label: '局部', hint: '再听关键部分：每一块里有什么' },
  { key: 'detail', label: '细节', hint: '最后逐字听完整表达式' },
] as const

export default function NarrationPanel({ preset }: Props) {
  const [notice, setNotice] = useState('')

  if (!preset) {
    return (
      <section className="panel" aria-label="朗读区">
        <h2>朗读区</h2>
        <p className="muted">
          当前版本（M0）仅支持上方 3 条示例公式的分层讲解。请选择一条示例，或粘贴与示例一致的 LaTeX。
        </p>
      </section>
    )
  }

  const handleSpeak = (text: string) => {
    const ok = speak(text)
    setNotice(ok ? '' : '语音不可用，请直接阅读下方文本。')
  }

  return (
    <section className="panel" aria-label="朗读区">
      <h2>朗读区 · {preset.name}</h2>
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
            <button type="button" onClick={() => handleSpeak(preset[key])}>
              播放{label}
            </button>
          </div>
          <p className="layer-text">{preset[key]}</p>
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