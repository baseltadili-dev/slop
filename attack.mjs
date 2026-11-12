import fs from "node:fs";
import { JsonRpcProvider, Wallet, AbiCoder, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = process.env.RPC || "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const MC = "0xcA11bde05977b3631167028862bE2a173976CA11";
const ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const EX = "0x3595fdf5";
const GS = 0x0e;
const EXEC = process.env.EXEC === "1";
const coder = AbiCoder.defaultAbiCoder();

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const hx  = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const slot = (a, s) => keccak256(concat([zeroPadValue(a, 32), toBeHex(s, 32)]));
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error || !r.result || r.result === "0x" ? null : BigInt(r.result); };
const str = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); if (r.error || !r.result || r.result.length < 130) return null; try { const n = parseInt(r.result.slice(66, 130), 16); if (n > 64) return null; return Buffer.from(r.result.slice(130, 130 + n * 2), "hex").toString(); } catch { return null; } };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66,130),16); return Buffer.from(d.slice(130,130+n*2),"hex").toString(); } catch { return "?"; } };
const agg = calls => {
  const els = calls.map(([t, d, ok]) => { const b = d.slice(2), len = b.length / 2; return pad(t) + w32(ok ? 1 : 0) + w32(0x60) + w32(len) + b.padEnd(Math.ceil(len / 32) * 64, "0"); });
  let head = w32(0x20) + w32(calls.length), off = calls.length * 32;
  for (const e of els) { head += w32(off); off += e.length / 2; }
  return "0x82ad56cb" + head + els.join("");
};
const decAgg = h => coder.decode(["tuple(bool,bytes)[]"], h)[0];
const hasStr = (code, s) => code.includes(s);

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  const ME = me.address;

  const [nm, sym, dcm] = [await str(T, "0x06fdde03"), await str(T, "0x95d89b41"), await bn(T, "0x313ce567")];
  const tsup = await bn(T, "0x18160ddd");
  const rv = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
  const r0 = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
  const tk0 = "0x" + (await j("eth_call", [{ to: P, data: "0x0dfe1681" }, "latest"])).result.slice(-40).toLowerCase();
  const tk1 = "0x" + (await j("eth_call", [{ to: P, data: "0xd21220a7" }, "latest"])).result.slice(-40).toLowerCase();
  const W0 = tk0 === W.toLowerCase();
  const rW = W0 ? r0 : r1, rS = W0 ? r1 : r0;
  const balP = await bn(T, "0x70a08231" + pad(P));
  const balME = await bn(T, "0x70a08231" + pad(ME));
  const eth = await p.getBalance(ME);
  const base = BigInt((await j("eth_getBlockByNumber", ["latest", false])).result.baseFeePerGas);

  console.log("العقد:", nm, "(" + sym + ") | الاحتياطي:", formatEther(rW), "WETH");

  const mkSwap = (o, to) => "0x022c0d9f" + (W0 ? w32(o) + w32(0) : w32(0) + w32(o)) + pad(to) + w32(0x80) + w32(0);
  const drop = (to, amt) => "0x983bc41b" + w32(0x60) + pad(ME) + w32(amt) + w32(1) + pad(to);

  let bSlot = 0;
  for (const s of [0, 1]) {
    const ov = { [T]: { stateDiff: { [slot(P, s)]: hx(balP + 1n) } } };
    const r = await j("eth_call", [{ to: T, data: "0x70a08231" + pad(P) }, "latest", ov]);
    if (!r.error && BigInt(r.result) === balP + 1n) { bSlot = s; break; }
  }
  const IN = rS * 150n;
  
  const ovX = { [T]: { stateDiff: { [slot(ME, GS)]: hx(0), [slot(P, bSlot)]: hx(balP + IN), [slot(ME, EX)]: hx(0) } } };
  
  let hi = rW * IN / (rS + IN); if (hi > rW - 1n) hi = rW - 1n;
  let lo = 1n, best = 0n;
  for (let i = 0; i < 60 && lo <= hi; i++) {
    const m = (lo + hi) / 2n;
    const r = await j("eth_call", [{ from: ME, to: P, data: mkSwap(m, ME), gas: "0x30000" }, "latest", ovX]);
    if (r.error) hi = m - 1n; else { best = m; lo = m + 1n; }
  }
  
  if (best === 0n) { console.log("الحوض يرفض حتى مع التضخيم الافتراضي"); return; }
  const out = best * 98n / 100n;
  console.log("المخرج المحسوب بالمحاكاة الافتراضية:", formatEther(out), "WETH");

  const calls = [
    [T, drop(P, IN), false],
    [T, "0x70a08231" + pad(P), false],
    [P, mkSwap(out, ME), false]
  ];
  const data = agg(calls);

  const sim = await j("eth_call", [{ from: ME, to: MC, data, gas: "0x90000" }, "latest", ovX]);
  if (sim.error) { console.log("المحاكاة مع التجاوز ✗:", dec(sim.error.data)); return; }
  const res = decAgg(sim.result);
  console.log("نتائج الحزمة الافتراضية:", res.map(x => x[0] ? "✓" : "✗").join(" "));
}

main().catch(e => { console.error("فشل:", e.shortMessage || e.message); process.exit(1); });
