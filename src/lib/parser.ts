// 只覆盖 6 类结构的递归下降解析器：分式、根号、上下标、求和/积分、矩阵、分段函数。
// KaTeX 仅暴露内部 __parse，无稳定公开 AST，故自写；节点 id 为路径串，供 M2 点选寻址。

export interface RowNode {
  kind: 'row'
  id: string
  children: Node[]
}
export interface AtomNode {
  kind: 'atom'
  id: string
  value: string
  /** 白名单外带参命令：参数已整体吞掉，朗读为「未支持的符号」；value 保留原源码供渲染 */
  unsupported?: boolean
  /** 字体命令/operatorname：参数原文照读（S3）；value 仍保留原源码供渲染 */
  literal?: string
}
export interface GroupNode {
  kind: 'group'
  id: string
  child: RowNode
}
export interface FracNode {
  kind: 'frac'
  id: string
  num: RowNode
  den: RowNode
}
export interface SqrtNode {
  kind: 'sqrt'
  id: string
  index?: RowNode
  body: RowNode
}
export interface ScriptsNode {
  kind: 'scripts'
  id: string
  base: Node
  sup?: RowNode
  sub?: RowNode
}
export interface BigopNode {
  kind: 'bigop'
  id: string
  op: 'sum' | 'int' | 'prod' | 'lim'
  lower?: RowNode
  upper?: RowNode
  body: RowNode
}
export interface MatrixNode {
  kind: 'matrix'
  id: string
  env: string
  rows: RowNode[][]
}
export interface CasesNode {
  kind: 'cases'
  id: string
  rows: { value: RowNode; cond?: RowNode }[]
}

export type Node =
  | RowNode
  | AtomNode
  | GroupNode
  | FracNode
  | SqrtNode
  | ScriptsNode
  | BigopNode
  | MatrixNode
  | CasesNode

export class ParseError extends Error {}

type Tok = { pos: number; end: number } & (
  | { t: 'cmd'; v: string }
  | { t: 'char'; v: string }
  | { t: 'num'; v: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'sup' }
  | { t: 'sub' }
  | { t: 'cell' }
  | { t: 'rowsep' }
  | { t: 'eof' }
)

const MATRIX_ENVS = ['matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix']

// 常用符号白名单：名单内命令按符号读；名单外降级为念符号名并继续，不整段失败
export const SYMBOL_WHITELIST = [
  'pm', 'mp', 'times', 'div', 'cdot',
  'infty', 'in', 'notin', 'to', 'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow',
  'leftrightarrow', 'mapsto', 'approx', 'sim', 'cong', 'equiv', 'propto',
  'leq', 'geq', 'neq', 'le', 'ge', 'ne',
  'cup', 'cap', 'subset', 'supset', 'subseteq', 'supseteq', 'emptyset', 'varnothing',
  'forall', 'exists', 'nexists', 'partial', 'nabla',
  'pi', 'theta', 'alpha', 'beta', 'gamma', 'delta', 'lambda', 'mu', 'sigma', 'omega',
  'Delta', 'Gamma', 'Lambda', 'Sigma', 'Omega',
  'angle', 'triangle', 'perp', 'parallel', 'degree', 'prime', 'circ', 'bullet', 'star', 'ast',
  'oplus', 'otimes', 'odot', 'vee', 'wedge', 'neg', 'land', 'lor', 'implies', 'iff',
  'therefore', 'because', 'cdots', 'ldots', 'vdots', 'ddots', 'dots',
  'log', 'ln', 'sin', 'cos', 'tan', 'exp',
  // P2-b 扩充：希腊字母变体与其余小写、大写
  'epsilon', 'varepsilon', 'upsilon', 'phi', 'varphi', 'iota', 'chi', 'psi', 'rho', 'tau',
  'nu', 'xi', 'zeta', 'eta', 'kappa', 'vartheta', 'varrho', 'varsigma', 'varpi',
  'Theta', 'Pi', 'Phi', 'Psi', 'Xi', 'Upsilon',
  // 关系
  'll', 'gg', 'leqslant', 'geqslant', 'lesssim', 'gtrsim', 'asymp', 'doteq',
  // 集合与定界符
  'subsetneq', 'supsetneq', 'setminus', 'mid', 'nmid', 'langle', 'rangle',
  'lfloor', 'rfloor', 'lceil', 'rceil', 'dagger', 'complement',
  // 箭头
  'longrightarrow', 'longleftarrow', 'Longrightarrow', 'Longleftarrow',
  'longleftrightarrow', 'Longleftrightarrow', 'uparrow', 'downarrow', 'updownarrow',
  'nearrow', 'searrow', 'swarrow', 'nwarrow', 'hookrightarrow', 'rightharpoonup',
  // 大运算符（按符号读，不做上下限结构解析）
  'bigcup', 'bigcap', 'iint', 'iiint', 'oint', 'oiint', 'bigoplus', 'bigotimes',
  'bigodot', 'bigvee', 'bigwedge', 'bigsqcup', 'coprod',
  // 函数名
  'det', 'dim', 'gcd', 'max', 'min', 'sup', 'inf', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'cot', 'sec', 'csc', 'coth', 'arg', 'deg', 'hom', 'ker',
  'limsup', 'liminf', 'Pr',
  // 其它常用符号
  'hbar', 'ell', 'Re', 'Im', 'aleph', 'beth', 'wp', 'top', 'bot', 'vdash', 'models',
  'simeq', 'bowtie', 'lvert', 'rvert', 'lVert', 'rVert', 'backslash', 'colon',
  // 间距：朗读中静默
  'quad', 'qquad',
]

