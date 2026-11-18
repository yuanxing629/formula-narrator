// 层级模型（docs/rules.md 分派规则）：
// L0 骨架 = 结构 + 规模 + 地标；L1 局部 = 只读直接子结构（是什么，不读孙节点内容）；
// L2 细节 = 被点名的那一支读到叶子；L3 从头读 = 独立顺序朗读动作（M2+ 实现）。
// 任意节点均可独立调用 narrate(node, level)，整式只是根节点。

import type { BigopNode, Node, RowNode } from './parser'

export type Level = 0 | 1 | 2

export interface Layers {
  skeleton: string
  local: string
  detail: string
}

const ATOM_READ: Record<string, string> = {
  '+': '加',
  '-': '减',
  '=': '等于',
  '<': '小于',
  '>': '大于',
  ',': '逗号',
  '(': '左括号',
  ')': '右括号',
  '[': '左方括号',
  ']': '右方括号',
  '|': '竖线',
  '\\pm': '加减',
  '\\mp': '减加',
  '\\times': '乘以',
  '\\div': '除以',
  '\\cdot': '乘以',
  '\\infty': '无穷',
  '\\in': '属于',
  '\\notin': '不属于',
  '\\to': '趋于',
  '\\rightarrow': '趋于',
  '\\leftarrow': '反向趋于',
  '\\Rightarrow': '推出',
  '\\Leftarrow': '被推出',
  '\\leftrightarrow': '互推',
  '\\mapsto': '映射到',
  '\\approx': '约等于',
  '\\sim': '相似于',
  '\\cong': '全等于',
  '\\equiv': '恒等于',
  '\\propto': '正比于',
  '\\leq': '小于等于',
  '\\le': '小于等于',
  '\\geq': '大于等于',
  '\\ge': '大于等于',
  '\\neq': '不等于',
  '\\ne': '不等于',
  '\\cup': '并',
  '\\cap': '交',
  '\\subset': '真包含于',
  '\\supset': '真包含',
  '\\subseteq': '包含于',
  '\\supseteq': '包含',
  '\\emptyset': '空集',
  '\\varnothing': '空集',
  '\\forall': '任意',
  '\\exists': '存在',
  '\\nexists': '不存在',
  '\\partial': '偏导',
  '\\nabla': '梯度',
  '\\pi': '圆周率',
  '\\theta': '西塔',
  '\\alpha': '阿尔法',
  '\\beta': '贝塔',
  '\\gamma': '伽马',
  '\\delta': '德尔塔',
  '\\lambda': '兰姆达',
  '\\mu': '缪',
  '\\sigma': '西格玛',
  '\\omega': '欧米伽',
  '\\Delta': '大写德尔塔',
  '\\Gamma': '大写伽马',
  '\\Lambda': '大写兰姆达',
  '\\Sigma': '大写西格玛',
  '\\Omega': '大写欧米伽',
  '\\angle': '角',
  '\\triangle': '三角形',
  '\\perp': '垂直于',
  '\\parallel': '平行于',
  '\\degree': '度',
  '\\prime': '撇',
  '\\circ': '圈',
  '\\bullet': '点',
  '\\star': '星',
  '\\ast': '星号',
  '\\oplus': '直和',
  '\\otimes': '张量积',
  '\\odot': '点积',
  '\\vee': '或',
  '\\lor': '或',
  '\\wedge': '且',
  '\\land': '且',
  '\\neg': '非',
  '\\implies': '推出',
  '\\iff': '当且仅当',
  '\\therefore': '所以',
  '\\because': '因为',
  '\\cdots': '省略号',
  '\\ldots': '省略号',
  '\\dots': '省略号',
  '\\vdots': '竖省略号',
  '\\ddots': '斜省略号',
  '\\sin': '正弦',
  '\\cos': '余弦',
  '\\tan': '正切',
  '\\log': '对数',
  '\\ln': '自然对数',
  '\\exp': '指数函数',
}

