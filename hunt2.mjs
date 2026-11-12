import fs from "node:fs";
import { createHash } from "node:crypto";
import { keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const RT = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const s32 = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const rd = async (to, data, from) => { const r = await j("eth_call", [{ ...(from ? { from } : {}), to, data }, "latest"]); return r.error ? null : r.result; };
const bn = async (to, data) => { const r = await rd(to, data); return r ? BigInt(r) : null; };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66, 130), 16); return Buffer.from(d.slice(130, 130 + n * 2), "hex").toString(); } catch { return "?"; } };

const token0 = await rd(P, "0x0dfe1681");
const token1 = await rd(P, "0xd21220a7");
console.log("token0:", "0x" + token0.slice(-40));
console.log("token1:", "0x" + token1.slice(-40));
console.log("token0==SLOP:", "0x" + token0.slice(-40) === T.toLowerCase(), "| token0==WETH:", "0x" + token0.slice(-40) === W.toLowerCase());

const owner = await rd(T, "0x8da5cb5b");
console.log("owner():", owner ? "0x" + owner.slice(-40) : "—");
console.log("ME مالك؟", owner && "0x" + owner.slice(-40) === ME.toLowerCase());
const h = createHash("sha256").update(Buffer.concat([Buffer.from(ME.slice(2), "hex"), Buffer.from("dead", "hex")])).digest("hex");
const stored = (await j("eth_getStorageAt", [T, s32(0x1a), "latest"])).result;
console.log("hash مطابق لخانة 0x1a:", "0x" + h === stored);

console.log("\n=== أعلام ===");
for (const [n, a] of [["ME", ME], ["pair", P], ["router", RT]]) {
  const ex = await bn(T, "0x3595fdf5" + pad(a));
  const ga = BigInt((await j("eth_getStorageAt", [T, keccak256(concat([zeroPadValue(a, 32), toBeHex(0x0e, 32)])), "latest"])).result || 0);
  console.log(n.padEnd(7), "exempt:", ex, "| gate:", ga.toString());
}

console.log("\n=== تحويل من الحوض إليّ ===");
for (const amt of [1n, 1000n, 1000000000n]) {
  const r = await j("eth_call", [{ from: P, to: T, data: "0xa9059cbb" + pad(ME) + w32(amt), gas: "0x30000" }, "latest"]);
  console.log(String(amt).padEnd(12), r.error ? "✗ " + dec(r.error.data) : "✓");
}

const rv = await rd(P, "0x0902f1ac");
const r0 = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
const balT = await bn(T, "0x70a08231" + pad(P));
const balW = await bn(W, "0x70a08231" + pad(P));
console.log("\nSLOP بالحوض:", balT.toString(), "| reserve0:", r0.toString());
console.log("WETH بالحوض:", balW.toString(), "| reserve1:", r1.toString());

const healed = { [P]: { stateDiff: { [s32(8)]: "0x" + (r0 - 1n | (r1 - 1n) << 112n).toString(16).padStart(64, "0") } } };
const skim = "0xbc25cf77" + pad(ME);
console.log("\n=== skim بحالة مُصلَحة (فائض 1 واي لكل ساق) ===");
for (const [lbl, ov] of [["الحالية", undefined], ["مُصلَحة", healed]]) {
  const r = await j("eth_call", [{ to: P, data: skim, gas: "0x30000" }, "latest", ov]);
  console.log(lbl.padEnd(8), r.error ? "✗ " + dec(r.error.data) : "✓");
}