// 白名单外带参命令的参数个数：解析时按 arity 吞掉紧邻参数，整体作为一个「未支持的符号」原子。
// 不吞参会把参数误读成独立因子（如 \binom{n}{k} 读成「n 乘以 k」），语义全错且无提示。
const ARITY: Record<string, number> = {
  binom: 2,
  hat: 1, bar: 1, vec: 1, dot: 1, ddot: 1, tilde: 1, widehat: 1, widetilde: 1,
  overline: 1, underline: 1, boxed: 1, phantom: 1, hbox: 1, substack: 1,
  color: 1, overset: 2, underset: 2, stackrel: 2,
}

// 字体命令与 operatorname：内容即字面文本/函数名，读参数原文（S3）
const LITERAL_CMDS = ['text', 'mathrm', 'mathbf', 'textbf', 'mathbb', 'mathcal', 'operatorname']

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    const start = i
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '\\') {
      if (src[i + 1] === '\\') {
        i += 2
        toks.push({ t: 'rowsep', pos: start, end: i })
        continue
      }
      const m = /^[a-zA-Z]+/.exec(src.slice(i + 1))
      if (m) {
        i += 1 + m[0].length
        // \left \right 只影响定界符大小；\limits \nolimits 只影响上下限位置；
        // \displaystyle 等只影响字号——结构上均透明，跳过
        const transparent = ['left', 'right', 'limits', 'nolimits', 'displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle']
        if (!transparent.includes(m[0])) toks.push({ t: 'cmd', v: m[0], pos: start, end: i })
        continue
      }
      // 转义字面符 \% \{ \} \$ \# \& \_：按普通字符处理
      if ('%{}$#&_'.includes(src[i + 1] ?? '')) {
        i += 2
        toks.push({ t: 'char', v: '\\' + src[i - 1], pos: start, end: i })
        continue
      }
      // \\, \\; \\! 等间距命令：跳过
      if (',;! '.includes(src[i + 1] ?? '')) {
        i += 2
        continue
      }
      throw new ParseError(`无法识别的反斜杠命令：\\${src[i + 1] ?? ''}`)
    }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!
      i += m[0].length
      toks.push({ t: 'num', v: m[0], pos: start, end: i })
      continue
    }
    i++
    if (c === '{') toks.push({ t: 'open', pos: start, end: i })
    else if (c === '}') toks.push({ t: 'close', pos: start, end: i })
    else if (c === '^') toks.push({ t: 'sup', pos: start, end: i })
    else if (c === '_') toks.push({ t: 'sub', pos: start, end: i })
    else if (c === '&') toks.push({ t: 'cell', pos: start, end: i })
    else toks.push({ t: 'char', v: c, pos: start, end: i })
  }
  toks.push({ t: 'eof', pos: src.length, end: src.length })
  return toks
}

class Parser {
  private pos = 0
  readonly unknown: string[] = []
  constructor(private toks: Tok[], private src: string) {}

  private peek(): Tok {
    return this.toks[this.pos]
  }
  private next(): Tok {
    return this.toks[this.pos++]
  }
  private expect(t: Tok['t']): Tok {
    const tok = this.next()
    if (tok.t !== t) throw new ParseError(`语法错误：期望 ${t}，实际遇到 ${describe(tok)}`)
    return tok
  }

  parseRoot(): RowNode {
    const row = this.parseRow([])
    if (this.peek().t !== 'eof') throw new ParseError(`语法错误：多余的内容 ${describe(this.peek())}`)
    return row
  }

  /** extraStop：term 级终止符（用于求和/积分的被积式） */
  private parseRow(extraStop: string[]): RowNode {
    const children: Node[] = []
    for (;;) {
      const tok = this.peek()
      if (
        tok.t === 'eof' ||
        tok.t === 'close' ||
        tok.t === 'cell' ||
        tok.t === 'rowsep' ||
        (tok.t === 'cmd' && tok.v === 'end') ||
        (tok.t === 'char' && extraStop.includes(tok.v)) ||
        (tok.t === 'cmd' && extraStop.includes('\\' + tok.v))
      ) {
        break
      }
      children.push(this.parseScripted())
    }
    return { kind: 'row', id: '', children }
  }

