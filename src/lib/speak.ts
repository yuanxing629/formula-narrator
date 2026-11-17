/** Web Speech API 封装：失败一律静默降级，绝不抛错 */

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function pickZhVoice(): SpeechSynthesisVoice | undefined {
  try {
    const voices = window.speechSynthesis.getVoices()
    return (
      voices.find((v) => v.lang === 'zh-CN') ??
      voices.find((v) => v.lang.startsWith('zh'))
    )
  } catch {
    return undefined
  }
}

/** 朗读一段文本；返回是否成功发起朗读 */
export function speak(text: string): boolean {
  if (!speechAvailable() || !text) return false
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    const voice = pickZhVoice()
    if (voice) utter.voice = voice
    utter.onerror = () => {}
    window.speechSynthesis.speak(utter)
    return true
  } catch {
    return false
  }
}

export function stopSpeak(): void {
  if (!speechAvailable()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* 静默降级 */
  }
}