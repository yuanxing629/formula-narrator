// 30 条教材/论文常见公式，用于跑通率与降级统计（docs/corpus-report.md）
// 每条：id / 类别 / latex / 关注的考察点
export const corpus = [
  // 代数
  { id: 'C01', cat: '代数', latex: 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}', note: '分式+根号+加减号' },
  { id: 'C02', cat: '代数', latex: 'a^{2}-b^{2}=(a+b)(a-b)', note: '括号因子' },
  { id: 'C03', cat: '代数', latex: '(a+b)^{2}=a^{2}+2ab+b^{2}', note: '括号的幂' },
  { id: 'C04', cat: '代数', latex: 'a^{3}+b^{3}=(a+b)(a^{2}-ab+b^{2})', note: '立方' },
  { id: 'C05', cat: '代数', latex: 'y=a(x-h)^{2}+k', note: '顶点式' },
  { id: 'C06', cat: '代数', latex: '\\frac{a^{m}}{a^{n}}=a^{m-n}', note: '指数含减法' },

  // 三角
  { id: 'C07', cat: '三角', latex: '\\sin^{2}\\theta+\\cos^{2}\\theta=1', note: '函数带指数' },
  { id: 'C08', cat: '三角', latex: '\\tan\\theta=\\frac{\\sin\\theta}{\\cos\\theta}', note: '函数作分子' },
  { id: 'C09', cat: '三角', latex: '\\sin(\\alpha+\\beta)=\\sin\\alpha\\cos\\beta+\\cos\\alpha\\sin\\beta', note: '长式子' },

  // 微积分
  { id: 'C10', cat: '微积分', latex: '\\int_{0}^{1}x^{2}\\,dx=\\frac{1}{3}', note: '定积分+微分' },
  { id: 'C11', cat: '微积分', latex: '\\int_{-\\infty}^{\\infty}e^{-x^{2}}\\,dx=\\sqrt{\\pi}', note: '无穷上下限' },
  { id: 'C12', cat: '微积分', latex: '\\frac{dy}{dx}=\\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}', note: '极限+趋于' },
  { id: 'C13', cat: '微积分', latex: '\\sum_{n=0}^{\\infty}x^{n}=\\frac{1}{1-x}', note: '几何级数' },
  { id: 'C14', cat: '微积分', latex: '\\frac{d}{dx}(x^{n})=nx^{n-1}', note: '求导' },

  // 线性代数
  { id: 'C15', cat: '线代', latex: '\\begin{vmatrix}a & b\\\\ c & d\\end{vmatrix}=ad-bc', note: '行列式' },
  { id: 'C16', cat: '线代', latex: '\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}\\begin{pmatrix}x\\\\ y\\end{pmatrix}=\\begin{pmatrix}x+2y\\\\ 3x+4y\\end{pmatrix}', note: '矩阵乘法' },
  { id: 'C17', cat: '线代', latex: 'A^{-1}=\\frac{1}{|A|}\\begin{pmatrix}d & -b\\\\ -c & a\\end{pmatrix}', note: '逆矩阵' },
  { id: 'C18', cat: '线代', latex: '\\begin{cases}2x+y=3\\\\ x-y=0\\end{cases}', note: '方程组复用 cases' },

  // 概率统计
  { id: 'C19', cat: '概率', latex: 'P(A|B)=\\frac{P(B|A)P(A)}{P(B)}', note: '贝叶斯' },
  { id: 'C20', cat: '概率', latex: 'E(X)=\\sum_{i=1}^{n}x_{i}p_{i}', note: '期望' },
  { id: 'C21', cat: '概率', latex: '\\sigma^{2}=\\frac{1}{n}\\sum_{i=1}^{n}(x_{i}-\\mu)^{2}', note: '方差' },

  // 其它常见
  { id: 'C22', cat: '综合', latex: 'e^{i\\pi}+1=0', note: '欧拉公式' },
  { id: 'C23', cat: '综合', latex: '(A\\cup B)^{c}=A^{c}\\cap B^{c}', note: '集合德摩根' },
  { id: 'C24', cat: '综合', latex: '\\log_{a}b=\\frac{\\log_{c}b}{\\log_{c}a}', note: '换底（已知弱项）' },
  { id: 'C25', cat: '综合', latex: '\\frac{a+b}{2}\\geq\\sqrt{ab}', note: '均值不等式' },
  { id: 'C26', cat: '综合', latex: 'A=P(1+\\frac{r}{n})^{nt}', note: '复利' },
  { id: 'C27', cat: '综合', latex: 'a_{n}=a_{1}+(n-1)d', note: '等差数列' },

  // 分段与根式
  { id: 'C28', cat: '分段', latex: '|x|=\\begin{cases}x, & x\\geq 0\\\\ -x, & x<0\\end{cases}', note: '绝对值' },
  { id: 'C29', cat: '分段', latex: 'f(x)=\\begin{cases}1, & x>0\\\\ 0, & x=0\\\\ -1, & x<0\\end{cases}', note: '三段' },
  { id: 'C30', cat: '根式', latex: 'c=\\sqrt[3]{a^{3}+b^{3}}', note: '三次根式' },
]