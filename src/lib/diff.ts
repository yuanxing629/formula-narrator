// M4 钉住对比：递归同构比较 → 人话差异句（最多报三处）。
// 不做编辑距离对齐、不做跨层移动识别（局限写进作品帖）。
// 差异句与三层文本同一合规口径：READ_FORBIDDEN 内部术语零出现、阿拉伯数字转中文。

import { cn, narrate, parts, readAtom, zhNumbers } from './narrate'
import type { Part } from './narrate'
import type { AtomNode, BigopNode, CasesNode, MatrixNode, Node, RowNode, ScriptsNode, SqrtNode, FracNode, GroupNode } from './parser'

const OP_WORD: Record<string, string> = {
  '+': '加号',
  '-': '减号',
  '\\pm': '加减号',
  '\\mp': '减加号',
  '=': '等号',
  '<': '小于号',
  '>': '大于号',
  '\\times': '乘号',
  '\\cdot': '乘号',
  '\\div': '除号',
  '\\leq': '小于等于号',
  '\\le': '小于等于号',
  '\\geq': '大于等于号',
  '\\ge': '大于等于号',
  '\\neq': '不等号',
  '\\ne': '不等号',
  '\\approx': '约等号',
}

const BIGOP_NAME = { sum: '求和', int: '积分', prod: '连乘', lim: '极限' } as const

function isNum(v: string): boolean {
  return /^[0-9]+$/.test(v)
}

function atomRead(v: string): string {
  return isNum(v) && Number(v) < 100 ? cn(Number(v)) : readAtom(v)
}

function expWord(v: string): string {
  if (v === '2') return '平方'
  if (v === '3') return '立方'
  return isNum(v) ? `${atomRead(v)}次方` : readAtom(v)
}

/** 类型的人话说法（避开内部术语）；行按形状描述 */
function kindWord(n: Node): string {
  switch (n.kind) {
    case 'frac':
      return '分式'
    case 'sqrt':
      return '根号'
    case 'scripts':
      return '幂'
    case 'bigop':
      return BIGOP_NAME[n.op]
    case 'matrix':
      return '矩阵'
    case 'cases':
      return '分段函数'
    case 'group':
      return kindWord(n.child)
    case 'atom':
      return atomRead(n.value)
    case 'row': {
      if (n.children.length === 1) return kindWord(n.children[0])
      if (n.children.some((c) => c.kind === 'atom' && c.value === '=')) return '等式'
      const terms = parts(n).filter((p) => p.type === 'term')
      return terms.length > 1 ? '多项式' : '一个式子'
    }
  }
}

/** 位置短语：取最近的角色标签；指数/下标带上所属支，「第N项」带上所在容器 */
function locOf(path: string[]): string {
  if (!path.length) return ''
  const last = path[path.length - 1]
  const prev = path[path.length - 2]
  const isSide = (s?: string) => s === '左边' || s === '右边'
  if ((last === '指数' || last === '下标') && prev && !isSide(prev)) return `${prev}的${last}`
  if (last.startsWith('第') && prev && !isSide(prev)) return `${prev}里的${last}`
  return last
}

function termText(p: Part & { type: 'term' }): string {
  // 首项的一元符号在 sign，后续项的加减号在 binary；负号要读「负」，加号不读
  const s = p.sign || p.binary || ''
  const sign = p.sign === '+' ? '正 ' : s === '-' ? '负 ' : ''
  return sign + narrate({ kind: 'row', id: '', children: p.nodes }, 2)
}

interface Ctx {
  siblings: Node[]
  index: number
}

