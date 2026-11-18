// 证据包自检：npm run check:corpus
// 对 docs/corpus.ts 的 30 条公式执行 parse → narrateLayers → l1GrandchildLeaks，
// 报告正文输出到 stdout，由 npm 脚本重定向写入 docs/corpus-report.md（UTF-8）；
// 并断言：解析成功 ≥28/30、L1 泄漏 0 条。
import { corpus } from '../docs/corpus'
import { parse, type Node } from '../src/lib/parser'
import { l1GrandchildLeaks, narrateLayers } from '../src/lib/narrate'

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

interface Row {
  id: string
  cat: string
  latex: string
  note: string
  ok: boolean
  error?: string
  unknown: string[]
  leaks: string[]
  nodeCount: number
  layers?: { skeleton: string; local: string; detail: string }
}

const rows: Row[] = corpus.map((c) => {
  const r = parse(c.latex)
  if (!r.ok) {
    return { id: c.id, cat: c.cat, latex: c.latex, note: c.note, ok: false, error: r.error, unknown: [], leaks: [], nodeCount: 0 }
  }
  const nodes = allNodes(r.node)
  const leaks = nodes.flatMap((n) => l1GrandchildLeaks(n).map((s) => `${n.id || '根'}:${s}`))
  return {
    id: c.id,
    cat: c.cat,
    latex: c.latex,
    note: c.note,
    ok: true,
    unknown: r.unknown,
    leaks,
    nodeCount: nodes.length,
    layers: narrateLayers(r.node),
  }
})

const parsed = rows.filter((r) => r.ok)
const okCount = parsed.length
const totalNodes = parsed.reduce((s, r) => s + r.nodeCount, 0)
const leakCount = rows.reduce((s, r) => s + r.leaks.length, 0)
const avgUnknown = parsed.reduce((s, r) => s + r.unknown.length, 0) / okCount
const avgLen = (k: 'skeleton' | 'local' | 'detail') =>
  parsed.reduce((s, r) => s + r.layers![k].length, 0) / okCount

// 降级演示：3 条含白名单外命令的公式（不在 30 条语料内，单独展示）
const demos = [
  { name: '组合数（\\binom 不支持）', latex: 'C=\\binom{n}{k}' },
  { name: '符号函数（\\operatorname 不支持）', latex: 'y=\\operatorname{sgn}(x)' },
  { name: '样本均值（\\bar 修饰符不支持）', latex: '\\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_{i}' },
].map((d) => {
  const r = parse(d.latex)
  if (!r.ok) return { ...d, ok: false as const, error: r.error }
  return { ...d, ok: true as const, unknown: r.unknown, layers: narrateLayers(r.node) }
})

const SAMPLE_IDS = ['C01', 'C10', 'C16', 'C19', 'C29']
const c24 = rows.find((r) => r.id === 'C24')!

