# M2.1 缺陷修复 + 首次部署 验收报告

日期：2026-11-18
范围：仅 A（四个缺陷修复）、B（首次部署 + 三端验证）、C（本归档）。未做 M4 差异朗读、结构大纲、选中态深链；未引入新依赖；未改朗读模板文案。
节点自检：`npm run check:parser` 共 **334 条断言，全部通过**。

## A. 四个缺陷修复

| 项 | 缺陷 | 修复 | 验收断言/实测 | 结果 |
| --- | --- | --- | --- | --- |
| A1 | 骨架层对「底数/指数皆原子」的幂只说「一个幂」，比 L1 空 | `shortType` 的 scripts 分支改为 `scriptsConcrete(n) ?? '一个幂'`（L0 只能比 L1 粗、不能比 L1 空） | 勾股 L0 含「c 的平方」且不含「一个幂」；`y=x^{n+1}`（指数非原子）仍报「一个幂」（固化例外）；求和节点 L0 含「求和项是i 的平方」 | 通过 |
| A2 | 矩阵乘法病句「一个两行两列矩阵等相乘」 | `termDesc` 按因子个数出词：同类型→「N个类型词相乘」；两因子→「A 乘以 B」；>2 混合→「N个因子相乘」 | 矩阵乘 L0 含「两个两行两列矩阵相乘」且无「等相乘」；L1 无「是一个…相乘」病句；混合两因子「一个两行两列矩阵 乘以 一个分式」；三因子「三个因子相乘」；同类型三因子「三个一行一列矩阵相乘」；7 公式全节点×三层无「等相乘」 | 通过 |
| A3 | JS padding 撑宽嵌套结构改变排版；分母/指数点选误选外层 | 删除全部 JS padding；`[data-node]` 仅 `position:relative`+`pointer-events:auto`；KaTeX `.vlist-t/.vlist-r/.vlist` 设 `pointer-events:none` 穿透（table-cell 盖在小号内联字形上拦截点击）；`fn-tiny` 只标**叶子**小节点（宽<24px 且无 `[data-node]` 后代），`::after{inset:-0.4em}` 外扩热区（祖先 ::after 会盖住后代小目标） | 插桩 vs 原始渲染 `.katex` 宽度差 **0px**；分数线 x/w、根号 x/y/w/h 一致；点 √ 符号→根号、点分母→分母、点指数→指数，桌面/移动均不误选外层 | 通过 |
| A4 | (i) 文档 G9「仅在括号改变优先级时读」与实现不符；(ii) `parts()` 把 `(a+b)c` 切成两项 | (i) **改文档不改实现**：G9 改为「除函数调用外其余括号一律读」；(ii) `parts()` 维护 parenDepth，仅在深度 0 切项/识别连接号 | `(a+b)c` L0 报「一项」非「两项」；`(a+b)c+d` 仍「两项」；`\frac{(a+b)}{2}` L0「分子一项」、L2「分子为 左括号 a 加 b 右括号，分母为 二」；`(a\pm b)c`「一项」；334 断言全绿 | 通过 |

### 修复前后文本对照（各一对）

- **A1** 勾股 L0
  - 前：`等式：左边两项，含两个平方项，右边一个幂。`
  - 后：`等式：左边两项，含两个平方项，右边c 的平方。`
- **A2** 矩阵乘 L0
  - 前：`等式：左边一个两行两列矩阵等相乘，右边一个两行两列矩阵。`
  - 后：`等式：左边两个两行两列矩阵相乘，右边一个两行两列矩阵。`
- **A3** 点分母的面包屑（命中）
  - 前：`等式 › 右边 › 分式`（误选外层分式，sel=0.2）
  - 后：`等式 › 右边 › 分式 › 分母`（sel=0.2.1）
- **A4** `(a+b)c` L0
  - 前：`表达式：两项。`
  - 后：`表达式：一项。`

### A3 排版不变实测（浏览器配对测量）

