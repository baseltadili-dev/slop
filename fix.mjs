import fs from "node:fs";
import { JsonRpcProvider, Wallet, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const G = 8000000n;
const F = { maxFeePerGas: G, maxPriorityFeePerGas: 1000000n };

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  const bal = BigInt((await j("eth_call", [{ to: T, data: "0x70a08231" + pad(ME) }, "latest"])).result);
  const eth = await p.getBalance(ME);
  console.log("رصيد:", formatUnits(bal, 9), "SLOP |", formatEther(eth), "ETH");

  const slot = keccak256(concat([zeroPadValue(ME, 32), toBeHex(0x0e, 32)]));
  const ov = { [T]: { stateDiff: { [slot]: "0x" + "0".repeat(64) } } };
  const probe = async (lbl, data, gas) => {
    const c = await j("eth_call", [{ from: ME, to: T, data, gas: "0x" + gas.toString(16) }, "latest", ov]);
    console.log((c.error ? "✗ " : "يمر ") + lbl);
    return !c.error;
  };

  console.log("\n--- محاكاة بعد مسح العلم ---");
  const a = await probe("→ ميت", "0xa9059cbb" + pad(DEAD) + w32(1000000000n), 200000);
  const b = await probe("→ الحوض", "0xa9059cbb" + pad(P) + w32(bal), 200000);
  const c = await probe("skim(ME)", "0xbc25cf77" + pad(ME), 200000);
  if (!a || !b || !c) { console.log("المحاكاة لم تنجح — لا تنفيذ"); return; }

  const need = 250000n * G;
  if (eth < need) { console.log("\nغاز غير كافٍ، ناقص " + formatEther(need - eth)); return; }
  if (process.env.DRY === "1") return;

  console.log("\n1) مسح العلم...");
  let r = await (await me.sendTransaction({ to: T, data: "0x35665e12" + pad(ME) + w32(0), ...F, gasLimit: 50000n })).wait();
  console.log("  ", r.status);

  console.log("2) تحويل الكل إلى الحوض...");
  r = await (await me.sendTransaction({ to: T, data: "0xa9059cbb" + pad(P) + w32(bal), ...F, gasLimit: 80000n })).wait();
  console.log("  ", r.status);

  await new Promise(x => setTimeout(x, 9000));
  console.log("3) skim...");
  r = await (await me.sendTransaction({ to: P, data: "0xbc25cf77" + pad(ME), ...F, gasLimit: 120000n })).wait();
  console.log("  ", r.status);

  console.log("\nالنتيجة | SLOP:", formatUnits(await new (await import("ethers")).Contract(T, ["function balanceOf(address) view returns (uint256)"], p).balanceOf(ME), 9), "| ETH:", formatEther(await p.getBalance(ME)));
}
main().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
