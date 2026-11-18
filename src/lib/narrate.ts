// 层级模型（docs/rules.md 分派规则）：
// L0 骨架 = 结构 + 规模 + 地标；L1 局部 = 只读直接子结构（是什么，不读孙节点内容）；
// L2 细节 = 被点名的那一支读到叶子；L3 从头读 = 独立顺序朗读动作（M2+ 实现）。
// 任意节点均可独立调用 narrate(node, level)，整式只是根节点。

import type { BigopNode, Node, RowNode, ScriptsNode } from './parser'

export type Level = 0 | 1 | 2

/** 内部术语不得进入朗读文本（G6）；自检对全部输出断言。
 *  M4.1 裁定：由子串匹配改为精确正则，放行正常数学词（多项式/单项式/二项式/三项式/形式/结构）。
 *  首条规则较裁定原文收窄——去掉「二、三」以放行二项式/三项式（与放行清单一致），仍拦「一项式/数字项式」。 */
export const READ_FORBIDDEN: RegExp[] = [
  /(\d|[一四五六七八九十两])\s*项式/,
  /单项(?!式)/,
  /规模|地标|节点/,
  /这是一个[^。]{0,8}结构/,
]

export function hasForbidden(s: string): boolean {
  return READ_FORBIDDEN.some((r) => r.test(s))
}

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

/** 模板计数转中文数字（G10）：量词前 2 读「两」，其余读「二」；原子字面值（2a、4ac）不转换 */
export function cn(n: number, measure = false): string {
  if (n === 2) return measure ? '两' : '二'
  if (n < 10) return CN_DIGITS[n]
  if (n < 20) return '十' + (n % 10 ? CN_DIGITS[n % 10] : '')
  return CN_DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? CN_DIGITS[n % 10] : '')
}

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
  '/': '除以',
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
  // P2-b 扩充读音
  '\\epsilon': '艾普西隆', '\\varepsilon': '艾普西隆', '\\upsilon': '宇普西隆',
  '\\phi': '斐', '\\varphi': '斐', '\\iota': '约塔', '\\chi': '希', '\\psi': '普西',
  '\\rho': '柔', '\\tau': '陶', '\\nu': '纽', '\\xi': '克西', '\\zeta': '泽塔',
  '\\eta': '伊塔', '\\kappa': '卡帕', '\\vartheta': '西塔', '\\varrho': '柔',
  '\\varsigma': '西格玛', '\\varpi': '圆周率',
  '\\Theta': '大写西塔', '\\Pi': '大写圆周率', '\\Phi': '大写斐', '\\Psi': '大写普西',
  '\\Xi': '大写克西', '\\Upsilon': '大写宇普西隆',
  '\\ll': '远小于', '\\gg': '远大于', '\\leqslant': '小于等于', '\\geqslant': '大于等于',
  '\\lesssim': '小于或约等于', '\\gtrsim': '大于或约等于', '\\asymp': '渐近于', '\\doteq': '趋近于',
  '\\subsetneq': '真包含于', '\\supsetneq': '真包含', '\\setminus': '差集',
  '\\mid': '给定', '\\nmid': '不整除',
  '\\langle': '左角括号', '\\rangle': '右角括号',
  '\\lfloor': '左下取整括号', '\\rfloor': '右下取整括号',
  '\\lceil': '左上取整括号', '\\rceil': '右上取整括号',
  '\\dagger': '匕首符号', '\\complement': '补集',
  '\\longrightarrow': '趋于', '\\longleftarrow': '反向趋于',
  '\\Longrightarrow': '推出', '\\Longleftarrow': '被推出',
  '\\longleftrightarrow': '互推', '\\Longleftrightarrow': '互推',
  '\\uparrow': '上箭头', '\\downarrow': '下箭头', '\\updownarrow': '上下箭头',
  '\\nearrow': '右上箭头', '\\searrow': '右下箭头', '\\swarrow': '左下箭头', '\\nwarrow': '左上箭头',
  '\\hookrightarrow': '嵌入到', '\\rightharpoonup': '右鱼叉箭头',
  '\\bigcup': '大并集', '\\bigcap': '大交集', '\\iint': '二重积分', '\\iiint': '三重积分',
  '\\oint': '环路积分', '\\oiint': '闭合曲面积分', '\\bigoplus': '大直和',
  '\\bigotimes': '大张量积', '\\bigodot': '大点积', '\\bigvee': '大或', '\\bigwedge': '大且',
  '\\bigsqcup': '大无交并', '\\coprod': '余积',
  '\\det': '行列式', '\\dim': '维数', '\\gcd': '最大公约数', '\\max': '最大值', '\\min': '最小值',
  '\\sup': '上确界', '\\inf': '下确界', '\\arcsin': '反正弦', '\\arccos': '反余弦', '\\arctan': '反正切',
  '\\sinh': '双曲正弦', '\\cosh': '双曲余弦', '\\tanh': '双曲正切',
  '\\cot': '余切', '\\sec': '正割', '\\csc': '余割', '\\coth': '双曲余切',
  '\\arg': '辐角', '\\deg': '次数', '\\hom': '同态', '\\ker': '核',
  '\\limsup': '上极限', '\\liminf': '下极限', '\\Pr': '概率',
  '\\hbar': '约化普朗克常数', '\\ell': '埃尔', '\\Re': '实部', '\\Im': '虚部',
  '\\aleph': '阿列夫', '\\beth': '贝斯', '\\wp': '魏尔斯特拉斯p',
  '\\top': '顶', '\\bot': '底', '\\vdash': '推出', '\\models': '模型满足',
  '\\simeq': '近似等于', '\\bowtie': '领结积',
  '\\lvert': '竖线', '\\rvert': '竖线', '\\lVert': '双竖线', '\\rVert': '双竖线',
  '\\backslash': '反斜杠', '\\colon': '冒号',
  '\\quad': '', '\\qquad': '',
  '\\%': '百分号', '\\{': '左花括号', '\\}': '右花括号', '\\$': '美元符号',
  '\\#': '井号', '\\&': '和号', '\\_': '下划线',
}

