export interface Preset {
  id: string
  name: string
  latex: string
  /** 同一公式的三种粒度：骨架 → 局部 → 细节 */
  skeleton: string
  local: string
  detail: string
}

// M0 阶段规则硬编码，仅覆盖 3 条示例公式；M1 起由解析器生成
export const presets: Preset[] = [
  {
    id: 'quadratic',
    name: '一元二次方程求根公式',
    latex: 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}',
    skeleton:
      '这是一个等式：左边是 x，右边是一个分式。分式的分子里含有一个根号。',
    local:
      '分母是 2a。分子是「负 b，加上或减去，根号下 b 的平方减 4ac」两部分。根号内的 b 平方减 4ac 就是判别式。',
    detail:
      'x 等于，分式：分子为 负 b 加减 根号下（b 的平方 减 4 乘以 a 乘以 c），分母为 2 乘以 a。其中加减号表示两个根：取加号得第一个根，取减号得第二个根。',
  },
  {
    id: 'sum-squares',
    name: '平方和求和公式',
    latex: '\\sum_{i=1}^{n}i^{2}=\\frac{n(n+1)(2n+1)}{6}',
    skeleton:
      '这是一个等式：左边是一个带上下限的求和，右边是一个分式。',
    local:
      '求和的下限是 i 等于 1，上限是 n，求和的每一项是 i 的平方。右边的分式分母是 6，分子是三个因式相乘：n、n 加 1、2n 加 1。',
    detail:
      '对 i 从 1 到 n 求和，每一项为 i 的平方，结果等于分式：分子为 n 乘以（n 加 1）乘以（2n 加 1），分母为 6。也就是说，前 n 个正整数的平方和可以直接用这个分式算出。',
  },
  {
    id: 'piecewise',
    name: '分段函数',
    latex: 'f(x)=\\begin{cases}x^{2}, & x\\geq 0\\\\ -x, & x<0\\end{cases}',
    skeleton:
      '这是一个分段函数：f of x 等于一个大括号分成的两种情况，每种情况各带一个适用条件。',
    local:
      '第一种情况：当 x 大于等于 0 时，取 x 的平方。第二种情况：当 x 小于 0 时，取 负 x。',
    detail:
      'f（x）等于分段表达式：第一行，x 的平方，适用条件为 x 大于等于 0；第二行，负 x，适用条件为 x 小于 0。两段在 x 等于 0 处都取值 0，函数连续。',
  },
]

export const defaultPreset = presets[0]

/** 去掉空白后比较，容忍粘贴时的空格差异 */
export function normalizeLatex(tex: string): string {
  return tex.replace(/\s+/g, '')
}

export function findPreset(tex: string): Preset | undefined {
  const n = normalizeLatex(tex)
  return presets.find((p) => normalizeLatex(p.latex) === n)
}