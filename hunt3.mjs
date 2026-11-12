import fs from "node:fs";
import { JsonRpcProvider, Wallet, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const G = 8000000n;
const F = { maxFeePerGas: G, maxPriorityFeePerGas: 1000000n };

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const s32 = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66, 130), 16); return Buffer.from(d.slice(130, 130 + n * 2), "hex").toString(); } catch { return "?"; } };

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  const ME = me.address;

  const bal = await bn(T, "0x70a08231" + pad(ME));
  const eth = await p.getBalance(ME);
  const balT = await bn(T, "0x70a08231" + pad(P));
  const rv = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
  const r1 = BigInt("0x" + rv.slice(66, 130));

  const gateSlot = keccak256(concat([zeroPadValue(ME, 32), toBeHex(0x0e, 32)]));
  const balSlot = keccak256(concat([zeroPadValue(T, 32), toBeHex(1, 32)]));
  const gateOff = { [T]: { stateDiff: { [gateSlot]: s32(0) } } };

  const tr = amt => "0xa9059cbb" + pad(P) + w32(amt);
  const skim = "0xbc25cf77" + pad(ME);

  const sim = async (label, to, data, ov) => {
    const r = await j("eth_call", [{ from: ME, to, data, gas: "0x30000" }, "latest", ov]);
    console.log((r.error ? "✗ " : "✓ ") + label + (r.error ? "  " + dec(r.error.data) : ""));
    return !r.error;
  };

  console.log("SLOP:", formatUnits(bal, 9), "| ETH:", formatEther(eth));
  console.log("فائض SLOP الحالي:", (balT - r1).toString());
  for (const s of ["8f2bd5e0", "893d20e8"]) {
    const r = await j("eth_call", [{ to: T, data: "0x" + s }, "latest"]);
    console.log("getter 0x" + s + ":", r.error ? "✗" : "0x" + r.result.slice(-40));
  }

  console.log("\n=== 1) هل الإرسال للحوض يمرّ الآن؟ ===");
  const direct = await sim("إرسال 1 واي (بلا تدخل)", T, tr(1n));
  const gated  = await sim("إرسال 1 واي (بعد رفع الحجب)", T, tr(1n), gateOff);

  console.log("\n=== 2) سلسلة كاملة ===");
  const full = await sim("إرسال الكل (بعد رفع الحجب)", T, tr(bal), gateOff);
  const endState = { [T]: { stateDiff: { [gateSlot]: s32(0) } }, [P]: { stateDiff: { [balSlot]: "0x" + (balT + bal).toString(16).padStart(64, "0") } } };
  const done = await sim("skim بعد الوصول", P, skim, endState);

  if (!full || !done) { console.log("\nالمسار مسدود."); return; }
  const need = 245000n * G;
  if (eth < need) { console.log("\nغاز ناقص، عبّئ " + formatEther(need - eth) + " ETH"); return; }
  if (process.env.DRY === "1") { console.log("\nDRY — جاهز"); return; }

  if (!direct) {
    console.log("\nرفع الحجب...");
    const r0 = await (await me.sendTransaction({ to: T, data: "0x35665e12" + pad(ME) + w32(0), ...F, gasLimit: 45000n })).wait();
    console.log("  ", r0.status);
    const now = BigInt((await j("eth_getStorageAt", [T, gateSlot, "latest"])).result);
    console.log("  gate[ME] =", now.toString());
    if (now !== 0n) { console.log("  الحجب لم يُرفع — توقف"); return; }
  }

  console.log("إرسال SLOP إلى الحوض...");
  let r = await (await me.sendTransaction({ to: T, data: tr(bal), ...F, gasLimit: 80000n })).wait();
  console.log("  ", r.status);
  await new Promise(x => setTimeout(x, 4000));

  console.log("skim...");
  r = await (await me.sendTransaction({ to: P, data: skim, ...F, gasLimit: 120000n })).wait();
  console.log("  ", r.status);

  console.log("\nتم | SLOP:", formatUnits(await bn(T, "0x70a08231" + pad(ME)), 9), "| ETH:", formatEther(await p.getBalance(ME)));
}
main().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
