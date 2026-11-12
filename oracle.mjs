const R = process.env.RPC || "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const OWNER = "0xb31c22569075b0068480b72a3959b0348099f8c8";
const MC = "0xcA11bde05977b3631167028862bE2a173976CA11";
const EX = "0x3595fdf5";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };

const agg = calls => {
  const els = calls.map(([t, d, ok]) => {
    const b = d.slice(2), len = b.length / 2;
    return pad(t) + w32(ok ? 1 : 0) + w32(0x60) + w32(len) + b.padEnd(Math.ceil(len / 32) * 64, "0");
  });
  let head = w32(0x20) + w32(calls.length), off = calls.length * 32;
  for (const e of els) { head += w32(off); off += e.length / 2; }
  return "0x82ad56cb" + head + els.join("");
};
const decAgg = h => {
  const { AbiCoder } = await_import;
  return AbiCoder.defaultAbiCoder().decode(["tuple(bool,bytes)[]"], h)[0];
};

const { AbiCoder } = await import("ethers");
const dec = h => AbiCoder.defaultAbiCoder().decode(["tuple(bool,bytes)[]"], h)[0];

const eME = await bn(T, EX + pad(ME));
const eOW = await bn(T, EX + pad(OWNER));
console.log("exempt(ME) =", eME?.toString(), "| exempt(OWNER) =", eOW?.toString());
if (eME !== 1n) { console.log("الدالة لا تقرأ خانة الحجب — أرسل الخرج"); process.exit(1); }

const code = (await j("eth_getCode", [T, "latest"])).result;
const sels = [...new Set((code.match(/63[0-9a-f]{8}/g) || []).map(x => x.slice(2)))].filter(s => s !== "3595fdf5");

const ARGS = ["", pad(ME), pad(ME) + w32(0), pad(ME) + w32(1), w32(0) + pad(ME), pad(ME) + pad(ME)];
const hits = [];

for (const s of sels) {
  for (const arg of ARGS) {
    for (const [who, from] of [["ME", ME], ["OWN", OWNER]]) {
      const bundle = [[T, "0x" + s + arg, true], [T, EX + pad(ME), true]];
      const r = await j("eth_call", [{ from, to: MC, data: agg(bundle), gas: "0x300000" }, "latest"]);
      if (r.error) continue;
      const res = dec(r.result);
      if (!res[0][0] || !res[1][0]) continue;
      const v = BigInt(res[1][1]);
      if (v !== 1n) console.log("★ 0x" + s + (arg ? " +" + (arg.length / 64) : "") + " من " + who + " → exempt(ME)=" + v.toString());
      if (v === 0n) hits.push(["0x" + s + arg, from]);
    }
  }
}

console.log("\n=== تحقق بالسلوك ===");
for (const [data, from] of hits) {
  const bundle = [[T, data, true], [T, "0xa9059cbb" + pad(P) + w32(10n ** 9n), true]];
  const r = await j("eth_call", [{ from, to: MC, data: agg(bundle), gas: "0x300000" }, "latest"]);
  if (r.error) { console.log("✗", data, r.error.message.slice(0, 60)); continue; }
  const res = dec(r.result);
  console.log((res[1][0] ? "✔ يعمل: " : "✗ لا يعمل: ") + data + " من " + (from === ME ? "ME" : "OWNER"));
}
if (!hits.length) console.log("لا نتيجة");
