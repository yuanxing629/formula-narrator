// M2 修订自检：npm run check:parser（esbuild 打包后 node 运行，不引入测试框架）
import katex from 'katex'
import { findNode, parse, type Node, type RowNode } from '../src/lib/parser'
import { hasForbidden, l1GrandchildLeaks, narrate, narrateLayers, zhNumbers } from '../src/lib/narrate'
import { toWrappedLatex } from '../src/lib/renderTex'
import { breadcrumbOf, buildIndex, resolveSelected } from '../src/lib/address'
import { diffFormulae } from '../src/lib/diff'
import { presets } from '../src/data/presets'

let failed = 0
function check(name: string, cond: boolean, extra?: string) {
  if (cond) console.log(`通过 ${name}`)
  else {
    failed++
    console.error(`失败 ${name}${extra ? '：' + extra : ''}`)
  }
}

function mustParse(latex: string): Node {
  const r = parse(latex)
  if (!r.ok) throw new Error(`应可解析却失败：${latex} ${r.error}`)
  return r.node
}

function firstKind(node: Node, kind: Node['kind']): Node | undefined {
  if (node.kind === kind) return node
  const kids: Node[] = []
  switch (node.kind) {
    case 'row':
      kids.push(...node.children)
      break
    case 'group':
      kids.push(node.child)
      break
    case 'frac':
      kids.push(node.num, node.den)
      break
    case 'sqrt':
      if (node.index) kids.push(node.index)
      kids.push(node.body)
      break
    case 'scripts':
      kids.push(node.base)
      if (node.sup) kids.push(node.sup)
      if (node.sub) kids.push(node.sub)
      break
    case 'bigop':
      if (node.lower) kids.push(node.lower)
      if (node.upper) kids.push(node.upper)
      kids.push(node.body)
      break
    case 'matrix':
      node.rows.forEach((r) => kids.push(...r))
      break
    case 'cases':
      node.rows.forEach((r) => {
        kids.push(r.value)
        if (r.cond) kids.push(r.cond)
      })
      break
    case 'atom':
      break
  }
  for (const k of kids) {
    const hit = firstKind(k, kind)
    if (hit) return hit
  }
  return undefined
}

function allNodes(root: Node): Node[] {
  const out: Node[] = [root]
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
  for (const k of kids) out.push(...allNodes(k))
  return out
}

const QUAD = 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}'
const SUM = '\\sum_{i=1}^{n}i^{2}=\\frac{n(n+1)(2n+1)}{6}'
const CASES = 'f(x)=\\begin{cases}x^{2}, & x\\geq 0\\\\ -x, & x<0\\end{cases}'
const MATRIX = 'A=\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}'
const INT = '\\int_{0}^{1}2x\\,dx=1'
const ROOT = 'c=\\sqrt[3]{a^{3}+b^{3}}'

// 示例：可解析、三层齐备、L1≠L2、TTS 措辞合规、内部术语与阿拉伯数字零出现
const loneCheng = /(?<!相)乘(?!以)/u
for (const p of presets) {
  check(`示例可解析 ${p.id}`, parse(p.latex).ok)
  check(`示例三层文本 ${p.id}`, !!p.skeleton && !!p.local && !!p.detail)
  check(`L1≠L2 ${p.id}`, p.local !== p.detail)
  check(`TTS 无孤立乘 ${p.id}`, !loneCheng.test(p.skeleton + p.local + p.detail))
  const all = p.skeleton + p.local + p.detail
  check(`A1 朗读词表分离 ${p.id}`, !hasForbidden(all), all)
  check(`A7 无阿拉伯数字 ${p.id}`, !/[0-9]/.test(all), all)
}

