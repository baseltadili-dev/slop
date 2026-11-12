import fs from "node:fs";
import { JsonRpcProvider, Wallet, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const G = 8000000n;
const F = { maxFeePerGas: G, maxPriorityFeePerGas: 1000000n };

const j  = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const rd  = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : r.result; };
const bn  = async (to, data) => { const r = await rd(to, data); return r ? BigInt(r) : null; };
const st  = async (slot) => BigInt((await j("eth_getStorageAt", [T, slot, "latest"])).result || 0);
const pack = (a, b, t) => "0x" + (BigInt(a) | (BigInt(b) << 112n) | (BigInt(t) << 224n)).toString(16).padStart(64, "0");

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  const ME = me.address;

  const eth  = await p.getBalance(ME);
  const bal  = await bn(T, "0x70a08231" + pad(ME));
  const t0   = (await rd(P, "0x0dfe1681")).slice(-40);
  const isT0 = "0x" + t0 === T.toLowerCase();

  const rv   = await rd(P, "0x0902f1ac");
  const r0   = BigInt("0x" + rv.slice(2, 66));
  const r1   = BigInt("0x" + rv.slice(66, 130));
  const ts   = BigInt(rv.slice(130, 138) ? "0x" + rv.slice(130, 138) : 0);

  const balT = await bn(T, "0x70a08231" + pad(P));
  const balW = await bn(W, "0x70a08231" + pad(P));
  const sup  = await bn(P, "0x18160ddd");
  const maxSeen = await st(0x1d);
  const exemptPair = await bn(T, "0x3595fdf5" + pad(P));
  const gateME = await st(keccak256(concat([zeroPadValue(ME, 32), toBeHex(0x0e, 32)])));

  const balS = isT0 ? balT : balW;
  const resS = isT0 ? r0 : r1;
  const balWs = isT0 ? balW : balT;
  const resWs = isT0 ? r1 : r0;
  const surS = balS - resS;
  const surW = balWs - resWs;

  console.log("=== حالة ===");
  console.log("ETH:", formatEther(eth), "| SLOP:", formatUnits(bal, 9));
  console.log("pair.exempt:", exemptPair, "| gate[ME]:", gateME.toString());
  console.log("pair.totalSupply:", sup.toString());
  console.log("maxSeenSupply(0x1d):", maxSeen.toString());
  console.log("SLOP بالحوض:", balS.toString(), "| reserve:", resS.toString(), "| فائض:", surS.toString());
  console.log("WETH بالحوض:", balWs.toString(), "| reserve:", resWs.toString(), "| فائض:", surW.toString());

  const skimData = "0xbc25cf77" + pad(ME);
  const sim = async (label, ov) => {
    const c = await j("eth_call", [{ to: P, data: skimData, gas: "0x30000" }, "latest", ov]);
    console.log((c.error ? "✗ " : "✓ ") + label + (c.error ? "  " + (c.error.data || "").slice(0, 44) : ""));
    return !c.error;
  };

  console.log("\n=== عزل السبب ===");
  await sim("A) الحالة الحالية", undefined);

  const rSlot = "0x8";
  await sim("B) فائض مصطنع 1 واي", { [P]: { stateDiff: { [rSlot]: pack(balS - 1n, balWs, ts) } } });

  const balSlotT = keccak256(concat([zeroPadValue(T, 32), toBeHex(1, 32)]));
  const after = balS + (bal * (exemptPair === 1n ? 100n : 88n)) / 100n;
  const real = await sim("C) رصيد الحوض بعد إرسالي", { [P]: { stateDiff: { [balSlotT]: "0x" + after.toString(16).padStart(64, "0") } } });

  const guard = sup >= maxSeen;
  console.log("\nحارس 0x1d:", guard ? "يمر" : "✗ الحوض حُرِق منه LP — كل تحويل من الحوض مرتد");

  if (!real || !guard) { console.log("\nالنتيجة: التنفيذ غير آمن."); return; }

  const need = 235000n * G;
  if (eth < need) { console.log("\nغاز ناقص، عبّئ " + formatEther(need - eth) + " ETH على الأقل"); return; }
  if (process.env.DRY === "1") { console.log("\nDRY — جاهز للتنفيذ"); return; }

  console.log("\n1) إرسال SLOP إلى الحوض...");
  let r = await (await me.sendTransaction({ to: T, data: "0xa9059cbb" + pad(P) + w32(bal), ...F, gasLimit: 95000n })).wait();
  console.log("  ", r.status);

  await new Promise(x => setTimeout(x, 4000));
  console.log("2) skim...");
  r = await (await me.sendTransaction({ to: P, data: skimData, ...F, gasLimit: 140000n })).wait();
  console.log("  ", r.status);

  console.log("\nتم | SLOP:", formatUnits(await bn(T, "0x70a08231" + pad(ME)), 9), "| ETH:", formatEther(await p.getBalance(ME)));
}
main().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
