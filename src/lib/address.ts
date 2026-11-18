// 点选寻址：节点索引（id → 节点/父节点/面包屑标签）与面包屑路径。
// 标签规则：行节点按在父结构中的角色（分子/分母/根号内…），结构节点按种类（分式/根号…）。
// 含等号的行：左右两侧是虚拟分组节点（id 形如「0:R」），面包屑显示「等式 › 右边 › …」。

import { findNode, type BigopNode, type Node, type RowNode } from './parser'

export interface AddrEntry {
  node: Node
  parentId?: string
  label: string
  side?: 'left' | 'right'
}

const BIGOP_LABEL = { sum: '求和', int: '积分', prod: '连乘', lim: '极限' } as const

export function kindLabel(n: Node): string {
  switch (n.kind) {
    case 'frac':
      return '分式'
    case 'sqrt':
      return '根号'
    case 'scripts':
      return '上下标'
    case 'bigop':
      return BIGOP_LABEL[n.op]
    case 'matrix':
      return '矩阵'
    case 'cases':
      return '分段函数'
    case 'group':
      return '括号组'
    case 'row':
      return '表达式'
    case 'atom':
      return n.value
  }
}

function eqIndex(row: RowNode): number {
  return row.children.findIndex((c) => c.kind === 'atom' && c.value === '=')
}

function bigopBodyLabel(op: BigopNode['op']): string {
  return op === 'int' ? '被积式' : op === 'lim' ? '表达式' : op === 'prod' ? '连乘项' : '求和项'
}

export function buildIndex(root: RowNode): Map<string, AddrEntry> {
  const map = new Map<string, AddrEntry>()
  const visit = (n: Node, parentId: string | undefined, label: string, side?: 'left' | 'right') => {
    if (n.kind === 'atom') return
    map.set(n.id, { node: n, parentId, label, side })
    const child = (c: Node, l: string, s?: 'left' | 'right') => visit(c, n.id, l, s)
    switch (n.kind) {
      case 'row': {
        const eq = eqIndex(n)
        n.children.forEach((c, i) => {
          const s = eq >= 0 && i !== eq ? (i < eq ? 'left' : 'right') : undefined
          child(c, c.kind === 'row' ? `第${i + 1}项` : kindLabel(c), s)
        })
        break
      }
      case 'group':
        child(n.child, '括号内')
        break
      case 'frac':
        child(n.num, '分子')
        child(n.den, '分母')
        break
      case 'sqrt':
        if (n.index) child(n.index, '根指数')
        child(n.body, '根号内')
        break
      case 'scripts':
        child(n.base, kindLabel(n.base))
        if (n.sup) child(n.sup, '指数')
        if (n.sub) child(n.sub, '下标')
        break
      case 'bigop':
        if (n.lower) child(n.lower, '下限')
        if (n.upper) child(n.upper, '上限')
        child(n.body, bigopBodyLabel(n.op))
        break
      case 'matrix':
        n.rows.forEach((r, ri) => r.forEach((c, ci) => child(c, `第${ri + 1}行第${ci + 1}列`)))
        break
      case 'cases':
        n.rows.forEach((r, ri) => {
          child(r.value, `第${ri + 1}段取值`)
          if (r.cond) child(r.cond, `第${ri + 1}段条件`)
        })
        break
    }
  }
  visit(root, undefined, eqIndex(root) >= 0 ? '等式' : '整式')
  return map
}

export interface Crumb {
  id: string
  label: string
}

/** 虚拟侧别 id：「0:R」= 根行等号右侧 */
export function parseSideId(id: string): { parentId: string; side: 'left' | 'right' } | undefined {
  const m = /^(.+):([LR])$/.exec(id)
  if (!m) return undefined
  return { parentId: m[1], side: m[2] === 'L' ? 'left' : 'right' }
}

export function sideLabel(side: 'left' | 'right'): string {
  return side === 'left' ? '左边' : '右边'
}

export function breadcrumbOf(index: Map<string, AddrEntry>, id: string): Crumb[] {
  const side = parseSideId(id)
  if (side) {
    return [...breadcrumbOf(index, side.parentId), { id, label: sideLabel(side.side) }]
  }
  const out: Crumb[] = []
  let cur: string | undefined = id
  while (cur) {
    const e = index.get(cur)
    if (!e) break
    out.push({ id: cur, label: e.label })
    if (e.side && e.parentId) {
      out.push({ id: `${e.parentId}:${e.side === 'left' ? 'L' : 'R'}`, label: sideLabel(e.side) })
    }
    cur = e.parentId
  }
  return out.reverse()
}

/** 选中 id → 可朗读节点；虚拟侧别 id 还原为等式左/右合成行 */
export function resolveSelected(tree: RowNode, id: string): Node {
  const side = parseSideId(id)
  if (side) {
    const parent = findNode(tree, side.parentId)
    if (parent?.kind === 'row') {
      const eq = eqIndex(parent)
      if (eq >= 0) {
        const children =
          side.side === 'left' ? parent.children.slice(0, eq) : parent.children.slice(eq + 1)
        return { kind: 'row', id, children }
      }
    }
  }
  return findNode(tree, id) ?? tree
}

/** 侧别选中时高亮的真实子节点 id 列表 */
export function sideChildIds(index: Map<string, AddrEntry>, id: string): string[] {
  const side = parseSideId(id)
  if (!side) return []
  const out: string[] = []
  index.forEach((e, key) => {
    if (e.parentId === side.parentId && e.side === side.side) out.push(key)
  })
  return out
}