// 6 类结构节点齐备
check('分式节点', !!firstKind(mustParse(QUAD), 'frac'))
check('根号节点', !!firstKind(mustParse(QUAD), 'sqrt'))
check('上下标节点', !!firstKind(mustParse(QUAD), 'scripts'))
check('求和节点', !!firstKind(mustParse(SUM), 'bigop'))
check('积分节点', !!firstKind(mustParse(INT), 'bigop'))
check('矩阵节点', !!firstKind(mustParse(MATRIX), 'matrix'))
check('分段节点', !!firstKind(mustParse(CASES), 'cases'))
check('根号带指数', !!firstKind(mustParse(ROOT), 'sqrt'))

// 第一节验收用例（求根公式的分式节点）
const quad = mustParse(QUAD)
const frac = firstKind(quad, 'frac')
check('路径寻址命中分式', !!frac && findNode(quad, frac.id) === frac)
if (frac?.kind === 'frac') {
  const L0 = narrate(frac, 0)
  const L1 = narrate(frac, 1)
  const L2 = narrate(frac, 2)
  check('L0 含分式', L0.includes('分式'), L0)
  check('A5 L0 分子两项', L0.includes('分子两项') && !L0.includes('3 项'), L0)
  check('A5 L0 加减号连接', L0.includes('中间用加减号连接'), L0)
  check('L0 含一个根号', L0.includes('含一个根号'), L0)
  check('A1 L0 分母读内容', L0.includes('分母是二a'), L0)
  check('L1(分式) 报分子规模', L1.includes('分子是一个两项的式子'), L1)
  const numL1 = narrate(frac.num, 1)
  check('L1(分子) 不读根号内部', !numL1.includes('b 的平方'), numL1)
  check('A5 L1(分子) 报两项', numL1.includes('共两项'), numL1)
  const sqrtNode = firstKind(frac, 'sqrt')!
  const sqrtL2 = narrate(sqrtNode, 2)
  check('L2(根号) 读到叶子', sqrtL2.includes('b 的平方 减 四ac'), sqrtL2)
  check('L2(根号) 判别式语义', sqrtL2.includes('判别式'), sqrtL2)
  check('A3 L2 分式无「分式：」前缀', !L2.startsWith('分式：') && L2.includes('分子为'), L2)
}
check('任意节点可独立 narrate', narrate(firstKind(quad, 'sqrt')!, 0).includes('根号'))

// A6：L1 不得读孙节点内容（按支 token 交集为空），替代旧「字符长度单调」断言
const leakFormulae = [
  QUAD,
  SUM,
  CASES,
  MATRIX,
  INT,
  ROOT,
  'a^{2}+b^{2}=c^{2}',
  '\\sum_{n=1}^{\\infty}\\frac{1}{n^{2}}=\\frac{\\pi^{2}}{6}',
  '\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}\\begin{pmatrix}0 & 1\\\\ 1 & 0\\end{pmatrix}=\\begin{pmatrix}2 & 1\\\\ 4 & 3\\end{pmatrix}',
]
let leakChecked = 0
for (const tex of leakFormulae) {
  for (const node of allNodes(mustParse(tex))) {
    const leaks = l1GrandchildLeaks(node)
    check(`A6 L1 无孙节点泄漏 ${node.id || '根'}@${tex.slice(0, 12)}`, leaks.length === 0, leaks.join(','))
    leakChecked++
  }
}
check('A6 泄漏检查覆盖节点数', leakChecked > 100, String(leakChecked))

// 第二节骨架重写
check('根号骨架给规模地标', narrate(firstKind(quad, 'sqrt')!, 0).includes('平方项'))
check('上下标骨架直接给读法', narrate(mustParse('x^{n}'), 0) === 'x 的 n 次方。', narrate(mustParse('x^{n}'), 0))
check('下标骨架直接给读法', narrate(mustParse('a_{i}'), 0) === 'a 下标 i。', narrate(mustParse('a_{i}'), 0))
check('分段骨架无大括号', !narrate(mustParse(CASES), 0).includes('大括号'))
check('矩阵骨架报行列', narrate(mustParse(MATRIX), 0).includes('两行两列'))
check('A1 幂给具体读法', narrate(mustParse('y=c^{2}'), 1).includes('右边是c 的平方'), narrate(mustParse('y=c^{2}'), 1))
check('A1 指数是 n', narrate(mustParse('x^{n}'), 1).includes('指数是n'), narrate(mustParse('x^{n}'), 1))