const FUNC_NAMES = new Set(['f', 'g', 'h', 'sin', 'cos', 'tan', 'log', 'ln', 'exp'])

function readAtom(v: string): string {
  if (ATOM_READ[v]) return ATOM_READ[v]
  // 白名单外命令：降级念符号名
  return v.startsWith('\\') ? v.slice(1) : v
}

function isAlnum(n: Node): boolean {
  return n.kind === 'atom' && /^[0-9a-zA-Z]$/.test(n.value)
}
function isNum(n: Node): boolean {
  return n.kind === 'atom' && /^[0-9]/.test(n.value)
}
function isFunc(n: Node): boolean {
  if (n.kind === 'atom') return FUNC_NAMES.has(n.value) || FUNC_NAMES.has(n.value.slice(1))
  if (n.kind === 'scripts') return isFunc(n.base)
  return false
}

type Part =
  | { type: 'term'; sign: string; binary?: string; nodes: Node[] }
  | { type: 'conn'; op: string }

/** 按加减号切项；\pm/\mp 作为连接符单独成项；行首/连接符后为一元符号，其余为二元运算符 */
function parts(row: RowNode): Part[] {
  const out: Part[] = []
  let cur: { type: 'term'; sign: string; binary?: string; nodes: Node[] } = {
    type: 'term',
    sign: '',
    nodes: [],
  }
  const flush = () => {
    if (cur.nodes.length || cur.sign || cur.binary) out.push(cur)
    cur = { type: 'term', sign: '', nodes: [] }
  }
  for (const child of row.children) {
    if (child.kind === 'atom' && (child.value === '+' || child.value === '-')) {
      if (cur.nodes.length) {
        flush()
        cur.binary = child.value
      } else {
        cur.sign = child.value
      }
    } else if (child.kind === 'atom' && (child.value === '\\pm' || child.value === '\\mp')) {
      flush()
      out.push({ type: 'conn', op: child.value })
    } else {
      cur.nodes.push(child)
    }
  }
  flush()
  return out
}

function isMonomial(p: Part): boolean {
  return p.type === 'term' && p.nodes.length > 0 && p.nodes.every(isAlnum)
}

/** 项内连读：乘号默认不读；仅数字×数字读「乘以」；函数应用不插乘 */
function readNodes(nodes: Node[]): string {
  let s = ''
  let prev: Node | undefined
  for (const n of nodes) {
    const piece = readFull(n)
    if (prev) {
      const bothNum = isNum(prev) && isNum(n)
      const fnApp = isFunc(prev) && (isAlnum(n) || (n.kind === 'atom' && n.value === '('))
      const silent =
        !bothNum &&
        (fnApp || (isAlnum(prev) && (isAlnum(n) || (n.kind === 'atom' && n.value === '('))))
      s += bothNum ? ' 乘以 ' : silent ? '' : ' '
    }
    s += piece
    prev = n
  }
  return s
}

function readTerm(p: Part & { type: 'term' }): string {
  const sign = p.sign === '-' ? '负 ' : p.sign === '+' ? '正 ' : ''
  return sign + readNodes(p.nodes)
}

function readRow(row: RowNode): string {
  const ps = parts(row)
  const out: string[] = []
  for (const p of ps) {
    if (p.type === 'conn') out.push(readAtom(p.op))
    else {
      if (p.binary) out.push(readAtom(p.binary))
      out.push(readTerm(p))
    }
  }
  return out.join(' ')
}

function expText(sup: RowNode): string {
  const only = sup.children.length === 1 && sup.children[0].kind === 'atom' ? sup.children[0].value : ''
  if (only === '2') return '平方'
  if (only === '3') return '立方'
  return ` ${readRow(sup)} 次方`
}

function splitEq(row: RowNode): { left: RowNode; right: RowNode } | undefined {
  const i = row.children.findIndex((c) => c.kind === 'atom' && c.value === '=')
  if (i < 0) return undefined
  return {
    left: { kind: 'row', id: '', children: row.children.slice(0, i) },
    right: { kind: 'row', id: '', children: row.children.slice(i + 1) },
  }
}

