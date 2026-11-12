// slop-brute.mjs [address|uint256] [startOffset]   FULL=0x<32b> for full match
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { keccak_256 } from "@noble/hashes/sha3";

const MODE = process.argv[2] === "address" ? "address" : "uint256";
const SUF = `(${MODE})`;
const TGT = MODE === "address" ? [0x1f,0xe0,0x62,0x4c] : [0xcc,0xb9,0x13,0x5c];
const FULL = process.env.FULL ? Buffer.from(process.env.FULL.replace(/^0x/, ""), "hex") : null;
const SPACE = 36 ** 7;
const W = Number(process.env.W || 8);
const sb = new TextEncoder().encode(SUF);
const hex = (h) => "0x" + Buffer.from(h).toString("hex");

function work() {
  const { id, n, start } = workerData;
  const buf = new Uint8Array(7 + sb.length);
  buf.set(sb, 7);
  const c = new Uint8Array(7);
  let hits = 0, t = Date.now();
  for (let i = start + id; i < SPACE; i += n) {
    let x = i;
    for (let k = 6; k >= 0; k--) { c[k] = 48 + (x % 36); x = (x / 36) | 0; }
    for (let k = 0; k < 7; k++) if (c[k] > 57) c[k] += 39;
    buf.set(c, 0);
    const h = keccak_256(buf);
    if (h[0]===TGT[0] && h[1]===TGT[1] && h[2]===TGT[2] && h[3]===TGT[3]) {
      const s = new TextDecoder().decode(c);
      if (!FULL) { parentPort.postMessage({ s, h: hex(h), ok: true }); return; }
      let ok = true;
      for (let k = 0; k < 32; k++) if (h[k] !== FULL[k]) { ok = false; break; }
      parentPort.postMessage({ s, h: hex(h), ok });
      if (ok) return;
    }
    if ((++hits & 0x3ffff) === 0 && Date.now() - t > 5000) {
      parentPort.postMessage({ rate: hits / ((Date.now() - t) / 1000) }); hits = 0; t = Date.now();
    }
  }
  parentPort.postMessage({ done: true });
}

if (!isMainThread) work();
else {
  const start = Number(process.argv[3] || 0);
  console.log(`brute ${SUF} -> ${hex(TGT)}${FULL ? " FULL " + hex(FULL) : " [4-byte only]"} | ${W} workers | start ${start}`);
  let rate = 0, done = 0;
  for (let i = 0; i < W; i++) {
    new Worker(new URL(import.meta.url), { workerData: { id: i, n: W, start } })
      .on("message", (m) => {
        if (m.s) {
          console.log(`${m.ok ? "MATCH" : "prefix"}: "${m.s}${SUF}"  ${m.h}`);
          if (m.ok) process.exit(0);
        }
        if (m.rate) rate += m.rate;
        if (m.done && ++done === W) { console.log("space exhausted"); process.exit(0); }
      });
  }
  setInterval(() => {
    if (!rate) return;
    console.log(`${(rate/1e6).toFixed(2)} MH/s | ETA ${((SPACE-start)/rate/3600).toFixed(1)}h | ${(100*start/SPACE).toFixed(3)}%`);
    rate = 0;
  }, 10000);
}
