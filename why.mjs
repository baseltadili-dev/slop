import { keccak256, concat, zeroPadValue, toBeHex, formatUnits } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const DUM = "0x000000000000000000000000000000000000dEaD";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const mk = (to, amt) => "0xa9059cbb" + pad(to) + w32(amt);

const tryCall = async (label, data, gas) => {
  const c = await j("eth_call", [{ from: ME, to: T, data, gas: "0x" + gas.toString(16) }, "latest"]);
  if (!c.error) return console.log(label.padEnd(26), "يمر");
  const d = c.error.data || "";
  let msg = "";
  if (d.startsWith("0x08c379a0")) { try { msg = Buffer.from(d.slice(138), "hex").toString().replace(/\0+$/, ""); } catch {} }
  console.log(label.padEnd(26), "✗", c.error.message.slice(0, 40), d.slice(0, 40), msg);
};

const bal = BigInt((await j("eth_call", [{ to: T, data: "0x70a08231" + pad(ME) }, "latest"])).result);
console.log("رصيدك:", formatUnits(bal, 9), "SLOP\n");

await tryCall("1 SLOP → الحوض", mk(P, 1000000000n), 200000);
await tryCall("الكل → الحوض", mk(P, bal), 200000);
await tryCall("الكل → عنوان ميت", mk(DUM, bal), 200000);
await tryCall("الكل → الحوض غاز 60k", mk(P, bal), 60000);
await tryCall("1 SLOP → الحوض غاز 400k", mk(P, 1000000000n), 400000);

console.log("\n--- خانات ---");
const m = async (slot, addr) => BigInt((await j("eth_getStorageAt", [T, keccak256(concat([zeroPadValue(addr, 32), toBeHex(slot, 32)])), "latest"])).result || 0);
for (const [nm, s, a] of [["0x14 ME", 0x14, ME], ["0x0d ME", 0x0d, ME], ["0x0e ME", 0x0e, ME], ["0x14 pair", 0x14, P], ["0x0d pair", 0x0d, P], ["0x0e pair", 0x0e, P]])
  console.log(nm.padEnd(12), (await m(s, a)).toString());

const g = async s => BigInt((await j("eth_getStorageAt", [T, "0x" + s.toString(16), "latest"])).result || 0);
const ts = BigInt((await j("eth_getBlockByNumber", ["latest", false])).result.timestamp);
console.log("\n0x16:", (await g(0x16)).toString(), "| 0x18:", (await g(0x18)).toString(), "| 0x1d:", (await g(0x1d)).toString());
console.log("now:", ts.toString(), "| شرط ME:", (await m(0x14, ME)) + (await g(0x16)) < ts ? "يمر" : "مرتد");
console.log("شرط pair:", (await m(0x14, P)) + (await g(0x16)) < ts ? "يمر" : "مرتد");