function intDiff(body: RowNode): { body: RowNode; diffVar?: string } {
  const cs = body.children
  if (cs.length >= 2) {
    const a = cs[cs.length - 2]
    const b = cs[cs.length - 1]
    if (a.kind === 'atom' && a.value === 'd' && b.kind === 'atom' && /^[a-zA-Z]$/.test(b.value)) {
      return { body: { kind: 'row', id: '', children: cs.slice(0, -2) }, diffVar: b.value }
    }
  }
  return { body }
}

function bigopVar(n: BigopNode): { variable?: string; lower?: string; upper?: string; lowerValue?: string } {
  const lower = n.lower ? readRow(n.lower) : undefined
  const upper = n.upper ? readRow(n.upper) : undefined
  let variable: string | undefined
  let lowerValue = lower
  if (n.lower) {
    const eq = splitEq(n.lower)
    if (eq) {
      variable = readRow(eq.left)
      lowerValue = readRow(eq.right)
    } else {
      const to = n.lower.children.findIndex((c) => c.kind === 'atom' && (c.value === '\\to' || c.value === '\\rightarrow'))
      if (to > 0) {
        variable = readRow({ kind: 'row', id: '', children: n.lower.children.slice(0, to) })
        lowerValue = readRow({ kind: 'row', id: '', children: n.lower.children.slice(to + 1) })
      }
    }
  }
  if (n.op === 'int') {
    const d = intDiff(n.body).diffVar
    if (d) variable = d
  }
  return { variable, lower, upper, lowerValue }
}

function childrenOf(n: Node): Node[] {
  switch (n.kind) {
    case 'row':
      return n.children
    case 'group':
      return [n.child]
    case 'frac':
      return [n.num, n.den]
    case 'sqrt':
      return n.index ? [n.index, n.body] : [n.body]
    case 'scripts':
      return [n.base, ...(n.sup ? [n.sup] : []), ...(n.sub ? [n.sub] : [])]
    case 'bigop':
      return [...(n.lower ? [n.lower] : []), ...(n.upper ? [n.upper] : []), n.body]
    case 'matrix':
      return n.rows.flat()
    case 'cases':
      return n.rows.flatMap((r) => (r.cond ? [r.cond, r.value] : [r.value]))
    case 'atom':
      return []
  }
}

function countKind(n: Node, kind: Node['kind']): number {
  let c = n.kind === kind ? 1 : 0
  for (const k of childrenOf(n)) c += countKind(k, kind)
  return c
}

function countSquared(n: Node): number {
  let c = 0
  if (n.kind === 'scripts' && n.sup && n.sup.children.length === 1 && n.sup.children[0].kind === 'atom' && n.sup.children[0].value === '2') c = 1
  for (const k of childrenOf(n)) c += countSquared(k)
  return c
}

/** 地标：只报结构种类与数量，不报内容；只统计子孙节点 */
function structLandmarks(n: Node, withFrac: boolean): string {
  const bits: string[] = []
  let sqrt = 0
  let frac = 0
  let big = 0
  let mat = 0
  let cas = 0
  for (const k of childrenOf(n)) {
    sqrt += countKind(k, 'sqrt')
    frac += countKind(k, 'frac')
    big += countKind(k, 'bigop')
    mat += countKind(k, 'matrix')
    cas += countKind(k, 'cases')
  }
  if (sqrt) bits.push(`含 ${sqrt} 个根号`)
  if (withFrac && frac) bits.push(`含 ${frac} 个分式`)
  if (big) bits.push(`含 ${big} 个求和或积分`)
  if (mat) bits.push(`含 ${mat} 个矩阵`)
  if (cas) bits.push(`含 ${cas} 个分段`)
  return bits.join('，')
}

