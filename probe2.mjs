import { formatUnits, formatEther } from "ethers";
const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66, 130), 16); return Buffer.from(d.slice(130, 130 + n * 2), "hex").toString(); } catch { return "?"; } };
const t = async (lbl, data) => {
  const r = await j("eth_call", [{ from: ME, to: T, data, gas: "0x30000" }, "latest"]);
  console.log((r.error ? "✗ " : "✓ ") + lbl + (r.error ? "  → " + dec(r.error.data) : ""));
  return dec(r.error?.data || "");
};

const me = await bn(T, "0x70a08231" + pad(ME));
const pairB = await bn(T, "0x70a08231" + pad(P));
const eth = BigInt((await j("eth_getBalance", [ME, "latest"])).result);
console.log("رصيدك SLOP:", formatUnits(me, 9));
console.log("رصيد الحوض:", formatUnits(pairB, 9));
console.log("ETH متبقٍ:", formatEther(eth));
console.log("WETH عندك:", formatEther(await bn(W, "0x70a08231" + pad(ME))));

console.log("\n=== transfer مقابل transferFrom ===");
await t("transfer → الحوض", "0xa9059cbb" + pad(P) + w32(10n ** 9n));
const m1 = await t("transferFrom(ME → الحوض)", "0x23b872dd" + pad(ME) + pad(P) + w32(10n ** 9n));
await t("approve(ME, حد أقصى)", "0x095ea7b3" + pad(ME) + w32(2n ** 255n));

console.log("\n=== وجهة الـ airdrop ===");
const drop = (dest, amt) => "0x983bc41b" + w32(0x60) + pad(dest) + w32(amt) + w32(1) + pad(P);
await t("airdrop slot1 = الحوض", drop(P, 10n ** 9n));
await t("airdrop slot1 = ME", drop(ME, 10n ** 9n));

console.log("\n=== الحكم ===");
if (m1.includes("allowance")) console.log("★ transferFrom غير محمي بالبوابة — البوابة على transfer فقط");
else if (m1 === "") console.log("✗ transferFrom محمي أيضاً");
else console.log("؟ رفض آخر:", m1);