const FUNC_NAMES = new Set([
  'f', 'g', 'h', 'sin', 'cos', 'tan', 'log', 'ln', 'exp',
  'det', 'dim', 'gcd', 'max', 'min', 'sup', 'inf', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'cot', 'sec', 'csc', 'coth', 'arg', 'deg', 'hom', 'ker',
  'limsup', 'liminf', 'Pr',
])

export function readAtom(v: string): string {
  // 用 !== undefined：quad/qquad 的读音是空串（静默），不能被当成缺省
  if (ATOM_READ[v] !== undefined) return ATOM_READ[v]
  // 白名单外命令：降级念符号名
  return v.startsWith('\\') ? v.slice(1) : v
}

/** 带参未支持命令整体读「未支持的符号」，不逐字拼源码 */
function readAtomNode(n: Node & { kind: 'atom' }): string {
  return n.unsupported ? '未支持的符号' : readAtom(n.value)
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

/** 换底对数：base 为 \log/\ln、下标是单个原子的 scripts（S1） */
function isLogBase(n: Node): n is ScriptsNode {
  return (
    n.kind === 'scripts' &&
    n.base.kind === 'atom' &&
    (n.base.value === '\\log' || n.base.value === '\\ln') &&
    !n.sup &&
    !!n.sub &&
    n.sub.children.length === 1 &&
    n.sub.children[0].kind === 'atom'
  )
}

/** 可被对数消费的真数因子：字母数字原子、括号组、结构节点；运算符/关系符不算 */
function logArgOk(n: Node): boolean {
  if (isAlnum(n)) return true
  return n.kind === 'group' || n.kind === 'frac' || n.kind === 'sqrt' || n.kind === 'bigop' || n.kind === 'matrix' || n.kind === 'cases'
}

function logPhrase(n: ScriptsNode, arg: Node): string {
  const sub = readRow(n.sub!)
  const argText = arg.kind === 'group' ? readRow(arg.child) : readFull(arg)
  return `以 ${sub} 为底 ${argText} 的对数`
}

/** 行内恰好是「换底对数 + 一个真数因子」时给整体读法 */
function logRowPhrase(row: RowNode): string | undefined {
  const cs = row.children
  if (cs.length === 2 && isLogBase(cs[0]) && logArgOk(cs[1])) return logPhrase(cs[0], cs[1])
  return undefined
}

export type Part =
  | { type: 'term'; sign: string; binary?: string; nodes: Node[] }
  | { type: 'conn'; op: string }

/** 按加减号切项；\pm/\mp 是连接符，不计入项数（D4）；行首/连接符后为一元符号；
 *  括号内的加减号不切项（A4）：(a+b)c 是一个乘积，只算一项 */
export function parts(row: RowNode): Part[] {
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
  let parenDepth = 0
  for (const child of row.children) {
    if (child.kind === 'atom' && (child.value === '(' || child.value === '[')) parenDepth++
    else if (child.kind === 'atom' && (child.value === ')' || child.value === ']'))
      parenDepth = Math.max(0, parenDepth - 1)
    if (parenDepth === 0 && child.kind === 'atom' && (child.value === '+' || child.value === '-')) {
      if (cur.nodes.length) {
        flush()
        cur.binary = child.value
      } else {
        cur.sign = child.value
      }
    } else if (
      parenDepth === 0 &&
      child.kind === 'atom' &&
      (child.value === '\\pm' || child.value === '\\mp')
    ) {
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

/** 项数只数 term，\pm/\mp 连接符不计入（A5/D4） */
function termCount(row: RowNode): number {
  return parts(row).filter((p) => p.type === 'term').length
}

/** 多个 term 之间的连接符说法；无连接符返回空 */
function connPhrase(row: RowNode): string {
  const conns = parts(row).filter((p): p is Part & { type: 'conn' } => p.type === 'conn')
  if (!conns.length) return ''
  const words = [...new Set(conns.map((c) => (c.op === '\\pm' ? '加减号' : c.op === '\\mp' ? '减加号' : '')))]
  return words.length ? `中间用${words.join('和')}连接` : ''
}

function isStruct(n: Node): boolean {
  return n.kind === 'frac' || n.kind === 'sqrt' || n.kind === 'bigop' || n.kind === 'matrix'
}

/** 括号跨度：从 '(' 找到配对的 ')'（可能带幂）；嵌套按深度计数，找不到则退回逐原子朗读 */
function findSpan(nodes: Node[], i: number): { end: number; inner: Node[]; sup?: RowNode } | undefined {
  let depth = 0
  for (let j = i; j < nodes.length; j++) {
    const n = nodes[j]
    if (n.kind === 'atom' && n.value === '(') depth++
    else if (n.kind === 'atom' && n.value === ')') {
      depth--
      if (depth === 0) return { end: j, inner: nodes.slice(i + 1, j) }
    } else if (n.kind === 'scripts' && n.base.kind === 'atom' && n.base.value === ')' && !n.sub) {
      depth--
      if (depth === 0) return { end: j, inner: nodes.slice(i + 1, j), sup: n.sup }
    }
  }
  return undefined
}

/** 名词化（P1 第二档）：两项组读「X 与 Y 的和/差」；显式乘除的两因子组读「积/商」。
 *  读出来不通顺（含逗号/分号/冒号或仍含括号）时返回 undefined，退化第三档。 */
function nominalOf(inner: Node[]): string | undefined {
  const row: RowNode = { kind: 'row', id: '', children: inner }
  const ps = parts(row)
  let text: string | undefined
  if (
    ps.length === 2 &&
    ps[0].type === 'term' &&
    ps[1].type === 'term' &&
    !ps[0].binary &&
    (ps[1].binary === '+' || ps[1].binary === '-')
  ) {
    text = `${readTerm(ps[0])} 与 ${readTerm(ps[1])} 的${ps[1].binary === '+' ? '和' : '差'}`
  } else if (ps.length === 1 && ps[0].type === 'term' && ps[0].nodes.length === 3) {
    const [x, op, y] = ps[0].nodes
    if (op.kind === 'atom' && (op.value === '\\times' || op.value === '\\cdot'))
      text = `${readFull(x)} 与 ${readFull(y)} 的积`
    else if (op.kind === 'atom' && (op.value === '\\div' || op.value === '/'))
      text = `${readFull(x)} 与 ${readFull(y)} 的商`
  }
  if (!text) return undefined
  if (/[，；：]/.test(text) || text.includes('左括号')) return undefined
  return text
}

function isFactorNode(n: Node): boolean {
  return n.kind === 'atom' ? isAlnum(n) : true
}

type SpanKind = 'nominal' | 'paren' | 'bare'

/** 三档分派：不读（整式最外层等安全语境）→ 名词化（乘除/幂位置的两项组）→ 保留括号（嵌套≥2 或 ≥3 项） */
function readSpan(
  nodes: Node[],
  i: number,
  span: { end: number; inner: Node[]; sup?: RowNode },
  safe: boolean,
  prev: Node | undefined,
  prevSpan: SpanKind | undefined,
): { text: string; kind: SpanKind } {
  const innerRow: RowNode = { kind: 'row', id: '', children: span.inner }
  const supText = span.sup ? ` 的${expText(span.sup)}` : ''
  const nested = span.inner.some((x) => x.kind === 'atom' && x.value === '(')
  const many = termCount(innerRow) >= 3
  const whole = i === 0 && span.end === nodes.length - 1 && !span.sup
  const next = nodes[span.end + 1]
  const nextFactor = !!next && (isFactorNode(next) || (next.kind === 'atom' && next.value === '('))
  const prevDiv = prev?.kind === 'atom' && (prev.value === '/' || prev.value === '\\div')
  const factorCtx = !!span.sup || !!prevSpan || (!!prev && isFactorNode(prev)) || nextFactor || prevDiv
  if (!nested && !many) {
    const nom = nominalOf(span.inner)
    if (nom && factorCtx) return { text: nom + supText, kind: 'nominal' }
  }
  if (whole && safe && !nested && !many) return { text: readRow(innerRow), kind: 'bare' }
  return { text: `左括号 ${readRow(innerRow)} 右括号${supText}`, kind: 'paren' }
}

/** 项内连读：隐式乘法（数字×字母、字母×括号、数字×括号）不读乘以；相邻结构节点读「乘以」（G2）；函数调用不读括号（G9）；
 *  括号按 P1 三档降噪。safe 表示该行处于有语义边界的语境（整式/分子分母/根号内等），最外层括号可不读。 */
function readNodes(nodes: Node[], safe = false): string {
  let s = ''
  let prev: Node | undefined
  let prevSpan: SpanKind | undefined
  let fnParen = 0
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    // 间距命令（quad/qquad）静默：只留词边界，不参与拼接判断
    if (n.kind === 'atom' && ATOM_READ[n.value] === '') {
      if (s && !s.endsWith(' ')) s += ' '
      prev = undefined
      prevSpan = undefined
      continue
    }
    // 换底对数消费紧随的真数因子，避免真数被读成底数下标的一部分（S1）
    if (isLogBase(n) && i + 1 < nodes.length && logArgOk(nodes[i + 1])) {
      if (prev || prevSpan) s += ' '
      s += logPhrase(n, nodes[i + 1])
      prev = n
      prevSpan = undefined
      i++
      continue
    }
    if (prev && isFunc(prev) && n.kind === 'group') {
      s += readRow(n.child)
      prev = n
      continue
    }
    if (n.kind === 'atom' && n.value === '(' && prev && isFunc(prev) && fnParen === 0) {
      fnParen = 1
      prev = n
      continue
    }
    if (fnParen > 0 && n.kind === 'atom' && (n.value === '(' || n.value === ')')) {
      fnParen += n.value === '(' ? 1 : -1
      if (fnParen === 0) {
        prev = n
        continue
      }
    }
    if (fnParen === 0 && n.kind === 'atom' && n.value === '(') {
      const span = findSpan(nodes, i)
      if (span) {
        const { text, kind } = readSpan(nodes, i, span, safe, prev, prevSpan)
        if (prevSpan) s += ' 乘以 '
        else if (prev) {
          // 第三档括号沿用旧拼接：字母后静默（P(A|B)、E(X) 等函数应用记法），其余留空格
          if (kind === 'paren') s += isAlnum(prev) ? '' : ' '
          else s += isFactorNode(prev) ? ' 乘以 ' : ' '
        }
        s += text
        prev = undefined
        prevSpan = kind
        i = span.end
        continue
      }
    }
    const piece = readFull(n)
    if (prevSpan) {
      if (prevSpan === 'paren') s += ' '
      else {
        const operatorNext = n.kind === 'atom' && !isAlnum(n) && n.value !== '('
        s += operatorNext ? ' ' : ' 乘以 '
      }
    } else if (prev) {
      const bothNum = isNum(prev) && isNum(n)
      const fnApp = isFunc(prev) && (isAlnum(n) || (n.kind === 'atom' && n.value === '('))
      const implicit =
        !bothNum &&
        (fnApp || (isAlnum(prev) && (isAlnum(n) || (n.kind === 'atom' && n.value === '('))))
      const structAdj = isStruct(prev) && isStruct(n)
      s += bothNum || structAdj ? ' 乘以 ' : implicit ? '' : ' '
    }
    s += piece
    prev = n
    prevSpan = undefined
  }
  return s
}

function readTerm(p: Part & { type: 'term' }, safe = false): string {
  const sign = p.sign === '-' ? '负 ' : p.sign === '+' ? '正 ' : ''
  return sign + readNodes(p.nodes, safe && !p.sign)
}

function readRow(row: RowNode, outerSafe = true): string {
  const ps = parts(row)
  const out: string[] = []
  for (const p of ps) {
    if (p.type === 'conn') out.push(readAtom(p.op))
    else {
      if (p.binary) out.push(readAtom(p.binary))
      out.push(readTerm(p, outerSafe && !p.binary))
    }
  }
  return out.join(' ')
}

function expText(sup: RowNode): string {
  const only = sup.children.length === 1 && sup.children[0].kind === 'atom' ? sup.children[0].value : ''
  if (only === '2') return '平方'
  if (only === '3') return '立方'
  if (/^[0-9]+$/.test(only)) return `${cn(Number(only))} 次方`
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
  if (sqrt) bits.push(`含${cn(sqrt, true)}个根号`)
  if (withFrac && frac) bits.push(`含${cn(frac, true)}个分式`)
  if (big) bits.push(`含${cn(big, true)}个求和或积分`)
  if (mat) bits.push(`含${cn(mat, true)}个矩阵`)
  if (cas) bits.push(`含${cn(cas, true)}个分段`)
  return bits.join('，')
}

const BIGOP_NAME = { sum: '求和', int: '积分', prod: '连乘', lim: '极限' } as const

function squaredBit(n: Node): string {
  let sq = 0
  for (const k of childrenOf(n)) sq += countSquared(k)
  return sq ? `含${cn(sq, true)}个平方项` : ''
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
      return n.index ? `一个${readRow(n.index)}次根号` : '一个根号'
    case 'scripts':
      return scriptsConcrete(n) ?? '一个幂'
    case 'bigop':
      return `一个${BIGOP_NAME[n.op]}`
    case 'matrix':
      return `一个${cn(n.rows.length, true)}行${cn(n.rows[0]?.length ?? 0, true)}列矩阵`
    case 'cases':
      return `一个${cn(n.rows.length, true)}段分段表达式`
    case 'group':
      return shortType(n.child)
    case 'row':
      return scale(n)
    default:
      return readFull(n)
  }
}

/** 底数与指数都是原子时给具体读法（「c 的平方」），否则只报类型，避免 L1 泄漏孙节点内容 */
function scriptsConcrete(n: ScriptsNode): string | undefined {
  const supAtom = n.sup?.children.length === 1 && n.sup.children[0].kind === 'atom' ? n.sup.children[0] : undefined
  if (n.base.kind === 'atom' && supAtom && !n.sub) return readFull(n)
  return undefined
}

/** 规模：单项读内容，其余报项数 + 连接符 + 地标 */
function scale(row: RowNode): string {
  const ps = parts(row)
  const terms = ps.filter((p) => p.type === 'term')
  if (terms.length === 1 && ps.length === 1) {
    const t = terms[0] as Part & { type: 'term' }
    if (isMonomial(t)) return readTerm(t, true)
    if (t.nodes.length === 1) return shortType(t.nodes[0])
    const log = logRowPhrase({ kind: 'row', id: '', children: t.nodes })
    if (log) return (t.sign === '-' ? '负 ' : t.sign === '+' ? '正 ' : '') + log
    const atomsOnly = t.nodes.every((x) => x.kind === 'atom')
    const hasParen = t.nodes.some((x) => x.kind === 'atom' && '()[]'.includes(x.value))
    if (atomsOnly && !hasParen) return readTerm(t, true)
    // 含括号的纯原子乘积（如 (a+b)c）整体是一项，L0 不拆读（A4）
    if (atomsOnly) return '一项'
    return termDesc(t)
  }
  const lm = joinBits(structLandmarks(row, true), squaredBit(row))
  const conn = connPhrase(row)
  return `${cn(ps.filter((p) => p.type === 'term').length, true)}项${conn ? '，' + conn : ''}${lm ? '，' + lm : ''}`
}

/** L1 用的子结构描述：叶子/单项读内容；复合结构只给类型 + 自身直接项数，不读孙节点 */
function descriptor(n: Node): string {
  if (n.kind === 'atom') return readAtomNode(n)
  if (n.kind === 'row') {
    const ps = parts(n)
    const terms = ps.filter((p) => p.type === 'term')
    if (ps.length === 1 && terms.length === 1) {
      const t = terms[0] as Part & { type: 'term' }
      if (isMonomial(t)) return readTerm(t, true)
      if (t.nodes.length === 1) return typeWithScale(t.nodes[0])
      const log = logRowPhrase({ kind: 'row', id: '', children: t.nodes })
      if (log) return (t.sign === '-' ? '负 ' : t.sign === '+' ? '正 ' : '') + log
      if (t.nodes.every((x) => x.kind === 'atom')) return readTerm(t, true)
      return termDesc(t)
    }
    const lm = joinBits(structLandmarks(n, true), squaredBit(n))
    const conn = connPhrase(n)
    return `一个${cn(terms.length, true)}项的式子${conn ? '，' + conn : ''}${lm ? '，' + lm : ''}`
  }
  return typeWithScale(n)
}

function typeWithScale(n: Node): string {
  switch (n.kind) {
    case 'frac': {
      const conn = connPhrase(n.num)
      return `一个分式，分子${cn(termCount(n.num), true)}项${conn ? '（' + conn + '）' : ''}、分母${cn(termCount(n.den), true)}项`
    }
    case 'matrix':
      return `一个${cn(n.rows.length, true)}行${cn(n.rows[0]?.length ?? 0, true)}列矩阵`
    case 'cases':
      return `一个${cn(n.rows.length, true)}段分段表达式`
    case 'sqrt':
    case 'bigop':
      return shortType(n)
    case 'scripts':
      return scriptsConcrete(n) ?? '一个幂'
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

/** 分子是否为单个原子/单项（决定分式口语化读法，G7） */
function simpleNum(num: RowNode): boolean {
  const ps = parts(num)
  if (ps.length !== 1 || ps[0].type !== 'term') return false
  const t = ps[0]
  return t.nodes.length > 0 && t.nodes.every(isAlnum)
}

/** L2：被点名的那一支读到叶子 */
function readFull(n: Node): string {
  switch (n.kind) {
    case 'atom':
      return readAtomNode(n)
    case 'row':
      return readRow(n)
    case 'group':
      return readRow(n.child)
    case 'frac': {
      if (simpleNum(n.num)) return `${readRow(n.den).trim()}分之${readRow(n.num).trim()}`
      return `分子为 ${readRow(n.num)}，分母为 ${readRow(n.den)}`
    }
    case 'sqrt': {
      const head = n.index ? `${readRow(n.index)}次根号下` : '根号下'
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
      const range = lowerValue && upper ? `从 ${lowerValue} 到 ${upper}` : lowerValue ? `下限 ${lowerValue}` : ''
      const head = variable && range ? `${variable} ${range}，` : range ? `${range}，` : ''
      if (n.op === 'sum') return `${head}对 ${readRow(n.body)} 求和`
      if (n.op === 'prod') return `${head}对 ${readRow(n.body)} 连乘`
      if (n.op === 'lim') return `${variable ?? ''} 趋于 ${lowerValue ?? ''} 时 ${readRow(n.body)} 的极限`
      const { body } = intDiff(n.body)
      return `${head}对 ${readRow(body)} 积分`
    }
    case 'matrix': {
      const m = n.rows.length
      const cols = n.rows[0]?.length ?? 0
      const rows = n.rows.map((r, i) => `第${cn(i + 1)}行 ${r.map((c) => readRow(c)).join('，')}`)
      return `${cn(m, true)}行${cn(cols, true)}列矩阵：${rows.join('；')}`
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
      const conn = connPhrase(n.num)
      return `分式：分子${cn(termCount(n.num), true)}项${conn ? '，' + conn : ''}，分母是${scale(n.den)}${lm ? '，' + lm : ''}。`
    }
    case 'sqrt':
      return `一个${n.index ? `${readRow(n.index)}次` : ''}根号，里面是${scale(n.body)}。`
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
      return `一个${cn(n.rows.length, true)}行${cn(n.rows[0]?.length ?? 0, true)}列矩阵。`
    case 'cases':
      return `分段表达式，共${cn(n.rows.length, true)}种情况，每种带一个条件。`
    case 'atom':
      return readAtomNode(n) + '。'
  }
}

function l1(n: Node): string {
  switch (n.kind) {
    case 'row': {
      if (n.children.length === 1) return l1(n.children[0])
      const eq = splitEq(n)
      if (eq) return `左边是${descriptor(eq.left)}；右边是${descriptor(eq.right)}。`
      const ps = parts(n)
      const terms = ps.filter((p): p is Part & { type: 'term' } => p.type === 'term')
      const descs = terms.map((p) => {
        const log = logRowPhrase({ kind: 'row', id: '', children: p.nodes })
        if (log) return (p.sign === '-' ? '负 ' : p.sign === '+' ? '正 ' : '') + log
        return isMonomial(p) ? readTerm(p, true) : termDesc(p)
      })
      const conn = connPhrase(n)
      return `共${cn(terms.length, true)}项：${descs.join('；')}${conn ? '，' + conn : ''}。`
    }
    case 'group':
      return l1(n.child)
    case 'frac':
      return `分子是${descriptor(n.num)}；分母是${descriptor(n.den)}。`
    case 'sqrt':
      return `根号内是${descriptor(n.body)}。`
    case 'scripts': {
      const bits = [`底数是${descriptor(n.base)}`]
      if (n.sup) bits.push(`指数是${descriptor(n.sup)}`)
      if (n.sub) bits.push(`下标是${descriptor(n.sub)}`)
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
      return n.rows.map((r, i) => `第${cn(i + 1)}行${cn(r.length, true)}个元素`).join('；') + '。'
    case 'cases':
      return (
        n.rows
          .map((r, i) => {
            const cond = r.cond ? `条件 ${readRow(r.cond)}，` : ''
            return `第${cn(i + 1)}种：${cond}值是${descriptor(stripTrailingPunct(r.value))}`
          })
          .join('；') + '。'
      )
    case 'atom':
      return readAtomNode(n) + '。'
  }
}

/** 乘积项描述（A2）：同类型因子报「N 个××相乘」，混合两个报「A 乘以 B」，更多报「N 个因子相乘」 */
function termDesc(p: Part & { type: 'term' }): string {
  if (p.nodes.length === 1) return typeWithScale(p.nodes[0])
  const factors = p.nodes.filter((x) => x.kind !== 'atom' || isAlnum(x))
  const structs = factors.filter((x) => x.kind !== 'atom')
  if (!structs.length) return readTerm(p)
  const typeWords = new Set(structs.map((x) => shortType(x).replace(/^一个/, '')))
  if (typeWords.size === 1 && structs.length === factors.length) {
    return `${cn(factors.length, true)}个${[...typeWords][0]}相乘`
  }
  if (factors.length === 2) return `${shortType(factors[0])} 乘以 ${shortType(factors[1])}`
  return `${cn(factors.length, true)}个因子相乘`
}

/** 朗读文本内 0–99 的整数转中文数字（G10）；量词前 2 读「两」，其余读「二」；小数与超过 99 的数不动 */
export function zhNumbers(s: string): string {
  return s.replace(/\d+(?:\.\d+)?/g, (m, off: number, full: string) => {
    if (m.includes('.') || m.length > 2) return m
    const n = Number(m)
    const next = full[off + m.length] ?? ''
    const prev = full[off - 1] ?? ''
    // 序数（第N行/列/项）读「二」不读「两」；量词（N个/N项）才读「两」
    return cn(n, prev !== '第' && next !== '' && '项行列个种段'.includes(next))
  })
}

export function narrate(node: Node, level: Level): string {
  const raw = level === 0 ? l0(node) : level === 1 ? l1(node) : readFull(node)
  return zhNumbers(raw)
}

export function narrateLayers(node: Node): Layers {
  return { skeleton: narrate(node, 0), local: narrate(node, 1), detail: narrate(node, 2) }
}

function tokenizeRead(s: string): Set<string> {
  const toks = new Set<string>()
  for (const m of s.matchAll(/[a-zA-Z]+|[0-9]+|[一-鿿]/g)) toks.add(m[0])
  return toks
}

function leafTokens(n: Node, depth: number, out: Set<string>) {
  if (n.kind === 'atom') {
    if (depth >= 2) for (const t of tokenizeRead(n.value)) out.add(t)
    return
  }
  for (const k of childrenOf(n)) leafTokens(k, depth + 1, out)
}

/** 直接子层（深度 1）L1 允许读到的内容 token：原子读自身、单项读内容、单一结构给具体读法 */
function directContentTokens(n: Node): Set<string> {
  const out = new Set<string>()
  const add = (s: string) => {
    for (const t of tokenizeRead(s)) out.add(t)
  }
  if (n.kind === 'atom') {
    add(n.value)
    return out
  }
  if (n.kind === 'row') {
    const ps = parts(n)
    if (ps.length === 1 && ps[0].type === 'term') {
      const t = ps[0]
      if (isMonomial(t)) add(readTerm(t))
      else if (t.nodes.length === 1) add(typeWithScale(t.nodes[0]))
      else if (t.nodes.every((x) => x.kind === 'atom')) add(readTerm(t))
    }
    return out
  }
  if (n.kind === 'scripts') {
    const c = scriptsConcrete(n)
    if (c) add(c)
  }
  if (n.kind === 'sqrt' && n.index) add(readRow(n.index))
  return out
}

/** G4 自检：L1 不得读孙节点内容。按支检查——每个直接子结构的 L1 描述 ∩ 该支孙节点及以下叶子 token = ∅。
 *  全局交集会把跨支共享字母（2a 与 4ac 的 a）误判为泄漏，故按支断言。 */
export function l1GrandchildLeaks(n: Node): string[] {
  if (n.kind === 'group') return l1GrandchildLeaks(n.child)
  if (n.kind === 'row' && n.children.length === 1) return l1GrandchildLeaks(n.children[0])
  const pieces: { desc: string; sub: Node }[] = []
  if (n.kind === 'row') {
    const eq = splitEq(n)
    if (eq) {
      pieces.push({ desc: descriptor(eq.left), sub: eq.left }, { desc: descriptor(eq.right), sub: eq.right })
    } else {
      for (const p of parts(n)) {
        if (p.type === 'conn') continue
        const log = logRowPhrase({ kind: 'row', id: '', children: p.nodes })
        if (log) pieces.push({ desc: log, sub: { kind: 'row', id: '', children: p.nodes } })
        else if (isMonomial(p)) pieces.push({ desc: readTerm(p, true), sub: { kind: 'row', id: '', children: p.nodes } })
        else if (p.nodes.length === 1) pieces.push({ desc: typeWithScale(p.nodes[0]), sub: p.nodes[0] })
        else if (p.nodes.every((x) => x.kind === 'atom'))
          pieces.push({ desc: readTerm(p, true), sub: { kind: 'row', id: '', children: p.nodes } })
        else pieces.push({ desc: termDesc(p), sub: { kind: 'row', id: '', children: p.nodes } })
      }
    }
  } else if (n.kind === 'cases') {
    for (const r of n.rows) {
      if (r.cond) pieces.push({ desc: readRow(r.cond), sub: r.cond })
      pieces.push({ desc: descriptor(stripTrailingPunct(r.value)), sub: r.value })
    }
  } else if (n.kind === 'bigop') {
    if (n.lower) pieces.push({ desc: readRow(n.lower), sub: n.lower })
    if (n.upper) pieces.push({ desc: readRow(n.upper), sub: n.upper })
    pieces.push({ desc: descriptor(n.body), sub: n.body })
  } else {
    for (const c of childrenOf(n)) pieces.push({ desc: descriptor(c), sub: c })
  }
  const leaks: string[] = []
  for (const { desc, sub } of pieces) {
    const forbidden = new Set<string>()
    leafTokens(sub, 0, forbidden)
    // 直接子层允许读的内容（如幂的底数）不算泄漏；跨支共享字母只按支判定
    for (const k of childrenOf(sub)) for (const t of directContentTokens(k)) forbidden.delete(t)
    // 换底对数整体读法是经裁定的直接内容：底数下标与真数因子不算泄漏（S1）
    if (sub.kind === 'row') {
      const cs = sub.children
      for (let i = 0; i + 1 < cs.length; i++) {
        const head = cs[i]
        if (isLogBase(head) && logArgOk(cs[i + 1])) {
          for (const t of tokenizeRead(logPhrase(head, cs[i + 1]))) forbidden.delete(t)
          i++
        }
      }
    }
    for (const t of tokenizeRead(desc)) if (forbidden.has(t)) leaks.push(t)
  }
  return leaks
}