const BIGOP_NAME = { sum: '求和', int: '积分', prod: '连乘', lim: '极限' } as const

function squaredBit(n: Node): string {
  let sq = 0
  for (const k of childrenOf(n)) sq += countSquared(k)
  return sq ? `含 ${sq} 个平方项` : ''
}

function joinBits(...bits: string[]): string {
  return bits.filter(Boolean).join('，')
}

/** 等式左右规模里已报过的地标不再在句尾重复（按结构关键词去重） */
function uncoveredLandmarks(n: RowNode, covered: string): string {
  const lm = structLandmarks(n, false)
  if (!lm) return ''
  const keywordOf = (bit: string) =>
    bit.includes('根号') ? '根号' : bit.includes('分式') ? '分式' : bit.includes('矩阵') ? '矩阵' : bit.includes('分段') ? '分段' : '求和'
  return lm
    .split('，')
    .filter((b) => {
      const kw = keywordOf(b)
      return kw === '求和' ? !covered.includes('求和') && !covered.includes('积分') : !covered.includes(kw)
    })
    .join('，')
}

/** cases 值行末尾的逗号/分号是排版分隔符，不朗读 */
function stripTrailingPunct(row: RowNode): RowNode {
  let cs = row.children
  while (cs.length) {
    const last = cs[cs.length - 1]
    if (last.kind === 'atom' && (last.value === ',' || last.value === ';')) cs = cs.slice(0, -1)
    else break
  }
  return { kind: 'row', id: row.id, children: cs }
}

function shortType(n: Node): string {
  switch (n.kind) {
    case 'frac':
      return '一个分式'
    case 'sqrt':
      return n.index ? `一个 ${readRow(n.index)} 次根号` : '一个根号'
    case 'scripts':
      return '一个幂'
    case 'bigop':
      return `一个${BIGOP_NAME[n.op]}`
    case 'matrix':
      return `一个 ${n.rows.length} 行 ${n.rows[0]?.length ?? 0} 列矩阵`
    case 'cases':
      return `一个 ${n.rows.length} 段分段表达式`
    case 'group':
      return shortType(n.child)
    case 'row':
      return scale(n)
    default:
      return readFull(n)
  }
}

/** 规模：单项读内容（地标），其余报项数 + 地标 */
function scale(row: RowNode): string {
  const ps = parts(row)
  const terms = ps.filter((p) => p.type === 'term')
  if (terms.length === 1 && ps.length === 1) {
    const t = terms[0] as Part & { type: 'term' }
    if (isMonomial(t)) return `单项 ${readTerm(t)}`
    if (t.nodes.length === 1) return shortType(t.nodes[0])
  }
  const lm = joinBits(structLandmarks(row, true), squaredBit(row))
  return `${ps.length} 项${lm ? '，' + lm : ''}`
}

/** L1 用的子结构描述：叶子/单项读内容；复合结构只给类型 + 自身直接规模，不读孙节点 */
function descriptor(n: Node): string {
  if (n.kind === 'atom') return readAtom(n.value)
  if (n.kind === 'row') {
    const ps = parts(n)
    const terms = ps.filter((p) => p.type === 'term')
    if (ps.length === 1 && terms.length === 1) {
      const t = terms[0] as Part & { type: 'term' }
      if (isMonomial(t)) return `单项 ${readTerm(t)}`
      if (t.nodes.length === 1) return typeWithScale(t.nodes[0])
    }
    const lm = joinBits(structLandmarks(n, true), squaredBit(n))
    return `一个 ${ps.length} 项式${lm ? '，' + lm : ''}`
  }
  return typeWithScale(n)
}

function typeWithScale(n: Node): string {
  switch (n.kind) {
    case 'frac':
      return `一个分式，分子 ${parts(n.num).length} 项、分母 ${parts(n.den).length} 项`
    case 'matrix':
      return `一个 ${n.rows.length} 行 ${n.rows[0]?.length ?? 0} 列矩阵`
    case 'cases':
      return `一个 ${n.rows.length} 段分段表达式`
    case 'sqrt':
    case 'scripts':
    case 'bigop':
      return shortType(n)
    case 'group':
      return descriptor(n.child)
    default:
      return readFull(n)
  }
}

