const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const listP = () => fetch("http://127.0.0.1:9282/json/list").then((r) => r.json());
async function connect(id) {
  const t = (await listP()).find((x) => x.id === id);
  const w = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { w.onopen = res; w.onerror = rej; });
  let n = 1; const pending = new Map(); const events = [];
  w.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  });
  const ev = (expr, ms) => new Promise((res) => {
    const id2 = n++; pending.set(id2, res);
    w.send(JSON.stringify({ id: id2, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true } }));
    setTimeout(() => { if (pending.has(id2)) { pending.delete(id2); res({ timeout: true }); } }, ms || 8000);
  });
  await ev("1", 5000);
  return { w, ev, events };
}
const state = (sel) => `(() => ({
  theme: document.documentElement.dataset.theme,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  cardBg: getComputedStyle(document.querySelector(${JSON.stringify(sel)})).backgroundColor,
  sunShown: getComputedStyle(document.querySelector(".ico-sun")).display,
  moonShown: getComputedStyle(document.querySelector(".ico-moon")).display,
  upS: document.getElementById("up-s") ? document.getElementById("up-s").textContent : "n/a",
  springD: document.getElementById("sp-d") ? document.getElementById("sp-d").textContent : "n/a",
  hito: document.getElementById("hitokoto") ? document.getElementById("hitokoto").textContent : ""
}))()`;

async function main() {
  // 1) home: dark pref -> reload -> dark
  let c = await connect((await listP()).find((x) => x.url.includes("home.html")).id);
  await wait(4000);
  await c.ev(`localStorage.setItem("yaolin-theme","dark"); location.reload(); 1`, 6000);
  await wait(7000);
  const d1 = await c.ev(state(".live-card"), 8000);
  console.log("HOME dark-restore:", JSON.stringify(d1.result && d1.result.result ? d1.result.result.value : d1));
  await c.ev(`document.getElementById("theme-toggle").click(); 1`, 5000);
  await wait(600);
  const d2 = await c.ev(`(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem("yaolin-theme") }))()`, 5000);
  console.log("HOME toggle->light:", JSON.stringify(d2.result && d2.result.result ? d2.result.result.value : d2));
  console.log("HOME exceptions:", c.events.filter((m) => m.method === "Runtime.exceptionThrown").length);
  try { c.w.close(); } catch (e) {}

  // 2) friends: dark
  const fid = (await fetch("http://127.0.0.1:9282/json/new?" + encodeURIComponent("http://127.0.0.1:8017/friends.html"), { method: "PUT" }).then((x) => x.json())).id;
  const t0 = Date.now();
  let ft;
  while (Date.now() - t0 < 12000) {
    ft = (await listP()).find((x) => x.id === fid && x.url.includes("friends.html"));
    if (ft) break;
    await wait(150);
  }
  c = await connect(ft.id);
  await wait(5000);
  await c.ev(`localStorage.setItem("yaolin-theme","dark"); location.reload(); 1`, 6000);
  await wait(6000);
  const f1 = await c.ev(state(".friend-card"), 8000);
  console.log("FRIENDS dark-restore:", JSON.stringify(f1.result && f1.result.result ? f1.result.result.value : f1));
  await c.ev(`document.getElementById("theme-toggle").click(); 1`, 5000);
  await wait(500);
  const f2 = await c.ev(`(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem("yaolin-theme") }))()`, 5000);
  console.log("FRIENDS toggle:", JSON.stringify(f2.result && f2.result.result ? f2.result.result.value : f2));
  console.log("FRIENDS exceptions:", c.events.filter((m) => m.method === "Runtime.exceptionThrown").length);
  try { c.w.close(); } catch (e) {}

  // 3) index regression
  const iid = (await fetch("http://127.0.0.1:9282/json/new?" + encodeURIComponent("http://127.0.0.1:8017/index.html"), { method: "PUT" }).then((x) => x.json())).id;
  const t1 = Date.now();
  let it;
  while (Date.now() - t1 < 12000) {
    it = (await listP()).find((x) => x.id === iid && x.url.includes("index.html"));
    if (it) break;
    await wait(150);
  }
  c = await connect(it.id);
  await wait(5000);
  await c.ev(`localStorage.setItem("yaolin-theme","dark"); location.reload(); 1`, 6000);
  await wait(6000);
  const i1 = await c.ev(state(".stat-card"), 8000);
  console.log("INDEX dark-restore:", JSON.stringify(i1.result && i1.result.result ? i1.result.result.value : i1));
  await c.ev(`document.getElementById("theme-toggle").click(); 1`, 5000);
  await wait(500);
  const i2 = await c.ev(`(() => ({ theme: document.documentElement.dataset.theme, stored: localStorage.getItem("yaolin-theme") }))()`, 5000);
  console.log("INDEX toggle:", JSON.stringify(i2.result && i2.result.result ? i2.result.result.value : i2));
  console.log("INDEX exceptions:", c.events.filter((m) => m.method === "Runtime.exceptionThrown").length);
  try { c.w.close(); } catch (e) {}
  process.exit(0);
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });