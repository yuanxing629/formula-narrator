// 零依赖浏览器验收探针：headless Chrome + CDP（Node 内置 WebSocket）。
// 用法：node scripts/browser-probe.mjs <url> <layout|full> [截图目录]
// layout：插桩渲染 vs 原始渲染的宽度/分数线/根号位置差 + 375px 点选与溢出
// full：console 报错、桌面点选、语音发起、375px 点选与溢出、SW 离线刷新
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const url = process.argv[2]
const mode = process.argv[3] ?? 'full'
const shotDir = process.argv[4] ?? ''
const port = 9333
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-probe-'))
const child = spawn(
  CHROME,
  [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1280,900',
    '--window-position=0,0',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitDevtools() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (r.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('DevTools 未就绪')
}
await waitDevtools()
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let seq = 0
const pending = new Map()
const consoleErrors = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
  if (msg.method === 'Runtime.exceptionThrown')
    consoleErrors.push(JSON.stringify(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text))
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails))
  return r.result.result.value
}
const waitSelector = async (sel, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(`!!document.querySelector(${JSON.stringify(sel)})`)) return
    await sleep(200)
  }
  throw new Error('等待选择器超时 ' + sel)
}
const shot = async (name) => {
  if (!shotDir) return
  const r = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(shotDir, { recursive: true })
  fs.writeFileSync(path.join(shotDir, name), Buffer.from(r.result.data, 'base64'))
}
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(150)
}
const clickNode = async (id, fx = 0.5, fy = 0.5) => {
  const r = await evalJs(
    `(() => { const e = document.querySelector('[data-node="${id}"]'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width * ${fx}, y: b.y + b.height * ${fy} }; })()`,
  )
  if (!r) throw new Error('节点不存在 ' + id)
  await sleep(120)
  const r2 = await evalJs(
    `(() => { const b = document.querySelector('[data-node="${id}"]').getBoundingClientRect(); return { x: b.x + b.width * ${fx}, y: b.y + b.height * ${fy} }; })()`,
  )
  await clickAt(r2.x, r2.y)
}
const state = () =>
  evalJs(
    `JSON.stringify({ sel: [...document.querySelectorAll('.fn-selected')].map(e => e.getAttribute('data-node')), crumbs: [...document.querySelectorAll('.breadcrumb .crumb')].map(e => e.textContent), layers: [...document.querySelectorAll('.layer-text')].map(e => e.textContent), tiny: [...document.querySelectorAll('.fn-tiny')].map(e => e.getAttribute('data-node')), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })`,
  )