function isDiscriminant(body: RowNode): boolean {
  const cs = body.children
  if (cs.length !== 5) return false
  const [a, minus, four, ac1, ac2] = cs
  return (
    a.kind === 'scripts' &&
    a.base.kind === 'atom' &&
    a.base.value === 'b' &&
    !!a.sup &&
    a.sup.children.length === 1 &&
    a.sup.children[0].kind === 'atom' &&
    a.sup.children[0].value === '2' &&
    minus.kind === 'atom' &&
    minus.value === '-' &&
    four.kind === 'atom' &&
    four.value === '4' &&
    ac1.kind === 'atom' &&
    ac1.value === 'a' &&
    ac2.kind === 'atom' &&
    ac2.value === 'c'
  )
}

/** L2：被点名的那一支读到叶子 */
function readFull(n: Node): string {
  switch (n.kind) {
    case 'atom':
      return readAtom(n.value)
    case 'row':
      return readRow(n)
    case 'group':
      return readRow(n.child)
    case 'frac':
      return `分式：分子为 ${readRow(n.num)}，分母为 ${readRow(n.den)}`
    case 'sqrt': {
      const head = n.index ? `${readRow(n.index)} 次根号下` : '根号下'
      const note = isDiscriminant(n.body) ? '（即判别式）' : ''
      return `${head} ${readRow(n.body)}${note}`
    }
    case 'scripts': {
      let s = readFull(n.base)
      if (n.sup) s += ` 的${expText(n.sup)}`
      if (n.sub) s += ` 下标 ${readRow(n.sub)}`
      return s
    }
    case 'bigop': {
      const { variable, lowerValue, upper } = bigopVar(n)
      const range = lowerValue && upper ? `从 ${lowerValue} 到 ${upper} ` : lowerValue ? `下限 ${lowerValue} ` : ''
      if (n.op === 'sum') return `对 ${readRow(n.body)} ${range}求和${variable ? `（变量 ${variable}）` : ''}`
      if (n.op === 'prod') return `对 ${readRow(n.body)} ${range}连乘${variable ? `（变量 ${variable}）` : ''}`
      if (n.op === 'lim') return `${variable ?? ''} 趋于 ${lowerValue ?? ''} 时 ${readRow(n.body)} 的极限`
      const { body, diffVar } = intDiff(n.body)
      return `对 ${readRow(body)} ${range}积分${diffVar ? `（微分变量 ${diffVar}）` : ''}`
    }
    case 'matrix': {
      const m = n.rows.length
      const cols = n.rows[0]?.length ?? 0
      const rows = n.rows.map((r, i) => `第 ${i + 1} 行 ${r.map(readRow).join('，')}`)
      return `${m} 行 ${cols} 列矩阵：${rows.join('；')}`
    }
    case 'cases': {
      const rows = n.rows.map((r) => {
        const cond = r.cond ? `当 ${readRow(r.cond)} 时，` : ''
        return `${cond}值为 ${readRow(stripTrailingPunct(r.value))}`
      })
      return `分段表达式：${rows.join('；')}`
    }
  }
}

