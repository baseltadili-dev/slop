// FULL=0x<32b> [LEN=7] [ALPHA=1] [SUF="(uint256)"] [W=3] node fast.mjs [start] [span]
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createKeccak } from "hash-wasm";

const FULL = process.env.FULL;
if (!FULL) { console.error("FULL=0x<hash> لازم"); process.exit(1); }
const FB = Buffer.from(FULL.replace(/^0x/, ""), "hex");
if (FB.length !== 32) { console.error("FULL لازم 32 بايت"); process.exit(1); }
const LEN = Number(process.env.LEN || 7);
const ALPHA = (process.env.ALPHA ?? "1") === "1";
const SUF = process.env.SUF ?? "(uint256)";
const P = 36 ** (LEN - 1);
const SPACE = ALPHA ? 26 * P : 36 ** LEN;
const W = Number(process.env.W || 3);
const sb = new TextEncoder().encode(SUF);

function fill(c, i) {
  let x;
  const from = ALPHA ? 1 : 0;
  if (ALPHA) { c[0] = 97 + Math.floor(i / P); x = i % P; } else { x = i; }
  for (let k = LEN - 1; k >= from; k--) { c[k] = 48 + (x % 36); x = Math.floor(x / 36); }
  for (let k = from; k < LEN; k++) if (c[k] > 57) c[k] += 39;
}

function work() {
  return createKeccak(256).then((H) => {
    const { id, n, start, end } = workerData;
    const buf = new Uint8Array(LEN + sb.length);
    buf.set(sb, LEN);
    const c = new Uint8Array(LEN);
    let hits = 0, t = Date.now();
    for (let i = start + id; i < end; i += n) {
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
    parentPort.postMessage({ at: end, done: true });
  });
}

if (!isMainThread) work();
else {
  const start = Number(process.argv[2] || 0);
  const span = Number(process.argv[3] || (SPACE - start));
  const end = Math.min(SPACE, start + span);
  console.log(`LEN ${LEN}${ALPHA ? " (حرف أول)" : ""} ${SUF} | ${start}..${end} | ${W} workers`);
  const pos = new Array(W).fill(start);
  let rate = 0, done = 0;
  for (let i = 0; i < W; i++) {
    new Worker(new URL(import.meta.url), { workerData: { id: i, n: W, start, end } })
      .on("message", (m) => {
        if (m.s) { console.log(`HIT ${m.s}${SUF}`); process.exit(0); }
        if (m.rate) rate += m.rate;
        if (m.at) pos[i] = m.at;
        if (m.done && ++done === W) { console.log(`done ${start}..${end}`); process.exit(0); }
      });
  }
  setInterval(() => {
    if (!rate) return;
    const p = pos.reduce((a, b) => a + b, 0) / W;
    console.log(`${(rate / 1e6).toFixed(2)} MH/s | شريحة ${((end - p) / rate).toFixed(0)}s | ${(100 * p / SPACE).toFixed(3)}%`);
    rate = 0;
  }, 10000);
}