await send('Page.enable')
await send('Runtime.enable')
const out = {}
try {
  await send('Page.navigate', { url })
  await waitSelector('.formula-view .katex-html')
  await sleep(400)

  if (mode === 'layout') {
    // 插桩渲染克隆进 shrink-wrap 容器，与原始 LaTeX 渲染（同源 iframe 引入 KaTeX）对比
    out.layout = await evalJs(`(async () => {
      const rel = (root, sel) => { const e = root.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const b = root.getBoundingClientRect(); return { x: +(r.x - b.x).toFixed(2), y: +(r.y - b.y).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
      const clone = document.createElement('div');
      clone.id = 'fn-clone';
      clone.style.cssText = 'position:fixed;left:0;top:0;display:inline-block;font-size:1.25rem;background:#fff;z-index:9999';
      clone.innerHTML = document.querySelector('.formula-view').innerHTML;
      document.body.appendChild(clone);
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:0;top:120px;width:700px;height:200px;border:0;background:#fff;z-index:9999';
      f.src = 'about:blank';
      document.body.appendChild(f);
      const d = f.contentDocument;
      d.open();
      d.write('<link rel="stylesheet" href="/@fs/E:/Job/code/formula-narrator/node_modules/katex/dist/katex.min.css"><div id="p" style="display:inline-block;font-size:1.25rem"></div>');
      d.close();
      const tex = "x=\\\\frac{-b\\\\pm\\\\sqrt{b^{2}-4ac}}{2a}";
      const s = d.createElement('script');
      s.type = 'module';
      s.textContent = 'import k from "/@fs/E:/Job/code/formula-narrator/node_modules/katex/dist/katex.mjs"; document.getElementById("p").innerHTML = k.renderToString(' + JSON.stringify(tex) + ', {displayMode:true, strict:"ignore", output:"htmlAndMathml", throwOnError:false}); window.__done = true;';
      d.body.appendChild(s);
      for (let i = 0; i < 80 && !f.contentWindow.__done; i++) await new Promise(r => setTimeout(r, 60));
      await document.fonts.ready;
      await f.contentDocument.fonts.ready;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const plain = d.getElementById('p');
      const wrapped = { width: +clone.getBoundingClientRect().width.toFixed(2), fracLine: rel(clone, '.frac-line'), sqrt: rel(clone, '.sqrt') };
      const plainM = { width: +plain.getBoundingClientRect().width.toFixed(2), fracLine: rel(plain, '.frac-line'), sqrt: rel(plain, '.sqrt') };
      const dbg = { done: !!f.contentWindow.__done, pLen: plain.innerHTML.length, err: plain.querySelector('.katex-error')?.textContent || null };
      return JSON.stringify({ wrapped, plain: plainM, widthDiff: +(wrapped.width - plainM.width).toFixed(2), dbg });
    })()`)
    await shot('m2-layout-compare.png')
    await evalJs(`document.getElementById('fn-clone')?.remove(); [...document.querySelectorAll('iframe')].forEach(f => f.remove()); 'ok'`)
  }

  // 桌面点选：根号 → 面包屑与只读该节点；分母 → 不误选外层
  out.hitDebug = await evalJs(
    `(() => { const e = document.querySelector('[data-node="0.2.0.3"]'); e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2; const el = document.elementFromPoint(x, y); return JSON.stringify({ x, y, hit: el?.closest('[data-node]')?.getAttribute('data-node'), tag: el?.tagName }); })()`,
  )
  await clickNode('0.2.0.3', 0.08)
  out.clickSqrt = JSON.parse(await state())
  out.denHit = await evalJs(
    `(() => { const e = document.querySelector('[data-node="0.2.1"]'); e.scrollIntoView({ block: 'center' }); const two = e.querySelector('.mord'); const r = two.getBoundingClientRect(); const x = r.x+r.width/2, y = r.y+r.height/2; const stack = document.elementsFromPoint(x,y).slice(0,8).map(el => ({ tag:el.tagName, cls:(el.className||'').toString().slice(0,30), node:el.getAttribute&&el.getAttribute('data-node'), pe:getComputedStyle(el).pointerEvents })); return JSON.stringify({ x:+x.toFixed(1), y:+y.toFixed(1), stack }); })()`,
  )
  await clickNode('0.2.1')
  out.clickDen = JSON.parse(await state())
  out.speech = await evalJs(
    `(async () => { if (!('speechSynthesis' in window)) return JSON.stringify({ api: false }); for (let i = 0; i < 20 && !speechSynthesis.getVoices().length; i++) await new Promise(r => setTimeout(r, 100)); const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('zh')).length; let started = false; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance('测试'); u.lang = 'zh-CN'; speechSynthesis.speak(u); await new Promise(r => setTimeout(r, 200)); started = speechSynthesis.speaking || speechSynthesis.pending; speechSynthesis.cancel(); } catch {} return JSON.stringify({ api: true, voices, speakStarted: started }); })()`,
  )
  await shot('m2-desktop.png')

  // 375px 移动视口：点选根号/分母/指数（fn-tiny 热区），无横向溢出
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url })
  await waitSelector('.formula-view .katex-html')
  await sleep(400)
  out.mobileHit = await evalJs(
    `(() => { const probe = (id, fx, fy) => { const e = document.querySelector('[data-node="'+id+'"]'); if(!e) return null; const b = e.getBoundingClientRect(); const x=b.x+b.width*fx, y=b.y+b.height*fy; const el=document.elementFromPoint(x,y); return { node: el?.closest('[data-node]')?.getAttribute('data-node'), cls:(el?.className||'').toString().slice(0,20) }; }; const exp = document.querySelector('[data-node="0.2.0.3.0.0.1"]'); const er = exp.getBoundingClientRect(); const ex=er.x+er.width/2, ey=er.y+er.height/2; const stack = document.elementsFromPoint(ex,ey).slice(0,6).map(el=>({cls:(el.className||'').toString().slice(0,24),node:el.getAttribute&&el.getAttribute('data-node'),pe:getComputedStyle(el).pointerEvents})); return JSON.stringify({ sqrtLeft: probe('0.2.0.3',0.06,0.5), sqrtCenter: probe('0.2.0.3',0.5,0.5), expRect:{x:+er.x.toFixed(1),y:+er.y.toFixed(1),w:+er.width.toFixed(1),h:+er.height.toFixed(1)}, expStack: stack }); })()`,
  )
  await clickNode('0.2.0.3', 0.08)
  out.mobileSqrt = JSON.parse(await state())
  await clickNode('0.2.1')
  out.mobileDen = JSON.parse(await state())
  await clickNode('0.2.0.3.0.0.1')
  out.mobileExp = JSON.parse(await state())
  await shot('m2-mobile-375.png')
  await send('Emulation.clearDeviceMetricsOverride')

  if (mode === 'full') {
    // SW 离线：先在线刷新一次让缓存落盘，再断网刷新
    out.sw = await evalJs(
      `(async () => { if (!('serviceWorker' in navigator)) return JSON.stringify({ registered: false }); const reg = await navigator.serviceWorker.ready; for (let i = 0; i < 40 && !navigator.serviceWorker.controller; i++) await new Promise(r => setTimeout(r, 100)); return JSON.stringify({ registered: true, controlled: !!navigator.serviceWorker.controller, scope: reg.scope }); })()`,
    )
    await send('Page.navigate', { url })
    await waitSelector('.formula-view .katex-html')
    await sleep(600)
    out.cache = await evalJs(
      `(async () => { const keys = await caches.keys(); const hit = []; for (const k of keys) { const c = await caches.open(k); const reqs = await c.keys(); hit.push(...reqs.map(r => r.url)); } return JSON.stringify({ keys, count: hit.length, hasDoc: hit.some(u => new URL(u).pathname === new URL(location.href).pathname || new URL(u).pathname === '/'), hasJs: hit.some(u => u.endsWith('.js')), hasCss: hit.some(u => u.endsWith('.css')) }); })()`,
    )
    await send('Network.enable')
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    await send('Page.reload')
    await sleep(2500)
    out.offline = JSON.parse(await state())
    out.offlineTitle = await evalJs(`document.title`)
    await shot('m2-offline.png')
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  }
  out.consoleErrors = consoleErrors
  console.log(JSON.stringify(out, null, 2))
} finally {
  ws.close()
  child.kill()
  await sleep(800)
  try {
    fs.rmSync(profile, { recursive: true, force: true })
  } catch {
    /* 临时 profile 被占用时留给系统清理 */
  }
}