# 公式旁白 Formula Narrator

> 给视障学生的公式分层朗读器——先听骨架，再听细节。

**公开演示**：<https://formula-narrator-bqi2znhh2rs.qoder.zone>（Qoder Sites 部署，公开访问，无需登录、无需任何权限）
**参赛背景**：2026 Qoder 高校创造力大赛 · Hack4Good 技术向善赛道作品（无障碍方向）。

![1366×768 首屏：公式与三层朗读同屏](docs/screenshots/01-desktop-1366x768.png)

## 为什么做这个

屏幕阅读器（NVDA / 讲述人 / VoiceOver）读公式是一次性念完的一长串：听完记不住，想回听某一项只能从头再来。
MathSpeak / ClearSpeak 规范（SRE / MathCAT 实现）解决的是「把公式念成一句线性语音」；本项目不重写语音规则、不引入这两个依赖，只补它上面缺的三层能力：

1. **按结构寻址**：点名「分子」「第三项」「根号内」，而不是用方向键爬树；
2. **渐进披露**：同一节点先给骨架、再按需展开局部与细节，折叠状态不被切换重置；
3. **跨表达式比对**：两条公式差在哪，一句话说完。

明眼人也能用：核对一段推导里自己漏看了哪一项。

## 功能

- **六类结构做透**：分式、根号、上下标、求和/积分（含上下限）、矩阵、分段函数。
- **按节点三层朗读**：① 骨架（这是什么式子、由哪几块组成）→ ② 局部（每一块里有什么）→ ③ 细节（逐字听完完整表达式）。三层是同一节点的三种粒度，不是全局「简/中/详」档位；每层可独立播放，播放层即时高亮。
- **点选寻址**：公式任意子结构可点选、高亮，面包屑显示路径（如「等式 › 右边 › 分式 › 分子 › 根号」），点面包屑回上层；朗读区只读当前节点。
- **按结构点名**：全树结构清单缩进排列，键盘 Tab 可逐一点名；折叠开合状态在点选、回上层后保持。
- **钉住对比**：把当前公式记为基准，再改输入或换示例，自动给出一句差异句（覆盖符号翻转、指数变化、系数变化、增删一项）。
- **朗读稿**：纯文本可复制带走；关闭语音或浏览器无中文语音时，三层文本与朗读稿照常可读。
- **分享与示例**：状态写进 URL（`?f=...`），6 个预置示例一键切换，也可粘贴自己的 LaTeX。
- **宁可不读，也不读错**：带参未支持命令读作「未支持的符号」并计数提示；整式含不支持结构时降级为可查看渲染 + 友好说明，不瞎念。

## 无障碍与降级

- 键盘 Tab 走完主流程（点选、点名、播放、对比、粘贴），焦点可见；`aria-live` 播报选中与差异。
- 手机单栏、桌面两栏（右栏朗读 sticky），200% 缩放不破版；小目标有外扩热区。
- 语音走 Web Speech API（zh-CN），失败静默降级，绝不抛错、不阻塞页面。
- 不登录、不上传、不请求任何第三方服务；依赖全部本地打包，无 CDN。

## 快速开始

需要 Node ≥ 18。

```bash
npm install
npm run dev        # 开发服务器
npm run build      # tsc 类型检查 + 产出纯静态 dist/
npm run preview    # 预览构建产物
npm run check:parser   # 解析/朗读/差异自检（780 条断言）
npm run check:corpus   # 30 条教材语料跑通率，报告写入 docs/corpus-report.md
```

## 技术栈

Vite + React 18 + TypeScript + KaTeX，纯前端静态产物。
结构树不依赖 KaTeX AST：自写只覆盖六类结构的递归下降解析器（`src/lib/parser.ts`），节点 id 为路径串（根 `0`、子 `0.1`…），点选、面包屑、结构点名、差异比对共用同一棵树的寻址。

```
src/
  lib/          parser.ts 递归下降解析器（六类结构 + 降级）
                narrate.ts 按节点三层朗读文本
                diff.ts 双公式差异句
                address.ts 节点寻址 / 面包屑 / 结构索引
                renderTex.ts KaTeX 渲染映射与点选热区
                speak.ts Web Speech 封装（静默降级）
  components/   FormulaView / NarrationPanel / Breadcrumb / StructureList
  data/         presets.ts 六个预置示例
scripts/        parser-check.ts / corpus-check.ts 自检脚本
docs/           规则表、验收证据、语料报告、截图
```

## 文档与证据

| 文档 | 内容 |
| --- | --- |
| [docs/rules.md](docs/rules.md) | 六类结构「骨架 / 局部 / 细节」句模板，附与 ClearSpeak 表述逐条对照 |
| [docs/evidence.md](docs/evidence.md) | 验收逐条实测（一屏、键序、sticky、降级、200% 缩放）＋ 30 条测试公式结果 |
| [docs/corpus-report.md](docs/corpus-report.md) | 30 条教材/论文语料跑通率与三层文本泄漏检查 |
| [docs/robustness-report.md](docs/robustness-report.md) | 粘贴韧性与读屏稳健性专项 |
| [docs/screenshots/](docs/screenshots/) | 桌面首屏 / 点选 / 播放高亮 / sticky / 平板 / 移动 / 降级七张实测截图 |
