# 括号降噪 + 粘贴韧性报告（P1 / P2）

生成日期：2026-11-18。验证命令：`npm run check:parser`（712 条断言）、`npm run check:corpus`（30 条语料）、`npx tsc -b`；浏览器实测见第五节。
本报告对应任务「括号降噪 + 粘贴韧性」，边界：只改朗读拼接（P1）与解析/降级（P2），不改差异算法、不改 6 个示例的语义、不改部署。

## 一、P1 括号降噪三档规则

同一对圆括号按语境分三档处理（实现见 src/lib/narrate.ts 的 findSpan / nominalOf / readSpan）：

| 档位 | 触发条件 | 读法 |
| --- | --- | --- |
| 1 不读 | 整式最外层、分式分子/分母整体、分段条件整体、函数参数（原有） | 直接读内部，如 `(a+b)` → 「a 加 b」 |
| 2 名词化 | 乘/除/幂位置的两项组（和、差、积、商），且名词化文本通顺 | `(a+b)^{2}` → 「a 与 b 的和 的平方」；`(a+b)(a-b)` → 「a 与 b 的和 乘以 a 与 b 的差」；`1/(1-x)` → 「一 除以 一 与 x 的差」 |
| 3 保留 | 嵌套 ≥2 层、≥3 项、一元负号后、减号后、名词化不通顺 | 「左括号 … 右括号」 |

安全约束：第 1 档只在语义有界语境生效；`-(a+b)` 读「负 左括号 a 加 b 右括号」、`c-(a+b)` 读「c 减 左括号 a 加 b 右括号」，避免丢括号改语义。

验收句（细节层原文）：
- C03 `(a+b)^{2}=a^{2}+2ab+b^{2}` → 「a 与 b 的和 的平方 等于 a 的平方 加 二ab 加 b 的平方」（无「左括号」）
- C26 `A=P(1+\frac{r}{n})^{nt}` → 「A 等于 P 乘以 一 与 n分之r 的和 的 nt 次方」（无「左括号」）
- `(a+(b+c))d` → 「左括号 a 加 左括号 b 加 c 右括号 右括号 d」（保留）

变更范围（与上一提交基线逐字节对比三层输出）：语料仅 C02、C03、C04、C05、C26、C27 六条变化；C14（d/dx(x^n)）、C19（P(A|B)）、C20（E(X)）等函数应用记法不受影响。6 个预置示例语义未改，朗读随新规则自动更新（如平方和示例分子读「n 乘以 n 与 一 的和 乘以 二n 与 一 的和」）。

### 退化用例清单（名词化不通顺 → 回退第 3 档）

判定规则：名词化文本含「，；：」或「左括号」即视为不通顺，回退保留括号。实测构造：

| 公式 | 细节层读法 | 退化原因 |
| --- | --- | --- |
| `(a+\begin{pmatrix}1\end{pmatrix})d` | 左括号 a 加 一行一列矩阵：第一行 一 右括号 d | 矩阵读法含冒号 |
| `(a+\begin{cases}1, & x>0\\ 0, & x<0\end{cases})d` | 左括号 a 加 分段表达式：当 x 大于 零 时，值为 一；当 x 小于 零 时，值为 零 右括号 d | 分段读法含冒号、分号 |
| `(\frac{a+b}{c}+d)e` | 左括号 分子为 a 加 b，分母为 c 加 d 右括号 e | 非单原子分子的分式读法含逗号 |

对照：`(\sqrt{a}+b)c` 名词化通顺，读「根号下 a 与 b 的和 乘以 c」，不退化。

## 二、P2-a 解析失败降级渲染

行为：解析失败时渲染区把**原始 LaTeX 直接交 KaTeX**（不插桩、不可点选），不再显示「公式渲染失败」空白；朗读区显示「该公式含暂不支持的结构，可查看但不能朗读。」并附原因（解析器错误原文）。钉住对比按钮在解析失败时禁用。

验收：`\begin{aligned}a&=b\\ c&=d\end{aligned}` 浏览器实测渲染出 a=b、c=d 两行公式本体；朗读区显示友好句 + 原因「不支持的环境：aligned（仅支持矩阵族与 cases）」。截图见 node_modules/.cache/p2-aligned.png（临时证据，不入库）。

## 三、P2-b / P2-c 白名单与吞参表扩充

