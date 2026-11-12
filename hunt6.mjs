import { id } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const K = "0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return ""; try { const n = parseInt(d.slice(66, 130), 16); return Buffer.from(d.slice(130, 130 + n * 2), "hex").toString(); } catch { return ""; } };

console.log("SLOP عند K:", (await bn(T, "0x70a08231" + pad(K)))?.toString());
console.log("SLOP عندي:", (await bn(T, "0x70a08231" + pad(ME)))?.toString());
console.log("K→pair 1e9:", (await j("eth_call", [{ from: K, to: T, data: "0xa9059cbb" + pad(P) + w32(1000000000n), gas: "0x30000" }, "latest"])).error ? "✗" : "✓");

const SIGS = ["flush(address)","flush()","flush(address,uint256)","push(address)","push(address,uint256)","send(address,uint256)","withdraw(address)","withdraw(address,uint256)","withdraw(uint256)","withdraw()","withdrawTo(address,uint256)","sweep(address)","sweep(address,uint256)","sweepToken(address)","rescue(address,uint256)","rescueTokens(address,uint256)","drain(address)","drain(address,uint256)","collect(address)","claim()","claim(address)","harvest()","release(address)","release()","unlock()","unlock(address)","deposit(uint256)","deposit(address,uint256)","stake(uint256)","unstake(uint256)","distribute(address,uint256)","forward(address,uint256)","transferOut(address,uint256)","move(address,uint256)","refund(address)","mint(address,uint256)","token()","owner()","totalStaked()","staked(address)","setGate(address,bool)","setExempt(address,bool)","pair()","router()"];

const code = (await j("eth_getCode", [K, "latest"])).result;
const sels = new Set((code.match(/63[0-9a-f]{8}14/g) || []).map(x => x.slice(2, 10)));
console.log("\n=== تعريف المحددات ===");
const hits = [];
for (const s of SIGS) {
  const sel = id(s).slice(2, 10);
  if (sels.has(sel)) { hits.push(s); console.log("★", s, "0x" + sel); }
}
if (!hits.length) console.log("لا مطابقة في القاموس");

console.log("\n=== airdrop ===");
const arr = pad(P);
const t1 = "0x983bc41b" + w32(0x60) + pad(ME) + w32(1000000000n) + w32(1) + arr;
let r = await j("eth_call", [{ from: ME, to: T, data: t1, gas: "0x400000" }, "latest"]);
console.log("airdrop([pair],ME,1e9):", r.error ? "✗ " + dec(r.error.data) : "✓");
const t2 = "0x983bc41b" + w32(0x40) + w32(1000000000n) + w32(1) + arr;
r = await j("eth_call", [{ from: ME, to: T, data: t2, gas: "0x400000" }, "latest"]);
console.log("airdrop([pair],1e9):", r.error ? "✗ " + dec(r.error.data) : "✓");

if (hits.length) {
  console.log("\n=== تجربة دوال K ===");
  for (const s of hits) {
    const sel = "0x" + id(s).slice(2, 10);
    for (const [lbl, a] of [["", ""], ["(pair)", pad(P)], ["(pair,amt)", pad(P) + w32(1000000000n)]]) {
      const rr = await j("eth_call", [{ from: ME, to: K, data: sel + a, gas: "0x30000" }, "latest"]);
      console.log((rr.error ? "✗ " : "✓ ") + s + lbl + (rr.error ? "  " + dec(rr.error.data) : ""));
    }
  }
}