同一公式「插桩渲染（htmlData 包裹）」与「原始 LaTeX 直接渲染」：

- `.katex` 容器宽度：插桩 215.91px = 原始 215.91px，**宽度差 0px**（验收 <2px）。
- 分数线 `.frac-line`：x=49、w=164.02 两者完全一致；y/h 差 1px（51.92/1 vs 50.92/2），为 KaTeX 自身 strut 的亚像素舍入，非插桩引入。
- 根号 `.sqrt`：x=107.8、y=20.11、w=105.22、h=29 两者完全一致。
- 节点侧断言：插桩渲染的 style 集合 ⊆ 原始渲染 style 集合（不新增任何样式）。
- 截图：`docs/img/m2-layout-compare.png`（上：插桩克隆；中：iframe 原始渲染；下：应用渲染区）。

## B. 首次部署（Qoder Sites，公开访问）

- 平台：Qoder Sites，纯静态产物，无后端/数据库/函数/密钥。
- 构建命令：`npm run build`；产物目录：`dist`（含 `index.html`、`assets/`、`sw.js`）。
- `vite.config.ts` `base:'./'`（相对路径，可部署任意子路径）。
- 外部请求扫描：`dist/index.html` 与 `dist/assets/*.css` 中 `src|href="http(s)://"` 计数 **0**；JS 中仅 XML 命名空间常量与 React 错误文案 URL（运行时不发起请求）；KaTeX 字体全部本地打包（`assets/KaTeX_*.woff2/woff/ttf`）。无 CDN、无第三方运行时 API。
- 公开 URL：**https://formula-narrator-bqi2znhh2rs.qoder.zone**
- 访问模式：`public`，`auth_integration_status=not_required`（评委点开即用，无需登录/权限）。
- 部署日期：2026-11-18；发布状态 `published=true`、`readiness=publication_completed`。

### B3 三端验证（逐条）

| 端 | 方法 | 结果 |
| --- | --- | --- |
| (1) 无痕桌面 | 系统 Chrome headful + **全新临时 profile**（无 cookie/缓存，等价无痕），CDP 自动化，1280×900，打开公开 URL | 渲染正常；点根号 sel=0.2.0.3（面包屑 等式›右边›分式›分子›根号）、点分母 sel=0.2.1；语音 `api=true, zh voices=6, speakStarted=true`；console 错误 **0** |
| (2) 手机 | Chrome DevTools `Emulation` 375×812、deviceScaleFactor=2、mobile=true（**无真机，模拟等价，如实记录**） | 点根号 0.2.0.3、分母 0.2.1、指数 0.2.0.3.0.0.1 均正确；**无横向溢出**（scrollWidth=clientWidth=375）；骨架文本可读 |
| (3) 断网刷新 | 先在线刷新使 SW 缓存落盘（`fn-static-v1`，含 doc/js/css），再 `Network.emulateNetworkConditions offline` + `Page.reload` | SW `registered=true, controlled=true`；断网后页面**完整打开**：标题「公式旁白」、三步引导、示例按钮、默认公式渲染、三层文本可读；console 错误 0 |

截图：`docs/img/m2-desktop.png`、`docs/img/m2-mobile-375.png`、`docs/img/m2-offline.png`。

### 验证环境如实说明

- 无真实手机：移动端以 375×812 DevTools 模拟等价验证（点击、溢出、热区）。
- 无痕以「全新临时 Chrome profile」等价（无 cookie/缓存/扩展）。
- 语音「能出声」以 headful Chrome 的 Web Speech API 发起证据（zh 语音 6 个、`speakStarted=true`）记录；人耳逐条试听另见 `docs/listening-check.md`。headless 环境无语音属预期，已按静默降级处理。

## C. 归档

- 本报告：`docs/m2-report.md`。
- `docs/m1-revision-report.md` 顶部已加「（历史记录，已被 M2 覆盖）」。
- 未删除任何旧文档。