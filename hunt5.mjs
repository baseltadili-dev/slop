import { createHash } from "node:crypto";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const K = "0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };

const stored = (await j("eth_getStorageAt", [T, "0x" + "0".repeat(62) + "1a", "latest"])).result;
console.log("slot 0x1a:", stored);

const CAND = {
  "deployer": "0xb31c22569075b0068480b72A3959B0348099f8C8",
  "K": K,
  "GATE": "0x98b4b8a57d08ed2f12765e197bb680bbdc39346e",
  "airdropEOA": "0xEF1d2e60f6B04974cfc35f82db6F12183Df0808f",
  "ME": ME,
  "router": "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  "pair": P,
  "dead": "0x000000000000000000000000000000000000dEaD",
  "zero": "0x0000000000000000000000000000000000000000"
};
console.log("\n=== مطابقة المالك ===");
for (const [n, a] of Object.entries(CAND)) {
  const h = createHash("sha256").update(Buffer.concat([Buffer.from(a.slice(2), "hex"), Buffer.from("dead", "hex")])).digest("hex");
  const m = "0x" + h === stored;
  if (m) console.log("★ مطابق:", n, a);
}
console.log("(انتهى الفحص)");

console.log("\n=== K ===");
const code = (await j("eth_getCode", [K, "latest"])).result;
console.log("حجم الكود:", (code.length - 2) / 2, "بايت");
console.log("exempt[K]:", (await bn(T, "0x3595fdf5" + pad(K)))?.toString());
console.log("K→pair يمر؟");
const r1 = await j("eth_call", [{ from: K, to: T, data: "0xa9059cbb" + pad(P) + w32(1000000000n), gas: "0x30000" }, "latest"]);
console.log(" ", r1.error ? "✗ " + (r1.error.data || "").slice(0, 44) : "✓");

if (code && code.length > 2) {
  const sels = [...new Set(code.match(/63[0-9a-f]{8}14/g) || [])].map(x => x.slice(2, 10));
  console.log("\nمحددات في الكود:", sels.join(" ") || "—");
  for (const s of sels.slice(0, 24)) {
    for (const [lbl, arg] of [["", ""], ["(pair)", pad(P)], ["(ME)", pad(ME)]]) {
      const r = await j("eth_call", [{ from: ME, to: K, data: "0x" + s + arg, gas: "0x30000" }, "latest"]);
      if (!r.error) console.log("  يمر:", "0x" + s + lbl);
    }
  }
}
