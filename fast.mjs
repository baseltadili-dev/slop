// FULL=0x<32b> [LEN=6] [ALPHA=1] [SUF="(uint256)"] W=4 node fast.mjs [start]
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createKeccak } from "hash-wasm";

const FULL = process.env.FULL;
if (!FULL) { console.error("لازم FULL=0x<hash كامل>"); process.exit(1); }
const FB = Buffer.from(FULL.replace(/^0x/, ""), "hex");
if (FB.length !== 32) { console.error("FULL لازم 32 بايت"); process.exit(1); }
const LEN = Number(process.env.LEN || 6);
const ALPHA = process.env.ALPHA === "1";
const SUF = process.env.SUF ?? "(uint256)";
const P = 36 ** (LEN - 1);
const SPACE = ALPHA ? 26 * P : 36 ** LEN;
const W = Number(process.env.W || 4);
const sb = new TextEncoder().encode(SUF);

function fill(c, i) {
  let x;
  if (ALPHA) { c[0] = 97 + ((i / P) | 0); x = i % P; }
  else { x = i; }
  for (let k = LEN - 1; k >= (ALPHA ? 1 : 0); k--) { c[k] = 48 + (x % 36); x = (x / 36) | 0; }
  for (let k = ALPHA ? 1 : 0; k < LEN; k++) if (c[k] > 57) c[k] += 39;
}

function work() {
  return createKeccak(256).then((H) => {
    const { id, n, start } = workerData;
    const buf = new Uint8Array(LEN + sb.length);
    buf.set(sb, LEN);
    const c = new Uint8Array(LEN);
    let hits = 0, t = Date.now();
    for (let i = start + id; i < SPACE; i += n) {
      fill(c, i);
      buf.set(c, 0);
      H.init(); H.update(buf);
      const h = H.digest("binary");
      let ok = true;
      for (let k = 0; k < 32; k++) if (h[k] !== FB[k]) { ok = false; break; }
      if (ok) { parentPort.postMessage({ s: new TextDecoder().decode(c) }); return; }
      if ((++hits & 0xfffff) === 0 && Date.now() - t > 5000) {
        parentPort.postMessage({ rate: hits / ((Date.now() - t) / 1000), at: i });
        hits = 0; t = Date.now();
      }
    }
    parentPort.postMessage({ at: SPACE, done: true });
  });
}

if (!isMainThread) work();
else {
  const start = Number(process.argv[2] || 0);
  console.log(`LEN ${LEN}${ALPHA ? " (حرف أول)" : ""} ${SUF} -> ${FULL} | ${W} workers | start ${start}`);
  const pos = new Array(W).fill(start);
  let rate = 0, done = 0;
  for (let i = 0; i < W; i++) {
    new Worker(new URL(import.meta.url), { workerData: { id: i, n: W, start } })
      .on("message", (m) => {
        if (m.s) { console.log(`\nHIT "${m.s}${SUF}"`); process.exit(0); }
        if (m.rate) rate += m.rate;
        if (m.at) pos[i] = m.at;
        if (m.done && ++done === W) { console.log("خلصت المساحة بدون نتيجة"); process.exit(0); }
      });
  }
  setInterval(() => {
    if (!rate) return;
    const p = pos.reduce((a, b) => a + b, 0) / W;
    console.log(`${(rate / 1e6).toFixed(2)} MH/s | باقي ${((SPACE - p) / rate / 3600).toFixed(2)}h | ${(100 * p / SPACE).toFixed(3)}%`);
    rate = 0;
  }, 10000);
}