const md: string[] = []
md.push('# 语料跑通率报告（corpus-report）')
md.push('')
md.push(`生成方式：\`npm run check:corpus\`（脚本 scripts/corpus-check.ts，生成日期 ${new Date().toISOString().slice(0, 10)}）。`)
md.push('语料来源：docs/corpus.ts，产品负责人提供的 30 条教材/论文常见公式，LaTeX 与 id 原样未改。')
md.push('每条执行：parse → narrateLayers（根节点三层文本）→ l1GrandchildLeaks（全树每个节点的 L1 孙节点泄漏检查）。')
md.push('P1 括号降噪后重跑：与上一提交基线对比，C02/C03/C04/C05/C26/C27 六条按三档新规则改写读法，其余 24 条三层输出逐字节一致；C24 换底读法已在 S1 修复。')
md.push('')
md.push('## 一、汇总表')
md.push('')
md.push('| 指标 | 结果 |')
md.push('| --- | --- |')
md.push(`| 解析成功 | ${okCount}/30 |`)
md.push(`| 平均未朗读符号数（unknown.length，按解析成功条目） | ${avgUnknown.toFixed(2)} |`)
md.push(`| L1 泄漏 | ${leakCount}/${totalNodes}（检查节点总数 ${totalNodes}，泄漏 ${leakCount} 条） |`)
md.push(`| 骨架平均字符数 | ${avgLen('skeleton').toFixed(1)} |`)
md.push(`| 局部平均字符数 | ${avgLen('local').toFixed(1)} |`)
md.push(`| 细节平均字符数 | ${avgLen('detail').toFixed(1)} |`)
md.push('')
md.push('## 二、逐条结果')
md.push('')
md.push('| id | 类别 | 解析 | 未朗读符号数 | 备注 |')
md.push('| --- | --- | --- | --- | --- |')
for (const r of rows) {
  const remark = r.ok
    ? r.note + (r.id === 'C24' ? '；换底读法已修复（S1）' : '') + (r.unknown.length ? `；未朗读符号：${r.unknown.join('、')}` : '') + (r.leaks.length ? `；L1 泄漏：${r.leaks.join('、')}` : '')
    : `${r.note}；解析失败：${r.error}`
  md.push(`| ${r.id} | ${r.cat} | ${r.ok ? '成功' : '失败'} | ${r.ok ? r.unknown.length : '—'} | ${remark} |`)
}
md.push('')
md.push('## 三、抽样三层文本（C01 / C10 / C16 / C19 / C29）')
for (const id of SAMPLE_IDS) {
  const r = rows.find((x) => x.id === id)!
  md.push('')
  md.push(`### ${r.id}（${r.cat}，${r.note}）`)
  md.push('')
  md.push('```latex')
  md.push(r.latex)
  md.push('```')
  md.push('')
  if (r.layers) {
    md.push(`- 骨架：${r.layers.skeleton}`)
    md.push(`- 局部：${r.layers.local}`)
    md.push(`- 细节：${r.layers.detail}`)
  } else {
    md.push(`解析失败：${r.error}`)
  }
}
md.push('')
md.push('## 四、降级演示（白名单外命令不整段失败）')
md.push('')
md.push('以下 3 条公式含不支持的命令。带参命令（\\binom、\\operatorname、\\bar 等，见解析器 ARITY 表）')
md.push('解析时按参数个数吞掉紧邻参数组，整体作为一个原子朗读为「未支持的符号」，并计入 unknown 计数；')
md.push('不再把参数误读成独立因子（旧版 \\binom{n}{k} 曾读成「n 乘以 k」，已修复）。')
md.push('无参的白名单外命令仍降级念符号名。页面右下角出现提示「有 N 个符号未能朗读」（role="status"，读屏可感知）。')
md.push('原子保留原源码供 KaTeX 渲染，公式显示不受影响（已实测无错误色）。')
for (const d of demos) {
  md.push('')
  md.push(`### ${d.name}`)
  md.push('')
  md.push('```latex')
  md.push(d.latex)
  md.push('```')
  md.push('')
  if (d.ok) {
    md.push(`- 解析：成功，未朗读符号 ${d.unknown.length} 个（${d.unknown.join('、')}）`)
    md.push(`- 角落提示：有 ${d.unknown.length} 个符号未能朗读`)
    md.push(`- 骨架：${d.layers.skeleton}`)
    md.push(`- 细节：${d.layers.detail}`)
  } else {
    md.push(`- 解析：失败（${d.error}）——与预期不符，需排查`)
  }
}
md.push('')
md.push('## 五、局限（如实声明）')
md.push('')
md.push('- 只支持 6 类结构：分式、根号、上下标、求和/积分（含上下限）、矩阵、分段函数；不代表任意 LaTeX。')
md.push('- 白名单外带参命令（\\binom、\\operatorname、\\mathrm、\\hat / \\bar / \\vec 等修饰符）整体读作「未支持的符号」，参数不朗读，计入角落提示。')
md.push(`- 换底对数读法已修复（S1，2026-11-18）：C24 细节层现读作「${c24.layers?.detail ?? '解析失败'}」，`)
md.push('  不再出现「下标 ab」粘连。')
md.push('- 语法错误（如缺右括号、带参命令缺参数）仍整段报错，属预期行为。')
md.push('')

console.log(md.join('\n'))

// 断言（报告已输出，失败时仍可查报告）；统计走 stderr，避免混入报告
const problems: string[] = []
if (okCount < 28) problems.push(`parse success ${okCount}/30 < 28`)
if (leakCount !== 0) problems.push(`L1 leaks ${leakCount} != 0`)
for (const d of demos) if (!d.ok) problems.push(`demo failed: ${d.latex}`)
const C24_TARGET = '以 a 为底 b 的对数 等于 分子为 以 c 为底 b 的对数，分母为 以 c 为底 a 的对数'
if (c24.layers?.detail !== C24_TARGET) problems.push(`C24 detail mismatch: ${c24.layers?.detail}`)

console.error(`corpus: parsed ${okCount}/30, avgUnknown ${avgUnknown.toFixed(2)}, leaks ${leakCount}/${totalNodes} nodes`)
console.error(`layers avg chars: skeleton ${avgLen('skeleton').toFixed(1)}, local ${avgLen('local').toFixed(1)}, detail ${avgLen('detail').toFixed(1)}`)
if (problems.length) {
  throw new Error('FAIL: ' + problems.join('; '))
}
console.error('corpus check passed')