// 渲染映射（rules.md 第八节）：AST → \htmlData{node=id}{…} 包裹的 LaTeX → KaTeX。
// 值不加引号；trust/strict/output 选项在 FormulaView 中按该节照抄。

import type { Node, RowNode } from './parser'

function ser(n: Node): string {
  switch (n.kind) {
    case 'atom':
      return n.value.startsWith('\\') ? n.value + ' ' : n.value
    case 'row':
      return n.children.map(wrap).join(' ')
    case 'group':
      return `{${wrap(n.child)}}`
    case 'frac':
      return `\\frac{${wrap(n.num)}}{${wrap(n.den)}}`
    case 'sqrt':
      return `\\sqrt${n.index ? `[${wrap(n.index)}]` : ''}{${wrap(n.body)}}`
    case 'scripts': {
      const base = n.base.kind === 'atom' ? ser(n.base) : `{${wrap(n.base)}}`
      return `${base}${n.sup ? `^{${wrap(n.sup)}}` : ''}${n.sub ? `_{${wrap(n.sub)}}` : ''}`
    }
    case 'bigop': {
      const op = { sum: '\\sum', int: '\\int', prod: '\\prod', lim: '\\lim' }[n.op]
      return `${op}${n.lower ? `_{${wrap(n.lower)}}` : ''}${n.upper ? `^{${wrap(n.upper)}}` : ''} ${wrap(n.body)}`
    }
    case 'matrix': {
      const rows = n.rows.map((r) => r.map(wrap).join(' & '))
      return `\\begin{${n.env}}${rows.join(' \\\\ ')}\\end{${n.env}}`
    }
    case 'cases': {
      const rows = n.rows.map((r) => (r.cond ? `${wrap(r.value)} & ${wrap(r.cond)}` : wrap(r.value)))
      return `\\begin{cases}${rows.join(' \\\\ ')}\\end{cases}`
    }
  }
}

/** 原子不包裹（点选落在最近的结构/行节点上）；其余节点各包一层 htmlData */
function wrap(n: Node): string {
  if (n.kind === 'atom') return ser(n)
  return `\\htmlData{node=${n.id}}{${ser(n)}}`
}

export function toWrappedLatex(root: RowNode): string {
  return wrap(root)
}