  private parseScripted(): Node {
    let base = this.parseAtom()
    let sup: RowNode | undefined
    let sub: RowNode | undefined
    for (;;) {
      const tok = this.peek()
      if (tok.t === 'sup') {
        this.next()
        sup = this.parseArg()
      } else if (tok.t === 'sub') {
        this.next()
        sub = this.parseArg()
      } else break
    }
    if (sup || sub) base = { kind: 'scripts', id: '', base, sup, sub }
    return base
  }

  /** 参数：{row} 或单个原子 */
  private parseArg(): RowNode {
    if (this.peek().t === 'open') {
      this.next()
      const row = this.parseRow([])
      this.expect('close')
      return row
    }
    return { kind: 'row', id: '', children: [this.parseAtom()] }
  }

  /** 未支持命令的吞参：按花括号深度整段吞掉，容忍参数内的 & 与 \\（如多行 \substack） */
  private swallowArg() {
    if (this.peek().t === 'open') {
      this.next()
      let depth = 1
      while (depth > 0) {
        const t = this.next()
        if (t.t === 'eof') throw new ParseError('语法错误：未支持的命令缺少完整参数')
        if (t.t === 'open') depth++
        else if (t.t === 'close') depth--
      }
    } else {
      this.parseAtom()
    }
  }

  private parseAtom(): Node {
    const tok = this.next()
    if (tok.t === 'num' || tok.t === 'char') return { kind: 'atom', id: '', value: tok.v }
    if (tok.t === 'open') {
      const child = this.parseRow([])
      this.expect('close')
      return { kind: 'group', id: '', child }
    }
    if (tok.t !== 'cmd') throw new ParseError(`语法错误：意外的 ${describe(tok)}`)
    switch (tok.v) {
      case 'frac':
      case 'dfrac':
      case 'tfrac': {
        const num = this.parseArg()
        const den = this.parseArg()
        return { kind: 'frac', id: '', num, den }
      }
      case 'sqrt': {
        let index: RowNode | undefined
        const p = this.peek()
        if (p.t === 'char' && p.v === '[') {
          this.next()
          index = this.parseRow([']'])
          const close = this.next()
          if (close.t !== 'char' || close.v !== ']')
            throw new ParseError('语法错误：根号指数缺少 ]')
        }
        const body = this.parseArg()
        return { kind: 'sqrt', id: '', index, body }
      }
      case 'sum':
      case 'int':
      case 'prod':
      case 'lim': {
        let lower: RowNode | undefined
        let upper: RowNode | undefined
        for (;;) {
          const t = this.peek()
          if (t.t === 'sub') {
            this.next()
            lower = this.parseArg()
          } else if (t.t === 'sup') {
            this.next()
            upper = this.parseArg()
          } else break
        }
        const body = this.parseRow(['+', '-', '=', '<', '>', ',', '\\pm'])
        return { kind: 'bigop', id: '', op: tok.v, lower, upper, body }
      }
      case 'begin': {
        this.expect('open')
        const env = this.readName()
        this.expect('close')
        return this.parseEnv(env)
      }
      default: {
        if (LITERAL_CMDS.includes(tok.v)) {
          const argStart = this.peek().pos
          this.parseArg()
          const argEnd = this.toks[this.pos - 1].end
          let literal = this.src.slice(argStart, argEnd)
          if (literal.startsWith('{')) literal = literal.slice(1, -1)
          literal = literal.trim()
          const value = this.src.slice(tok.pos, argEnd)
          // 参数内嵌数学命令时原文照读会念出反斜杠，降级回吞参读「未支持的符号」
          if (literal.includes('\\')) {
            this.unknown.push(tok.v)
            return { kind: 'atom', id: '', value, unsupported: true }
          }
          return { kind: 'atom', id: '', value, literal }
        }
        if (!SYMBOL_WHITELIST.includes(tok.v)) this.unknown.push(tok.v)
        const arity = ARITY[tok.v]
        if (arity !== undefined) {
          for (let a = 0; a < arity; a++) this.swallowArg()
          const last = this.toks[this.pos - 1]
          return { kind: 'atom', id: '', value: this.src.slice(tok.pos, last.end), unsupported: true }
        }
        return { kind: 'atom', id: '', value: '\\' + tok.v }
      }
    }
  }