- 符号白名单 **206 条**（原 87 条）。新增分组：希腊字母变体与补全 25（varepsilon varphi chi psi rho tau nu xi zeta eta kappa epsilon upsilon phi iota vartheta varrho varsigma varpi 及大写 Theta Pi Phi Psi Xi Upsilon）；关系 8（ll gg leqslant geqslant lesssim gtrsim asymp doteq）；集合与定界符 13（subsetneq supsetneq setminus mid nmid langle rangle lfloor rfloor lceil rceil dagger complement）；箭头 15（长箭头族、上下箭头、四向箭头、hookrightarrow、rightharpoonup）；大运算符符号 13（bigcup bigcap iint iiint oint oiint bigoplus bigotimes bigodot bigvee bigwedge bigsqcup coprod，按符号读、不做上下限结构解析）；函数名 23（det dim gcd max min sup inf arcsin arccos arctan sinh cosh tanh cot sec csc coth arg deg hom ker limsup liminf Pr）；其它 19（hbar ell Re Im aleph beth wp top bot vdash models simeq bowtie lvert rvert lVert rVert backslash colon）；间距 2（quad qquad，朗读静默）。全部新增符号配中文读音（src/lib/narrate.ts ATOM_READ）。
- 透明命令（tokenizer 跳过，不计未知）：left right limits nolimits displaystyle textstyle scriptstyle scriptscriptstyle。
- 转义字面符按普通字符解析并读音：`\%`→百分号、`\{`→左花括号、`\}`→右花括号、`\$`→美元符号、`\#`→井号、`\&`→和号、`\_`→下划线。
- 带参未支持命令吞参表 **26 条**：binom(2)、operatorname、mathrm、mathbf、mathbb、mathcal、text、textbf、hat、bar、vec、dot、ddot、tilde、widehat、widetilde、overline、underline、boxed、phantom、hbox、substack、color(以上 1)、overset、underset、stackrel(以上 2)。吞参容忍参数内的 `&` 与 `\\`（多行 \substack 不再整段解析失败）；整体读「未支持的符号」并计入角落计数；value 保留原源码供 KaTeX 渲染。
- 验收：`y=\text{当 x 大于零}` 细节层 = 「y 等于 未支持的符号」，不出现「t e x t」逐字拼读；角落提示「有 1 个符号未能朗读」；公式正常渲染。

## 四、随机 10 条真实公式粘贴测试

逐条 parse 并记录 unknown（未朗读符号）数，明细同步固化在 scripts/parser-check.ts 的 RANDOM10 断言块（中位数 ≤2 为断言）。

| 编号 | 公式 | LaTeX | 未朗读数 |
| --- | --- | --- | --- |
| R01 | ε-δ 定义 | `\forall \varepsilon>0,\ \exists \delta>0,\ |x-a|<\delta \Rightarrow |f(x)-f(a)|<\varepsilon` | 0 |
| R02 | 欧拉恒等式 | `e^{i\pi}+1=0` | 0 |
| R03 | 高斯积分 | `\int_{-\infty}^{\infty} e^{-x^{2}} dx=\sqrt{\pi}` | 0 |
| R04 | 贝叶斯公式 | `P(A\mid B)=\frac{P(B\mid A)P(A)}{P(B)}` | 0 |
| R05 | 柯西-施瓦茨 | `\left(\sum_{i=1}^{n} a_i b_i\right)^{2} \leq \left(\sum_{i=1}^{n} a_i^{2}\right)\left(\sum_{i=1}^{n} b_i^{2}\right)` | 0 |
| R06 | 取整不等式 | `\lfloor x \rfloor \leq x < \lceil x \rceil` | 0 |
| R07 | 行列式乘法 | `\det(AB)=\det(A)\det(B)` | 0 |
| R08 | 公约数公倍数 | `\gcd(a,b)\cdot \mathrm{lcm}(a,b)=ab` | 1（mathrm） |
| R09 | 正态密度 | `f(x)=\frac{1}{\sigma\sqrt{2\pi}} e^{-\frac{(x-\mu)^{2}}{2\sigma^{2}}}` | 0 |
| R10 | 二项式定理 | `(a+b)^{n}=\sum_{k=0}^{n} \binom{n}{k} a^{k} b^{n-k}` | 1（binom） |

未朗读数序列：0,0,0,0,0,0,0,1,0,1 → **中位数 0**（验收要求 ≤2）。

## 五、验证汇总

- `npx tsc -b`：0 错误。
- `npm run check:parser`：**712 条断言全过**（原 608 条 + P2 新增 104 条；P1 阶段 5 条旧行为断言按新行为改写、未删除）。
- `npm run check:corpus`：30/30 解析成功，L1 孙节点泄漏 0/606，平均未朗读 0.00；docs/corpus-report.md 已同步重生成（引言注明 P1 变更范围）。
- 浏览器实测（Vite dev + 内置浏览器）：① aligned 降级渲染出公式本体、朗读区友好句+原因；② `\text{当 x 大于零}` 三层读「未支持的符号」、角落计数 1；③ 平方和示例细节层出现名词化读法、无角落提示；④ 粘贴 ε-δ 公式渲染与三层朗读正常、无角落提示。四页均无控制台报错、无空白公式。

## 六、已知局限

1. 结构仍只覆盖 6 类；aligned、array 等环境可查看（降级渲染）但不能朗读、不能点选。
2. 吞参表内命令整体读「未支持的符号」并计数（如 \mathrm{lcm}、\binom），不朗读其参数内容。
3. 既有解析局限（非本次引入）：求和/积分的被积式在括号内遇减号即终止，C21 与 R05 的括号嵌套求和朗读范围不准确；未朗读计数不受影响。
4. `\mid` 统一读「给定」（概率语境优先）；集合构造式 `{x \mid x>0}` 中亦读「给定」而非「使得」。
5. 大运算符符号（bigcup、iint 等）按符号名读，不做上下限结构解析。
6. 多行 \substack 整体吞为「未支持的符号」，其内部条件不朗读。
7. 名词化退化用例见第一节清单；退化即回退保留括号，不产生错读。