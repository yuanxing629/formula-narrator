// M1 修订自检：npm run check:parser（esbuild 打包后 node 运行，不引入测试框架）
import { findNode, parse, type Node, type RowNode } from '../src/lib/parser'
import { narrate, narrateLayers } from '../src/lib/narrate'
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

const QUAD = 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}'
const SUM = '\\sum_{i=1}^{n}i^{2}=\\frac{n(n+1)(2n+1)}{6}'
const CASES = 'f(x)=\\begin{cases}x^{2}, & x\\geq 0\\\\ -x, & x<0\\end{cases}'
const MATRIX = 'A=\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}'
const INT = '\\int_{0}^{1}2x\\,dx=1'
const ROOT = 'c=\\sqrt[3]{a^{3}+b^{3}}'

// 示例：可解析、三层齐备、L1≠L2、TTS 措辞合规
const loneCheng = /(?<!相)乘(?!以)/u
for (const p of presets) {
  check(`示例可解析 ${p.id}`, parse(p.latex).ok)
  check(`示例三层文本 ${p.id}`, !!p.skeleton && !!p.local && !!p.detail)
  check(`L1≠L2 ${p.id}`, p.local !== p.detail)
  check(`TTS 无孤立乘 ${p.id}`, !loneCheng.test(p.skeleton + p.local + p.detail))
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
  check('L0 分子三项', L0.includes('分子 3 项'), L0)
  check('L0 含一个根号', L0.includes('含 1 个根号'), L0)
  check('L0 分母单项 2a', L0.includes('分母单项 2a'), L0)
  const numL1 = narrate(frac.num, 1)
  check('L1(分子) 不读根号内部', !numL1.includes('b 的平方'), numL1)
  check('L1(分子) 报三项', numL1.includes('共 3 项'), numL1)
  const sqrtNode = firstKind(frac, 'sqrt')!
  const sqrtL2 = narrate(sqrtNode, 2)
  check('L2(根号) 读到叶子', sqrtL2.includes('b 的平方 减 4ac'), sqrtL2)
  check('L2(根号) 判别式语义', sqrtL2.includes('判别式'), sqrtL2)
  check('分式三层长度单调', L0.length < L1.length && L1.length < L2.length, `${L0.length}/${L1.length}/${L2.length}`)
}
const rL = narrateLayers(quad)
check('整式三层长度单调', rL.skeleton.length < rL.local.length && rL.local.length < rL.detail.length, `${rL.skeleton.length}/${rL.local.length}/${rL.detail.length}`)
check('任意节点可独立 narrate', narrate(firstKind(quad, 'sqrt')!, 0).includes('根号'))

// 第二节骨架重写
check('根号骨架给规模地标', narrate(firstKind(quad, 'sqrt')!, 0).includes('平方项'))
check('上下标骨架直接给读法', narrate(mustParse('x^{n}'), 0) === 'x 的 n 次方。', narrate(mustParse('x^{n}'), 0))
check('下标骨架直接给读法', narrate(mustParse('a_{i}'), 0) === 'a 下标 i。', narrate(mustParse('a_{i}'), 0))
check('分段骨架无大括号', !narrate(mustParse(CASES), 0).includes('大括号'))
check('矩阵骨架报行列', narrate(mustParse(MATRIX), 0).includes('2 行 2 列'))

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

// 第四节乘法与函数应用
check('2a 不读乘以', narrate(mustParse('2a'), 2) === '2a')
check('4ac 不读乘以', narrate(mustParse('4ac'), 2) === '4ac')
check('显式乘号仍读乘以', narrate(mustParse('2\\times 3'), 2).includes('乘以'))
check('sin x 函数应用', narrate(mustParse('\\sin x'), 2) === '正弦x')
check('sin^2 x 函数应用', narrate(mustParse('\\sin^{2}x'), 2) === '正弦 的平方x')
check('f(x) 不插乘以', narrate(mustParse('f(x)=x'), 2).startsWith('f左括号'))
const timesCount = presets.reduce((c, p) => c + (p.skeleton + p.local + p.detail).split('乘以').length - 1, 0)
check('全篇乘以次数下降为 0', timesCount === 0, String(timesCount))

// 第五节语序
check('cases 先条件后取值', narrate(mustParse(CASES), 2).includes('当 x 大于等于 0 时，值为 x 的平方'))
check('求和口语语序', narrate(mustParse(SUM), 2).includes('对 i 的平方 从 1 到 n 求和'), narrate(mustParse(SUM), 2))
check('积分口语语序', narrate(mustParse(INT), 2).includes('对 2x 从 0 到 1 积分'), narrate(mustParse(INT), 2))
check('积分微分变量', narrate(mustParse(INT), 2).includes('微分变量 x'))
check('求和变量抽取', narrate(firstKind(mustParse(SUM), 'bigop')!, 0).includes('变量 i'), narrate(firstKind(mustParse(SUM), 'bigop')!, 0))
check('隐式乘法静默', narrate(mustParse(SUM), 2).includes('n左括号 n 加 1 右括号'), narrate(mustParse(SUM), 2))

// 其余读法回归
check('一元负号读负', narrateLayers(quad).detail.includes('负 b'))
check('平方读平方', narrate(mustParse('x^{2}'), 2).includes('x 的平方'))
check('三次根式读法', narrate(mustParse(ROOT), 2).includes('3 次根号下'))
check('矩阵细节报行列', narrate(mustParse(MATRIX), 2).includes('2 行 2 列矩阵'))

// 实测记录回归：三层长度单调、地标不重复、分隔逗号不朗读
function mono(latex: string, name: string) {
  const l = narrateLayers(mustParse(latex))
  check(`${name}三层长度单调`, l.skeleton.length < l.local.length && l.local.length < l.detail.length, `${l.skeleton.length}/${l.local.length}/${l.detail.length}`)
}
const pyth = narrateLayers(mustParse('a^{2}+b^{2}=c^{2}'))
check('勾股定理 L0<L1', pyth.skeleton.length < pyth.local.length, `${pyth.skeleton.length}/${pyth.local.length}`)
check('勾股定理 L2 为纯读法', pyth.detail === 'a 的平方 加 b 的平方 等于 c 的平方', pyth.detail)
check('勾股定理 L1≠L2', pyth.local !== pyth.detail)
mono('\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}\\begin{pmatrix}0 & 1\\\\ 1 & 0\\end{pmatrix}=\\begin{pmatrix}2 & 1\\\\ 4 & 3\\end{pmatrix}', '矩阵乘法')
mono(CASES, '分段函数')
mono('\\sum_{n=1}^{\\infty}\\frac{1}{n^{2}}=\\frac{\\pi^{2}}{6}', '巴塞尔级数')
const matMulL0 = narrate(mustParse('\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}\\begin{pmatrix}0 & 1\\\\ 1 & 0\\end{pmatrix}=\\begin{pmatrix}2 & 1\\\\ 4 & 3\\end{pmatrix}'), 0)
check('矩阵等式 L0 不重复报数', !matMulL0.includes('含 3 个矩阵'), matMulL0)
check('cases 值行不读分隔逗号', !narrate(mustParse(CASES), 2).includes('逗号'), narrate(mustParse(CASES), 2))

if (failed) {
  throw new Error(`共 ${failed} 项失败`)
}
console.log('全部自检通过')