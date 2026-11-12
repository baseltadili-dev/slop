import fs from "node:fs";
import { JsonRpcProvider, Wallet, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = process.env.RPC || "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const DRY = process.env.DRY === "1";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const hx = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66,130),16); return Buffer.from(d.slice(130,130+n*2),"hex").toString(); } catch { return "?"; } };

let ME = null;

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  ME = me.address;

  const rw = await bn(ROUTER, "0xad5c4648");
  if (!rw || rw !== BigInt(W)) {
    console.log("الراوتر لا يطابق:", rw === null ? "لا دالة WETH()" : rw.toString(16)); return;
  }
  console.log("الراوتر موثّق ✔");

  const rv = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
  const r0 = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
  const bal = await bn(T, "0x70a08231" + pad(ME));
  const eth = await p.getBalance(ME);
  const base = BigInt((await j("eth_getBlockByNumber", ["latest", false])).result.baseFeePerGas);

  console.log("رصيدك SLOP:", formatUnits(bal, 9), "| الاحتياطي:", formatEther(r0), "WETH | ETH:", formatEther(eth));
  if (bal === 0n) { console.log("لا يوجد SLOP — أعد السك أولاً"); return; }

  const amountIn = bal;
  const out = amountIn * 997n * r0 / (r1 * 1000n + amountIn * 997n);
  const minOut = out * 995n / 1000n;
  console.log("المتوقع:", formatEther(out), "WETH | الحد الأدنى:", formatEther(minOut));

  const inner = keccak256(concat([zeroPadValue(ME, 32), toBeHex(1, 32)]));
  const allowSlot = keccak256(concat([zeroPadValue(ROUTER, 32), inner]));
  const dl = BigInt(Math.floor(Date.now() / 1000) + 1200);
  const swapData = "0x38ed1739" + w32(amountIn) + w32(minOut) + w32(0xa0) + pad(ME) + w32(dl) + w32(2) + pad(T) + pad(W);
  const ov = { [T]: { stateDiff: { [allowSlot]: hx(amountIn) } } };

  const sim = await j("eth_call", [{ from: ME, to: ROUTER, data: swapData, gas: "0x60000" }, "latest", ov]);
  if (sim.error) { console.log("محاكاة السواب ✗", dec(sim.error.data)); return; }
  console.log("محاكاة السواب ✔");

  const gasA = 55000n, gasS = 240000n;
  let mf = base + 150000n;
  let need = (gasA + gasS) * mf;
  if (need > eth) { mf = base + 20000n; need = (gasA + gasS) * mf; }
  console.log("غاز مطلوب:", formatEther(need), "| متاح:", formatEther(eth), "| mf:", mf.toString());
  if (need > eth) { console.log("ناقص:", formatEther(need - eth)); return; }
  if (DRY) { console.log("جاهز."); return; }

  const send = async (to, data, gas) => {
    for (let i = 0; i < 3; i++) {
      try {
        const rc = await (await me.sendTransaction({ to, data, gasLimit: gas, maxFeePerGas: mf, maxPriorityFeePerGas: 0n })).wait();
        if (rc.status === 1) return true;
      } catch (e) { console.log("  خطأ:", (e.shortMessage || e.message).slice(0, 80)); }
      if (i < 2) await new Promise(r => setTimeout(r, 6000));
    }
    return false;
  };

  console.log("1) موافقة على الراوتر...");
  if (!await send(T, "0x095ea7b3" + pad(ROUTER) + w32(amountIn), gasA)) return;
  console.log("2) البيع...");
  if (!await send(ROUTER, swapData, gasS)) return;

  console.log("\n>>> WETH عندك:", formatEther(await bn(W, "0x70a08231" + pad(ME))));
  console.log(">>> ETH عندك:", formatEther(await p.getBalance(ME)));
}

main().catch(e => { console.error("فشل:", e.shortMessage || e.message); process.exit(1); });