function l0(n: Node): string {
  switch (n.kind) {
    case 'row': {
      if (n.children.length === 1) return l0(n.children[0])
      const eq = splitEq(n)
      if (eq) {
        const ls = scale(eq.left)
        const rs = scale(eq.right)
        const lm = uncoveredLandmarks(n, ls + rs)
        return `等式：左边${ls}，右边${rs}${lm ? '；' + lm : ''}。`
      }
      return `表达式：${scale(n)}。`
    }
    case 'group':
      return l0(n.child)
    case 'frac': {
      const lm = structLandmarks(n, false)
      return `分式：分子 ${parts(n.num).length} 项、分母${scale(n.den)}${lm ? '，' + lm : ''}。`
    }
    case 'sqrt':
      return `一个${n.index ? ` ${readRow(n.index)} 次` : ''}根号，里面是${scale(n.body)}。`
    case 'scripts': {
      let s = readFull(n.base)
      if (n.sup) s += ` 的${expText(n.sup)}`
      if (n.sub) s += ` 下标 ${readRow(n.sub)}`
      return s + '。'
    }
    case 'bigop': {
      const { variable, lowerValue, upper } = bigopVar(n)
      const name = BIGOP_NAME[n.op]
      const range = lowerValue && upper ? `从 ${lowerValue} 到 ${upper}` : lowerValue ? `下限 ${lowerValue}` : '无上下限'
      const bodyName = n.op === 'int' ? '被积式' : n.op === 'lim' ? '表达式' : '求和项'
      return `一个${name}：${variable ? `变量 ${variable}，` : ''}${range}，${bodyName}是${scale(n.body)}。`
    }
    case 'matrix':
      return `一个 ${n.rows.length} 行 ${n.rows[0]?.length ?? 0} 列矩阵。`
    case 'cases':
      return `分段表达式，共 ${n.rows.length} 种情况，每种带一个条件。`
    case 'atom':
      return readAtom(n.value) + '。'
  }
}

function l1(n: Node): string {
  switch (n.kind) {
    case 'row': {
      if (n.children.length === 1) return l1(n.children[0])
      const eq = splitEq(n)
      if (eq) return `左边是${descriptor(eq.left)}；右边是${descriptor(eq.right)}。`
      const ps = parts(n)
      const descs = ps.map((p) =>
        p.type === 'conn' ? `${readAtom(p.op)}号` : isMonomial(p) ? readTerm(p) : termDesc(p),
      )
      return `共 ${ps.length} 项：${descs.join('；')}。`
    }
    case 'group':
      return l1(n.child)
    case 'frac':
      return `分子是${descriptor(n.num)}；分母是${descriptor(n.den)}。`
    case 'sqrt':
      return `根号内是${descriptor(n.body)}。`
    case 'scripts': {
      const bits = [`底数 ${descriptor(n.base)}`]
      if (n.sup) bits.push(`指数 ${descriptor(n.sup)}`)
      if (n.sub) bits.push(`下标 ${descriptor(n.sub)}`)
      return bits.join('，') + '。'
    }
    case 'bigop': {
      const bits: string[] = []
      if (n.lower) bits.push(`下限 ${readRow(n.lower)}`)
      if (n.upper) bits.push(`上限 ${readRow(n.upper)}`)
      bits.push(`${n.op === 'int' ? '被积式' : '求和项'}是${descriptor(n.body)}`)
      return bits.join('，') + '。'
    }
    case 'matrix':
      return n.rows.map((r, i) => `第 ${i + 1} 行 ${r.length} 个元素`).join('；') + '。'
    case 'cases':
      return (
        n.rows
          .map((r, i) => {
            const cond = r.cond ? `条件 ${readRow(r.cond)}，` : ''
            return `第 ${i + 1} 种：${cond}值是${descriptor(stripTrailingPunct(r.value))}`
          })
          .join('；') + '。'
      )
    case 'atom':
      return readAtom(n.value) + '。'
  }
}

function termDesc(p: Part & { type: 'term' }): string {
  if (p.nodes.length === 1) return typeWithScale(p.nodes[0])
  const first = p.nodes.find((x) => x.kind !== 'atom')
  return first ? `${shortType(first)}等相乘` : `${p.nodes.length} 个元素相乘`
}

export function narrate(node: Node, level: Level): string {
  if (level === 0) return l0(node)
  if (level === 1) return l1(node)
  return readFull(node)
}

export function narrateLayers(node: Node): Layers {
  return { skeleton: narrate(node, 0), local: narrate(node, 1), detail: narrate(node, 2) }
}