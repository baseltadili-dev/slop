import { Wallet } from "ethers";
const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const F = Wallet.createRandom().address;
const M = 10n ** 21n;

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const drop = (amt, to) => "0x983bc41b" + w32(0x60) + pad(to) + w32(amt) + w32(1) + pad(P);

console.log("عنوان طازج:", F);
for (const [lbl, from, to] of [
  ["طازج → طازج", F, F],
  ["أنا → طازج", ME, F],
  ["طازج → أنا", F, ME],
  ["طازج → الحوض", F, P],
  ["أنا → الحوض", ME, P],
]) {
  const r = await j("eth_call", [{ from, to: T, data: drop(M, to), gas: "0x2a000" }, "latest"]);
  console.log((r.error ? "✗ " : "✓ ") + lbl + (r.error ? "  " + (r.error.data || r.error.message) : "  ret=" + r.result.slice(0, 130)));
}
