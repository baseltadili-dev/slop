import { keccak256, concat, zeroPadValue, toBeHex } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const K = "0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE";
const GATE = "0x98b4b8a57d08ed2f12765e197bb680bbdc39346e";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const tr = (to, amt) => "0xa9059cbb" + pad(to) + w32(amt);

const tryCall = async (label, data, from = ME, gas = 200000) => {
  const c = await j("eth_call", [{ from, to: T, data, gas: "0x" + gas.toString(16) }, "latest"]);
  const ok = !c.error;
  console.log((ok ? "يمر  " : "✗     ") + label + (c.error ? "  " + (c.error.data || "").slice(0, 42) : ""));
  return ok;
};

console.log("=== وجهات ===");
await tryCall("→ K", tr(K, 1000000000n));
await tryCall("→ ميت", tr(DEAD, 1000000000n));
await tryCall("→ الحوض", tr(P, 1000000000n));
await tryCall("→ ME", tr(ME, 1000000000n));
await tryCall("→ K من البوابة", tr(K, 1000000000n), GATE);

console.log("\n=== skim ===");
await tryCall("skim(ME)", "0xbc25cf77" + pad(ME));

console.log("\n=== دوال الإفراج ===");
const SEL = ["35665e12", "8e194978", "bb51ea92", "edf8f2df", "3495b17e", "3ea5b682", "5e86c2ca", "610fe672"];
for (const s of SEL) {
  for (const [lbl, a] of [["ME,1", pad(ME) + w32(1)], ["ME,0", pad(ME) + w32(0)], ["1", w32(1)], ["0", w32(0)], ["ME", pad(ME)], ["", ""]]) {
    await tryCall(s + "(" + lbl + ")", "0x" + s + a, ME, 300000);
  }
}

console.log("\n=== علم 0x0e ===");
const m = async a => BigInt((await j("eth_getStorageAt", [T, keccak256(concat([zeroPadValue(a, 32), toBeHex(0x0e, 32)])), "latest"])).result || 0);
for (const [n, a] of [["ME", ME], ["K", K], ["GATE", GATE], ["pair", P], ["ميت", DEAD]]) console.log(n.padEnd(6), (await m(a)).toString());