  private parseEnv(env: string): Node {
    if (env === 'cases') {
      const rows: CasesNode['rows'] = []
      for (;;) {
        const value = this.parseRow([])
        let cond: RowNode | undefined
        if (this.peek().t === 'cell') {
          this.next()
          cond = this.parseRow([])
        }
        rows.push({ value, cond })
        if (this.peek().t === 'rowsep') {
          this.next()
          continue
        }
        break
      }
      this.expectEnd(env)
      return { kind: 'cases', id: '', rows }
    }
    if (MATRIX_ENVS.includes(env)) {
      const rows: RowNode[][] = []
      for (;;) {
        const cells = [this.parseRow([])]
        while (this.peek().t === 'cell') {
          this.next()
          cells.push(this.parseRow([]))
        }
        rows.push(cells)
        if (this.peek().t === 'rowsep') {
          this.next()
          continue
        }
        break
      }
      this.expectEnd(env)
      return { kind: 'matrix', id: '', env, rows }
    }
    throw new ParseError(`不支持的环境：${env}（仅支持矩阵族与 cases）`)
  }

  private expectEnd(env: string) {
    const end = this.next()
    if (end.t !== 'cmd' || end.v !== 'end') throw new ParseError(`语法错误：环境 ${env} 缺少 \\end`)
    this.expect('open')
    const name = this.readName()
    this.expect('close')
    if (name !== env) throw new ParseError(`语法错误：\\end{${name}} 与 \\begin{${env}} 不匹配`)
  }

  /** 环境名等裸字母串：tokenizer 将裸字母拆为单字符，这里拼回 */
  private readName(): string {
    let name = ''
    for (;;) {
      const t = this.peek()
      if (t.t === 'char' && /[a-zA-Z]/.test(t.v)) {
        name += t.v
        this.next()
      } else break
    }
    if (!name) throw new ParseError('语法错误：缺少名称')
    return name
  }
}

function describe(tok: Tok): string {
  switch (tok.t) {
    case 'cmd':
      return '\\' + tok.v
    case 'char':
    case 'num':
      return tok.v
    case 'eof':
      return '结尾'
    case 'open':
      return '{'
    case 'close':
      return '}'
    case 'sup':
      return '^'
    case 'sub':
      return '_'
    case 'cell':
      return '&'
    case 'rowsep':
      return '\\\\'
  }
}

function assignIds(node: Node, path: string) {
  node.id = path
  let i = 0
  const child = (n: Node) => assignIds(n, `${path}.${i++}`)
  switch (node.kind) {
    case 'row':
      node.children.forEach(child)
      break
    case 'group':
      child(node.child)
      break
    case 'frac':
      child(node.num)
      child(node.den)
      break
    case 'sqrt':
      if (node.index) child(node.index)
      child(node.body)
      break
    case 'scripts':
      child(node.base)
      if (node.sup) child(node.sup)
      if (node.sub) child(node.sub)
      break
    case 'bigop':
      if (node.lower) child(node.lower)
      if (node.upper) child(node.upper)
      child(node.body)
      break
    case 'matrix':
      node.rows.forEach((r) => r.forEach(child))
      break
    case 'cases':
      node.rows.forEach((r) => {
        child(r.value)
        if (r.cond) child(r.cond)
      })
      break
    case 'atom':
      break
  }
}

export type ParseResult =
  | { ok: true; node: RowNode; unknown: string[] }
  | { ok: false; error: string }

export function parse(latex: string): ParseResult {
  try {
    const parser = new Parser(tokenize(latex), latex)
    const node = parser.parseRoot()
    assignIds(node, '0')
    return { ok: true, node, unknown: parser.unknown }
  } catch (e) {
    return { ok: false, error: e instanceof ParseError ? e.message : '解析失败：表达式不完整' }
  }
}

export function findNode(root: Node, id: string): Node | undefined {
  if (root.id === id) return root
  const kids: Node[] = []
  switch (root.kind) {
    case 'row':
      kids.push(...root.children)
      break
    case 'group':
      kids.push(root.child)
      break
    case 'frac':
      kids.push(root.num, root.den)
      break
    case 'sqrt':
      if (root.index) kids.push(root.index)
      kids.push(root.body)
      break
    case 'scripts':
      kids.push(root.base)
      if (root.sup) kids.push(root.sup)
      if (root.sub) kids.push(root.sub)
      break
    case 'bigop':
      if (root.lower) kids.push(root.lower)
      if (root.upper) kids.push(root.upper)
      kids.push(root.body)
      break
    case 'matrix':
      root.rows.forEach((r) => kids.push(...r))
      break
    case 'cases':
      root.rows.forEach((r) => {
        kids.push(r.value)
        if (r.cond) kids.push(r.cond)
      })
      break
    case 'atom':
      break
  }
  for (const k of kids) {
    const hit = findNode(k, id)
    if (hit) return hit
  }
  return undefined
}