// 第三节容错
const degraded = parse('\\foo{1}+\\bar{x}')
check('白名单外降级不整段失败', degraded.ok)
check('降级符号计数', degraded.ok && degraded.unknown.length === 2, degraded.ok ? JSON.stringify(degraded.unknown) : '')
check('白名单内不计数', parse('\\alpha+\\infty').ok && (parse('\\alpha+\\infty') as { unknown: string[] }).unknown.length === 0)
check('降级念符号名', narrate(mustParse('\\foo'), 2) === 'foo')
check('left/right 透明', parse('\\left( x \\right)').ok)
check('语法错误仍整段报错', !parse('\\frac{1}{2').ok)
check('环境不匹配报错', !parse('\\begin{cases}1 & 2\\end{matrix}').ok)
check('不支持环境报错', !parse('\\begin{align}1\\end{align}').ok)
check('空输入为空行', parse('').ok && (parse('') as { ok: true; node: RowNode }).node.children.length === 0)

// 第四节乘法与函数应用（A2：隐式乘法不读乘以；相邻结构读乘以）
check('A2 数字×字母不读乘以', narrate(mustParse('2a'), 2) === '二a' && !narrate(mustParse('2a'), 2).includes('乘以'))
check('A2 字母连写不读乘以', narrate(mustParse('4ac'), 2) === '四ac')
check('A2 数字×括号不读乘以', !narrate(mustParse('2(x+1)'), 2).includes('乘以'), narrate(mustParse('2(x+1)'), 2))
check('A2 字母×括号不读乘以', !narrate(mustParse('n(n+1)'), 2).includes('乘以'), narrate(mustParse('n(n+1)'), 2))
check('显式乘号仍读乘以', narrate(mustParse('2\\times 3'), 2).includes('乘以'))
check('A2 相邻矩阵读乘以', narrate(mustParse('\\begin{pmatrix}1\\end{pmatrix}\\begin{pmatrix}2\\end{pmatrix}'), 2).includes('乘以'))
check('A2 相邻分式读乘以', narrate(mustParse('\\frac{1}{2}\\frac{3}{4}'), 2).includes('乘以'))
check('sin x 函数应用', narrate(mustParse('\\sin x'), 2) === '正弦x')
check('sin^2 x 函数应用', narrate(mustParse('\\sin^{2}x'), 2) === '正弦 的平方x')
check('A7 f(x) 不读括号', narrate(mustParse('f(x)=x'), 2).startsWith('f x'), narrate(mustParse('f(x)=x'), 2))
check('A7 优先级括号仍读', narrate(mustParse('(a+b)c'), 2).includes('左括号'), narrate(mustParse('(a+b)c'), 2))
check('A7 分段 L2 无左括号', !narrate(mustParse(CASES), 2).includes('左括号'), narrate(mustParse(CASES), 2))
check('A7 末尾数字读二不误读两', narrate(mustParse('\\sqrt{\\foo{1}+2}'), 2) === '根号下 foo 一 加 二', narrate(mustParse('\\sqrt{\\foo{1}+2}'), 2))
check('A7 根号指数无空格', narrate(mustParse(ROOT), 0).includes('一个三次根号'), narrate(mustParse(ROOT), 0))

