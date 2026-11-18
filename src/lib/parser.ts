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

type Tok =
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
]

function tokenize(src: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '\\') {
      if (src[i + 1] === '\\') {
        toks.push({ t: 'rowsep' })
        i += 2
        continue
      }
      const m = /^[a-zA-Z]+/.exec(src.slice(i + 1))
      if (m) {
        // \left \right 只影响定界符大小，结构上透明
        if (m[0] !== 'left' && m[0] !== 'right') toks.push({ t: 'cmd', v: m[0] })
        i += 1 + m[0].length
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
      toks.push({ t: 'num', v: m[0] })
      i += m[0].length
      continue
    }
    if (c === '{') toks.push({ t: 'open' })
    else if (c === '}') toks.push({ t: 'close' })
    else if (c === '^') toks.push({ t: 'sup' })
    else if (c === '_') toks.push({ t: 'sub' })
    else if (c === '&') toks.push({ t: 'cell' })
    else toks.push({ t: 'char', v: c })
    i++
  }
  toks.push({ t: 'eof' })
  return toks
}

class Parser {
  private pos = 0
  readonly unknown: string[] = []
  constructor(private toks: Tok[]) {}

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
        if (!SYMBOL_WHITELIST.includes(tok.v)) this.unknown.push(tok.v)
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
    const parser = new Parser(tokenize(latex))
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