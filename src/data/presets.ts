import { narrateLayers } from '../lib/narrate'
import { parse } from '../lib/parser'

export interface Preset {
  id: string
  name: string
  latex: string
  /** 同一公式的三种粒度：骨架 → 局部 → 细节（M1 起由解析器 + 模板生成） */
  skeleton: string
  local: string
  detail: string
}

const raw = [
  {
    id: 'quadratic',
    name: '一元二次方程求根公式',
    latex: 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}',
  },
  {
    id: 'sum-squares',
    name: '平方和求和公式',
    latex: '\\sum_{i=1}^{n}i^{2}=\\frac{n(n+1)(2n+1)}{6}',
  },
  {
    id: 'piecewise',
    name: '分段函数',
    latex: 'f(x)=\\begin{cases}x^{2}, & x\\geq 0\\\\ -x, & x<0\\end{cases}',
  },
  {
    id: 'matrix',
    name: '二阶矩阵',
    latex: 'A=\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}',
  },
  {
    id: 'integral',
    name: '定积分',
    latex: '\\int_{0}^{1}2x\\,dx=1',
  },
  {
    id: 'cube-root',
    name: '三次根式',
    latex: 'c=\\sqrt[3]{a^{3}+b^{3}}',
  },
]

export const presets: Preset[] = raw.map((r) => {
  const p = parse(r.latex)
  if (!p.ok) throw new Error(`示例公式解析失败：${r.id} ${p.error}`)
  return { ...r, ...narrateLayers(p.node) }
})

export const defaultPreset = presets[0]

/** 去掉空白后比较，容忍粘贴时的空格差异 */
export function normalizeLatex(tex: string): string {
  return tex.replace(/\s+/g, '')
}

export function findPreset(tex: string): Preset | undefined {
  const n = normalizeLatex(tex)
  return presets.find((p) => normalizeLatex(p.latex) === n)
}