export function diffFormulae(base: RowNode, cur: RowNode): string {
  const diffs: string[] = []
  const push = (s: string) => {
    if (s && !diffs.includes(s)) diffs.push(s)
  }

  function atomDiff(a: AtomNode, b: AtomNode, path: string[], ctx?: Ctx) {
    if (a.value === b.value) return
    const loc = locOf(path)
    const av = a.value
    const bv = b.value
    if (OP_WORD[av] && OP_WORD[bv]) {
      const pos = ctx ? (ctx.index === 0 ? '开头' : ctx.index === ctx.siblings.length - 1 ? '末尾' : '中间') : ''
      push(`${loc}${pos}的${OP_WORD[av]}变成了${OP_WORD[bv]}`)
      return
    }
    if (path[path.length - 1] === '指数' && isNum(av) && isNum(bv)) {
      push(`${loc}从${expWord(av)}变成了${expWord(bv)}`)
      return
    }
    if (isNum(av) && isNum(bv) && ctx) {
      const next = ctx.siblings[ctx.index + 1]
      const prev = ctx.siblings[ctx.index - 1]
      const letterLike = (n?: Node) =>
        !!n && ((n.kind === 'atom' && /^[a-zA-Z]$/.test(n.value)) || (n.kind === 'scripts' && n.base.kind === 'atom'))
      if (letterLike(next)) {
        push(`${loc ? loc + '的' : ''}系数从${atomRead(av)}变成了${atomRead(bv)}`)
        return
      }
      if (ctx.index === ctx.siblings.length - 1 && prev?.kind === 'atom' && (prev.value === '+' || prev.value === '-')) {
        push(`${loc ? loc + '的' : ''}常数项从${atomRead(av)}变成了${atomRead(bv)}`)
        return
      }
    }
    push(loc ? `${loc}里的${atomRead(av)}变成了${atomRead(bv)}` : `${atomRead(av)}变成了${atomRead(bv)}`)
  }

  /** 可选支（指数/下标/上下限/根指数/条件）：都在则递归，单缺则报增删 */
  function slot(a: RowNode | undefined, b: RowNode | undefined, path: string[], label: string) {
    if (a && b) cmp(a, b, [...path, label])
    else if (a) push(`${locOf(path)}少了${label} ${narrate(a, 2)}`)
    else if (b) push(`${locOf(path)}多了${label} ${narrate(b, 2)}`)
  }

  function cmp(a: Node, b: Node, path: string[], ctx?: Ctx) {
    if (a.kind !== b.kind) {
      push(
        path.length
          ? `${locOf(path)}从${kindWord(a)}变成了${kindWord(b)}`
          : `两式形式不同：一个是${kindWord(a)}，一个是${kindWord(b)}`,
      )
      return
    }
    switch (a.kind) {
      case 'atom':
        atomDiff(a, b as AtomNode, path, ctx)
        return
      case 'row': {
        const br = b as RowNode
        const ta = parts(a).filter((p): p is Part & { type: 'term' } => p.type === 'term')
        const tb = parts(br).filter((p): p is Part & { type: 'term' } => p.type === 'term')
        const taTexts = ta.map(termText)
        const tbTexts = tb.map(termText)
        // S3：项的多重集相同、仅顺序不同 → 单独报顺序差异，不当作无差异
        if (
          taTexts.length > 1 &&
          [...taTexts].sort().join('\u0000') === [...tbTexts].sort().join('\u0000') &&
          taTexts.join('\u0000') !== tbTexts.join('\u0000')
        ) {
          push('两式内容相同，只是加法顺序不同')
          return
        }
        if (a.children.length === br.children.length) {
          const eq = a.children.findIndex((c) => c.kind === 'atom' && c.value === '=')
          a.children.forEach((ca, i) => {
            let label: string | undefined
            if (eq >= 0 && i !== eq) label = i < eq ? '左边' : '右边'
            else if (a.children.length > 1 && ca.kind !== 'atom') label = `第${cn(i + 1)}项`
            cmp(ca, br.children[i], label ? [...path, label] : path, { siblings: a.children, index: i })
          })
        } else {
          // 一边是单一结构（分式/根号/幂…）、一边是多项 → 形式对不上，不硬凑增减项
          const single =
            a.children.length === 1 ? a.children[0] : br.children.length === 1 ? br.children[0] : undefined
          if (single && single.kind !== 'atom' && single.kind !== 'row') {
            push(
              path.length
                ? `${locOf(path)}从${kindWord(a)}变成了${kindWord(br)}`
                : `两式形式不同：一个是${kindWord(a)}，一个是${kindWord(br)}`,
            )
            return
          }
          // 个数不同：按项的读法做集合差，报增/减项，不再深入
          // S2：等号位置未变时按增删发生的位置带方位（左边/右边）；等号移动或一侧消失则退化无方位
          const loc = locOf(path)
          const eqA = a.children.findIndex((c) => c.kind === 'atom' && c.value === '=')
          const eqB = br.children.findIndex((c) => c.kind === 'atom' && c.value === '=')
          const eqMoved = eqA !== eqB
          const lastA = taTexts[taTexts.length - 1]
          const lastB = tbTexts[tbTexts.length - 1]
          const sideAdded = (text: string): string => {
            if (eqMoved) return ''
            if (tbTexts[0] !== taTexts[0] && tbTexts[0] === text) return '左边'
            if (lastB !== lastA && lastB === text) return '右边'
            return ''
          }
          const sideRemoved = (text: string): string => {
            if (eqMoved) return ''
            if (taTexts[0] !== tbTexts[0] && taTexts[0] === text) return '左边'
            if (lastA !== lastB && lastA === text) return '右边'
            return ''
          }
          const prefix = (side: string) => (side ? (loc && loc !== side ? loc + side : side) : loc)
          const count = (ts: (Part & { type: 'term' })[], text: string) => ts.filter((t) => termText(t) === text).length
          const seen = new Set<string>()
          for (const t of tb) {
            const text = termText(t)
            if (seen.has(text)) continue
            seen.add(text)
            if (count(tb, text) > count(ta, text)) push(`${prefix(sideAdded(text))}多了一项 ${text}`)
          }
          seen.clear()
          for (const t of ta) {
            const text = termText(t)
            if (seen.has(text)) continue
            seen.add(text)
            if (count(ta, text) > count(tb, text)) push(`${prefix(sideRemoved(text))}少了一项 ${text}`)
          }
        }
        return
      }
      case 'group':
        cmp(a.child, (b as GroupNode).child, [...path, '括号内'])
        return
      case 'frac': {
        const bf = b as FracNode
        cmp(a.num, bf.num, [...path, '分子'])
        cmp(a.den, bf.den, [...path, '分母'])
        return
      }
      case 'sqrt': {
        const bs = b as SqrtNode
        slot(a.index, bs.index, path, '根指数')
        cmp(a.body, bs.body, [...path, '根号内'])
        return
      }
      case 'scripts': {
        const bs = b as ScriptsNode
        cmp(a.base, bs.base, path)
        slot(a.sup, bs.sup, path, '指数')
        slot(a.sub, bs.sub, path, '下标')
        return
      }
      case 'bigop': {
        const bo = b as BigopNode
        if (a.op !== bo.op) {
          push(`${locOf(path)}从${BIGOP_NAME[a.op]}变成了${BIGOP_NAME[bo.op]}`)
          return
        }
        slot(a.lower, bo.lower, path, '下限')
        slot(a.upper, bo.upper, path, '上限')
        const bodyLabel = a.op === 'int' ? '被积式' : a.op === 'lim' ? '表达式' : a.op === 'prod' ? '连乘项' : '求和项'
        cmp(a.body, bo.body, [...path, bodyLabel])
        return
      }
      case 'matrix': {
        const bm = b as MatrixNode
        const ac = a.rows[0]?.length ?? 0
        const bc = bm.rows[0]?.length ?? 0
        if (a.rows.length !== bm.rows.length || ac !== bc) {
          push(
            `${locOf(path)}矩阵从${cn(a.rows.length, true)}行${cn(ac, true)}列变成了${cn(bm.rows.length, true)}行${cn(bc, true)}列`,
          )
          return
        }
        a.rows.forEach((r, ri) => r.forEach((c, ci) => cmp(c, bm.rows[ri][ci], [...path, `第${cn(ri + 1)}行第${cn(ci + 1)}列`])))
        return
      }
      case 'cases': {
        const bc = b as CasesNode
        if (a.rows.length !== bc.rows.length) {
          push(`${locOf(path)}分段从${cn(a.rows.length, true)}种情况变成了${cn(bc.rows.length, true)}种`)
          return
        }
        a.rows.forEach((r, i) => {
          cmp(r.value, bc.rows[i].value, [...path, `第${cn(i + 1)}段取值`])
          slot(r.cond, bc.rows[i].cond, path, `第${cn(i + 1)}段条件`)
        })
        return
      }
    }
  }

  cmp(base, cur, [])
  if (!diffs.length) return '两式完全相同。'
  if (diffs.length === 1) return zhNumbers(diffs[0]) + '。'
  const head = diffs.length > 3 ? `共${cn(diffs.length)}处不同，先说前三处：` : `有${cn(diffs.length, true)}处不同：`
  return zhNumbers(head + diffs.slice(0, 3).join('；')) + '。'
}