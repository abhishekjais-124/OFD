// Offline check: drives headless Chrome over the DevTools protocol against a running OFD server
// (default http://localhost:8791), waits for the service worker, cuts the network, reloads and
// reports whether the briefing and the offline banner are still shown. Needs Google Chrome on macOS.
// Run: npm run build && OFD_API_PORT=8791 npm start &  then  node scripts/check-offline.mjs http://localhost:8791
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const origin = process.argv[2] ?? "http://localhost:8791";
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ofd-offline-"));
const port = 9333;
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1200,900"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
async function getJson(url) { for (let i = 0; i < 60; i++) { try { const r = await fetch(url); return await r.json(); } catch { await sleep(250); } } throw new Error("chrome did not answer " + url); }

try {
  const version = await getJson(`http://127.0.0.1:${port}/json/version`);
  log("chrome", version.Browser);
  let targets = await getJson(`http://127.0.0.1:${port}/json/list`);
  let page = targets.find((t) => t.type === "page");
  if (!page) {
    const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" }).then((r) => r.json());
    page = created;
  }
  log("page target", page.id, page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", (e) => rej(new Error("ws error"))); });
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.error) return { error: r.error.message };
    if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text };
    return r.result?.result?.value;
  };
  await send("Network.enable"); await send("Page.enable"); await send("Runtime.enable");
  log("navigate", await JSON.stringify((await send("Page.navigate", { url: origin + "/" })).result));
  await sleep(6000);
  log("url", await evaluate("location.href"), "ready", await evaluate("document.readyState"), "root children", await evaluate("document.getElementById('root') && document.getElementById('root').children.length"));
  const online = await evaluate(`(async () => { let reg = null; for (let i = 0; i < 40; i++) { reg = await navigator.serviceWorker.getRegistration(); if (reg && reg.active) break; await new Promise(s => setTimeout(s, 250)); } return { swActive: !!(reg && reg.active), title: document.querySelector('.hero h1') ? document.querySelector('.hero h1').textContent : null, banner: document.querySelector('.banner.warn') ? document.querySelector('.banner.warn').textContent : null, images: document.querySelectorAll('img.thumb').length }; })()`);
  log("online:", JSON.stringify(online));
  await evaluate(`(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(s => setTimeout(s, 120)); } window.scrollTo(0, 0); return true; })()`);
  await sleep(2000);
  await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await send("Page.reload", { ignoreCache: false });
  await sleep(5000);
  const offline = await evaluate(`({ title: document.querySelector('.hero h1') ? document.querySelector('.hero h1').textContent : null, banner: document.querySelector('.banner.warn') ? document.querySelector('.banner.warn').textContent : null, sections: document.querySelectorAll('main section.section').length, loadedImages: [...document.querySelectorAll('img.thumb')].filter(i => i.naturalWidth > 0).length, navigatorOnline: navigator.onLine, bodyStart: document.body.innerText.slice(0, 120) })`);
  log("offline:", JSON.stringify(offline));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "offline.png"), Buffer.from(shot.result.data, "base64"));
  log("screenshot written");
  ws.close();
  process.exitCode = online && online.swActive && offline && offline.banner ? 0 : 1;
} catch (err) {
  log("failed:", err.message);
  process.exitCode = 2;
} finally {
  proc.kill("SIGKILL");
  fs.rmSync(profile, { recursive: true, force: true });
  setTimeout(() => process.exit(), 200);
}