// 第五节语序（A4：变量在前，去掉句末「（变量 n）」）
check('cases 先条件后取值', narrate(mustParse(CASES), 2).includes('当 x 大于等于 零 时，值为 x 的平方'))
check('A4 求和语序', narrate(mustParse(SUM), 2).includes('i 从 一 到 n，对 i 的平方 求和'), narrate(mustParse(SUM), 2))
check('A4 积分语序', narrate(mustParse(INT), 2).includes('x 从 零 到 一，对 二x 积分'), narrate(mustParse(INT), 2))
check('A4 无句末变量括注', !narrate(mustParse(SUM), 2).includes('（变量') && !narrate(mustParse(INT), 2).includes('（微分变量'), narrate(mustParse(SUM), 2))
check('A4 巴塞尔 L2 开头', narrate(mustParse('\\sum_{n=1}^{\\infty}\\frac{1}{n^{2}}=\\frac{\\pi^{2}}{6}'), 2).startsWith('n 从 一 到 无穷'), narrate(mustParse('\\sum_{n=1}^{\\infty}\\frac{1}{n^{2}}=\\frac{\\pi^{2}}{6}'), 2))
check('求和变量抽取', narrate(firstKind(mustParse(SUM), 'bigop')!, 0).includes('变量 i'), narrate(firstKind(mustParse(SUM), 'bigop')!, 0))
check('隐式乘法静默', narrate(mustParse(SUM), 2).includes('n左括号 n 加 一 右括号'), narrate(mustParse(SUM), 2))

// A3 分数口语化
check('A3 1/n² 口语化', narrate(mustParse('\\frac{1}{n^{2}}'), 2) === 'n 的平方分之一', narrate(mustParse('\\frac{1}{n^{2}}'), 2))
check('A3 巴塞尔 L2 含 n 的平方分之一', narrate(mustParse('\\sum_{n=1}^{\\infty}\\frac{1}{n^{2}}=\\frac{\\pi^{2}}{6}'), 2).includes('n 的平方分之一'))
check('A3 单项分子口语化', narrate(mustParse('\\frac{2x}{3}'), 2) === '三分之二x', narrate(mustParse('\\frac{2x}{3}'), 2))
check('A3 多项分子保留分子分母', narrate(mustParse('\\frac{a+b}{c}'), 2) === '分子为 a 加 b，分母为 c', narrate(mustParse('\\frac{a+b}{c}'), 2))

// 其余读法回归
check('一元负号读负', narrateLayers(quad).detail.includes('负 b'))
check('平方读平方', narrate(mustParse('x^{2}'), 2).includes('x 的平方'))
check('三次根式读法', narrate(mustParse(ROOT), 2).includes('三次根号下'), narrate(mustParse(ROOT), 2))
check('矩阵细节报行列', narrate(mustParse(MATRIX), 2).includes('两行两列矩阵'))

// 实测记录回归：地标不重复、分隔逗号不朗读（长度单调断言已按 A6 删除）
const pyth = narrateLayers(mustParse('a^{2}+b^{2}=c^{2}'))
check('勾股定理 L2 为纯读法', pyth.detail === 'a 的平方 加 b 的平方 等于 c 的平方', pyth.detail)
check('勾股定理 L1≠L2', pyth.local !== pyth.detail)
const matMulL0 = narrate(mustParse('\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}\\begin{pmatrix}0 & 1\\\\ 1 & 0\\end{pmatrix}=\\begin{pmatrix}2 & 1\\\\ 4 & 3\\end{pmatrix}'), 0)
check('矩阵等式 L0 不重复报数', !matMulL0.includes('含三个矩阵'), matMulL0)
check('A1 矩阵等式 L0 无内部术语', !hasForbidden(matMulL0), matMulL0)
check('cases 值行不读分隔逗号', !narrate(mustParse(CASES), 2).includes('逗号'), narrate(mustParse(CASES), 2))

// B1 渲染映射：htmlData 包裹后 KaTeX DOM 保留全部非原子节点 id，值无引号转义
const KATEX_OPTS = {
  trust: (ctx: { command: string }) => ctx.command === '\\htmlData',
  strict: 'ignore' as const,
  output: 'htmlAndMathml' as const,
  throwOnError: false,
}
for (const tex of [QUAD, SUM, CASES, MATRIX, INT, ROOT]) {
  const tree = mustParse(tex) as RowNode
  const html = katex.renderToString(toWrappedLatex(tree), KATEX_OPTS)
  const ids = new Set([...html.matchAll(/data-node="([^"]+)"/g)].map((m) => m[1]))
  const expected = allNodes(tree).filter((n) => n.kind !== 'atom').map((n) => n.id)
  check(`B1 htmlData 全覆盖 ${tex.slice(0, 10)}`, expected.every((id) => ids.has(id)), `缺 ${expected.filter((id) => !ids.has(id)).join(',')}`)
  check(`B1 值无引号转义 ${tex.slice(0, 10)}`, !html.includes('&quot;'))
  check(`B1 渲染无错误色 ${tex.slice(0, 10)}`, !html.includes('katex-error') && !html.includes('color: #cc0000'))
}

// B3 面包屑：求根公式根号路径＝等式 › 右边 › 分式 › 分子 › 根号；侧别虚拟节点可朗读
const quadTree = mustParse(QUAD) as RowNode
const quadIndex = buildIndex(quadTree)
const sqrtId = allNodes(quadTree).find((n) => n.kind === 'sqrt')!.id
const crumbs = breadcrumbOf(quadIndex, sqrtId)
check('B3 根号面包屑', crumbs.map((c) => c.label).join(' › ') === '等式 › 右边 › 分式 › 分子 › 根号', crumbs.map((c) => c.label).join(' › '))
const rightNode = resolveSelected(quadTree, '0:R')
check('B3 右边虚拟节点可朗读', narrate(rightNode, 0).includes('分式'), narrate(rightNode, 0))
check('B3 根节点面包屑', breadcrumbOf(quadIndex, '0').map((c) => c.label).join('') === '等式')
check('B3 表达式根显示整式', breadcrumbOf(buildIndex(mustParse('\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}') as RowNode), '0')[0].label === '整式')

// M2.1 A1：L0 只能比 L1 粗，不能比 L1 空——底数/指数皆原子时骨架给具体读法
const pythL0 = narrate(mustParse('a^{2}+b^{2}=c^{2}'), 0)
check('M2.1 A1 勾股 L0 含 c 的平方', pythL0.includes('c 的平方'), pythL0)
check('M2.1 A1 勾股 L0 不含一个幂', !pythL0.includes('一个幂'), pythL0)
const polyExpL0 = narrate(mustParse('y=x^{n+1}'), 0)
check('M2.1 A1 指数非原子仍报一个幂', polyExpL0.includes('一个幂'), polyExpL0)
const sumBigop = allNodes(mustParse(SUM)).find((n) => n.kind === 'bigop')!
check('M2.1 A1 求和骨架读具体平方', narrate(sumBigop, 0).includes('求和项是i 的平方'), narrate(sumBigop, 0))

// M2.1 A2：乘积项按因子个数出词，不再出现「等相乘」病句
const matMulTex = '\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}\\begin{pmatrix}0 & 1\\\\ 1 & 0\\end{pmatrix}=\\begin{pmatrix}2 & 1\\\\ 4 & 3\\end{pmatrix}'
const matMulL1 = narrate(mustParse(matMulTex), 1)
check('M2.1 A2 矩阵乘法 L0 两个…相乘', matMulL0.includes('两个两行两列矩阵相乘'), matMulL0)
check('M2.1 A2 矩阵乘法 L0 无等相乘', !matMulL0.includes('等相乘'), matMulL0)
check('M2.1 A2 矩阵乘法 L1 无病句', !/是一个.*相乘/.test(matMulL1), matMulL1)
const mixedL0 = narrate(mustParse('\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}\\frac{1}{2}'), 0)
check('M2.1 A2 混合两因子读乘以', mixedL0.includes('一个两行两列矩阵 乘以 一个分式'), mixedL0)
const tripleL0 = narrate(mustParse('\\begin{pmatrix}1\\end{pmatrix}\\frac{1}{2}\\sqrt{2}'), 0)
check('M2.1 A2 混合三因子报个数', tripleL0.includes('三个因子相乘'), tripleL0)
const tripleSameL0 = narrate(mustParse('\\begin{pmatrix}1\\end{pmatrix}\\begin{pmatrix}2\\end{pmatrix}\\begin{pmatrix}3\\end{pmatrix}'), 0)
check('M2.1 A2 同类型三因子报类型', tripleSameL0.includes('三个一行一列矩阵相乘'), tripleSameL0)
for (const tex of [QUAD, SUM, CASES, MATRIX, INT, ROOT, matMulTex]) {
  const tree = mustParse(tex)
  for (const n of allNodes(tree)) {
    for (const lv of [0, 1, 2] as const) {
      const s = narrate(n, lv)
      if (s.includes('等相乘')) check(`M2.1 A2 全节点无等相乘 ${n.id} L${lv}`, false, s)
    }
  }
}
check('M2.1 A2 全节点无等相乘', true)

// M2.1 A4：括号内加减号不切项；(a+b)c 是一项乘积
const parenProdL0 = narrate(mustParse('(a+b)c'), 0)
check('M2.1 A4 (a+b)c 报一项', parenProdL0.includes('一项') && !parenProdL0.includes('两项'), parenProdL0)
check('M2.1 A4 括号外仍切项', narrate(mustParse('(a+b)c+d'), 0).includes('两项'), narrate(mustParse('(a+b)c+d'), 0))
const fracParen = mustParse('\\frac{(a+b)}{2}')
check('M2.1 A4 分子含括号不切碎', narrate(fracParen, 0).includes('分子一项'), narrate(fracParen, 0))
check('M2.1 A4 分子含括号正常读', narrate(fracParen, 2).includes('分子为 左括号 a 加 b 右括号，分母为 二'), narrate(fracParen, 2))
check('M2.1 A4 括号内 pm 不切项', narrate(mustParse('(a\\pm b)c'), 0).includes('一项'), narrate(mustParse('(a\\pm b)c'), 0))

// M2.1 A3：插桩不得新增任何样式（KaTeX 自身 strut 度量允许减少；宽度/位置差在浏览器实测 <2px）
const quadHtml = katex.renderToString(toWrappedLatex(mustParse(QUAD) as RowNode), KATEX_OPTS)
const plainHtml = katex.renderToString(QUAD, KATEX_OPTS)
const stylesOf = (h: string) => new Set(h.match(/style="[^"]*"/g) ?? [])
const plainStyles = stylesOf(plainHtml)
check('M2.1 A3 插桩不新增样式', [...stylesOf(quadHtml)].every((s) => plainStyles.has(s)))

// M4 钉住对比：七条验收 + 增删项/系数/上限/截断回归
const diffOf = (a: string, b: string) => diffFormulae(mustParse(a) as RowNode, mustParse(b) as RowNode)
const QUAD_PLUS = QUAD.replace('\\pm', '+')
check('M4-1 加减号变加号', diffOf(QUAD, QUAD_PLUS) === '分子中间的加减号变成了加号。', diffOf(QUAD, QUAD_PLUS))
check('M4-2 指数平方变立方', diffOf('x^{2}', 'x^{3}') === '指数从平方变成了立方。', diffOf('x^{2}', 'x^{3}'))
check('M4-3 分母指数变化', diffOf('\\frac{1}{n^{2}}', '\\frac{1}{n^{3}}') === '分母的指数从平方变成了立方。', diffOf('\\frac{1}{n^{2}}', '\\frac{1}{n^{3}}'))
check('M4-4 常数项变化', diffOf('2x+1', '2x+3') === '常数项从一变成了三。', diffOf('2x+1', '2x+3'))
const structDiff = diffOf('\\frac{1}{2}', 'x+1')
check('M4-5 结构不同只提示', structDiff === '两式形式不同：一个是分式，一个是多项式。', structDiff)
check('M4-6 完全相同', diffOf(QUAD, QUAD) === '两式完全相同。', diffOf(QUAD, QUAD))
check('M4-6 空白差异视为相同', diffOf(QUAD, QUAD.replace(/}/g, '} ')) === '两式完全相同。')
check('M4 系数变化', diffOf('2x+1', '3x+1') === '系数从二变成了三。', diffOf('2x+1', '3x+1'))
check('M4 分母字母替换', diffOf('\\frac{1}{a}', '\\frac{1}{b}') === '分母里的a变成了b。', diffOf('\\frac{1}{a}', '\\frac{1}{b}'))
check('M4 增项', diffOf('a+b', 'a+b+2c') === '右边多了一项 二c。', diffOf('a+b', 'a+b+2c'))
check('M4 减项', diffOf('a+b-3', 'a+b') === '右边少了一项 负 三。', diffOf('a+b-3', 'a+b'))
check('M4 中间增项不错位', diffOf('a+c', 'a+b+c') === '多了一项 b。', diffOf('a+c', 'a+b+c'))
check('M4 求和变积分', diffOf('\\sum_{i=1}^{n}i', '\\int_{i=1}^{n}i') === '从求和变成了积分。', diffOf('\\sum_{i=1}^{n}i', '\\int_{i=1}^{n}i'))
check('M4 上限增删', diffOf('\\sum_{i=1}^{n}i', '\\sum_{i=1}i') === '少了上限 n。', diffOf('\\sum_{i=1}^{n}i', '\\sum_{i=1}i'))
const matSize = diffOf(MATRIX, 'A=\\begin{pmatrix}1 & 2 & 0\\\\ 3 & 4 & 0\\\\ 0 & 0 & 1\\end{pmatrix}')
check('M4 矩阵行列变化', matSize.includes('矩阵从两行两列变成了三行三列'), matSize)
const manyDiff = diffOf('a+b+c+d', 'w+x+y+z')
check('M4 超三处截断', manyDiff.startsWith('共四处不同，先说前三处：') && !manyDiff.includes('d变成了z'), manyDiff)
check('M4 两处用两', diffOf('a+b', 'w+x').startsWith('有两处不同：'), diffOf('a+b', 'w+x'))
check('M4 根号内深层定位', diffOf('\\sqrt{a+b}', '\\sqrt{a+c}').includes('根号内'), diffOf('\\sqrt{a+b}', '\\sqrt{a+c}'))
// M4-7 合规：一批差异句全部通过 READ_FORBIDDEN 与无阿拉伯数字
const diffPairs: [string, string][] = [
  [QUAD, QUAD_PLUS],
  ['x^{2}', 'x^{3}'],
  ['\\frac{1}{n^{2}}', '\\frac{1}{n^{3}}'],
  ['2x+1', '2x+3'],
  ['\\frac{1}{2}', 'x+1'],
  [QUAD, QUAD],
  ['2x+1', '3x+1'],
  ['\\frac{1}{a}', '\\frac{1}{b}'],
  ['a+b', 'a+b+2c'],
  ['a+b-3', 'a+b'],
  ['\\sum_{i=1}^{n}i', '\\int_{i=1}^{n}i'],
  [MATRIX, 'A=\\begin{pmatrix}1 & 2 & 0\\\\ 3 & 4 & 0\\\\ 0 & 0 & 1\\end{pmatrix}'],
  ['a+b+c+d', 'w+x+y+z'],
  ['\\sqrt{a+b}', '\\sqrt{a+c}'],
  ['\\frac{\\sqrt{2}}{3}', '\\frac{2}{3}'],
  [CASES, 'f(x)=\\begin{cases}x^{2}, & x\\geq 0\\\\ -x, & x<0\\\\ 0, & x=0\\end{cases}'],
  ['x^{2}', 'x'],
  ['\\sqrt[3]{a}', '\\sqrt{a}'],
]
for (const [a, b] of diffPairs) {
  const s = diffOf(a, b)
  check(`M4-7 无内部术语 ${a.slice(0, 10)}`, !hasForbidden(s), s)
  check(`M4-7 无阿拉伯数字 ${a.slice(0, 10)}`, !/[0-9]/.test(s), s)
}

// M4.1 S1：禁词精确规则——放行正常数学词，拦内部标签与元语言定义
for (const ok of ['多项式', '单项式', '二项式', '三项式', '形式', '结构不同', '两式形式不同：一个是分式，一个是多项式。'])
  check(`S1 放行 ${ok}`, !hasForbidden(ok), ok)
for (const bad of ['1项式', '一项式', '两项式', '单项', '规模', '地标', '节点', '这是一个分式结构'])
  check(`S1 拦截 ${bad}`, hasForbidden(bad), bad)
check('S1 单项式不误伤', !hasForbidden('单项式') && hasForbidden('单项标签'))

// M4.1 S2：增删项方位（等号未动）；项内变化不带方位
check('S2 右侧增项', diffOf('x+1', 'x+1+y') === '右边多了一项 y。', diffOf('x+1', 'x+1+y'))
check('S2 左侧增项', diffOf('x+1', 'y+x+1') === '左边多了一项 y。', diffOf('x+1', 'y+x+1'))
check('S2 项内变化无方位', diffOf('2x+1', '2x+3') === '常数项从一变成了三。', diffOf('2x+1', '2x+3'))
check('S2 中间增项无方位', diffOf('a+c', 'a+b+c') === '多了一项 b。', diffOf('a+c', 'a+b+c'))
check('S2 左侧减项', diffOf('y+a+b', 'a+b') === '左边少了一项 y。', diffOf('y+a+b', 'a+b'))

// M4.1 S3：顺序差异单独成句，不当无差异，也不误报多处
check('S3 加法顺序', diffOf('a+b', 'b+a') === '两式内容相同，只是加法顺序不同。', diffOf('a+b', 'b+a'))
check('S3 三项顺序', diffOf('a+b+c', 'c+b+a') === '两式内容相同，只是加法顺序不同。', diffOf('a+b+c', 'c+b+a'))
const orderVsChange = diffOf('a+b', 'a+c')
check('S3 内容变化仍正常报', orderVsChange.includes('b变成了c') && !orderVsChange.includes('顺序'), orderVsChange)
check('S3 顺序句合规', !hasForbidden(diffOf('a+b', 'b+a')) && !/[0-9]/.test(diffOf('a+b', 'b+a')))

// M4.1 S4：结构列表寻址（索引无原子、aria-label 合规）+ MathML 存在
const rootTree = mustParse(ROOT) as RowNode
const rootIndex = buildIndex(rootTree)
check('S4 三次根式列表项目数', rootIndex.size === 8, String(rootIndex.size))
let s4Labels = 0
for (const tex of [QUAD, ROOT, SUM, CASES, MATRIX]) {
  const idx = buildIndex(mustParse(tex) as RowNode)
  check(`S4 索引无原子 ${tex.slice(0, 8)}`, [...idx.values()].every((e) => e.node.kind !== 'atom'))
  for (const [id, e] of idx) {
    const label = zhNumbers(breadcrumbOf(idx, id).map((c) => c.label).join(' › ') + '，' + narrate(e.node, 1))
    if (hasForbidden(label) || /[0-9]/.test(label)) check(`S4 标签合规 ${id}@${tex.slice(0, 8)}`, false, label)
    s4Labels++
  }
}
check('S4 标签合规覆盖', s4Labels > 30, String(s4Labels))
const s4Html = katex.renderToString(toWrappedLatex(rootTree), KATEX_OPTS)
check('S4 MathML 存在', s4Html.includes('katex-mathml'))
check('S4 HTML 层存在', s4Html.includes('katex-html'))
check('S4 序数读二不读两', zhNumbers('第2行第2列') === '第二行第二列', zhNumbers('第2行第2列'))
check('S4 量词仍读两', zhNumbers('2个矩阵') === '两个矩阵', zhNumbers('2个矩阵'))

if (failed) {
  throw new Error(`共 ${failed} 项失败`)
}
console.log('全部自检通过')