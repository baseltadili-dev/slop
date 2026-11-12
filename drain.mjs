import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits, formatEther } from "ethers";

const R = process.env.RPC || "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const RT = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const BUY = BigInt(process.env.BUY || "1500000000000");
const MIN = BigInt(process.env.MIN || "110");
const PRIO = 1000000n, FLOOR = 8000000n;
const COOLDOWN = 9000;
const GAS = 1051000n;
const KEYFILE = process.env.HOME + "/.slop_last_key";

async function main() {
  const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
  const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
  const ME = me.address;

  const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
  const fee = async () => {
    let mf = FLOOR;
    try { const g = BigInt((await j("eth_gasPrice", [])).result); if (g * 2n > mf) mf = g * 2n; } catch {}
    return { maxFeePerGas: mf, maxPriorityFeePerGas: PRIO };
  };

  const AB = ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)", "function approve(address,uint256) returns (bool)"];
  const tok = new Contract(T, AB, p);
  const lp = new Contract(P, AB, p);
  const weth = new Contract(W, ["function balanceOf(address) view returns (uint256)", "function withdraw(uint256)"], p);
  const pair = new Contract(P, ["function getReserves() view returns (uint112,uint112,uint32)", "function skim(address)", "function token0() view returns (address)"], p);
  const rt = new Contract(RT, ["function swapExactETHForTokens(uint256,address[],address,uint256) payable returns (uint256[])", "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)", "function removeLiquidityETH(address,uint256,uint256,uint256,address,uint256) returns (uint256,uint256)"], p);

  const send = async (fn) => {
    for (let i = 0; i < 3; i++) {
      try { const tx = await fn(); const rc = await tx.wait(); if (rc.status === 1) return rc; }
      catch (e) { console.log("   ارتد:", (e.shortMessage || e.message).slice(0, 70)); }
      if (i < 2) { console.log("   انتظار " + COOLDOWN + "ms..."); await new Promise(r => setTimeout(r, COOLDOWN)); }
    }
    return null;
  };

  const t0 = (await pair.token0()).toLowerCase();
  const [r0, r1] = await pair.getReserves();
  const isTok0 = t0 === T.toLowerCase();
  const resSLOP = isTok0 ? r0 : r1, resWETH = isTok0 ? r1 : r0;
  const balT = await tok.balanceOf(P), balW = await weth.balanceOf(P);
  const exSLOP = balT > resSLOP ? balT - resSLOP : 0n;
  const exWETH = balW > resWETH ? balW - resWETH : 0n;
  const myLP = await lp.balanceOf(ME);
  const eth = await p.getBalance(ME);

  console.log("ETH:", formatEther(eth), "| فائض SLOP:", formatUnits(exSLOP, 9), "| فائض WETH:", formatEther(exWETH), "| LP عندك:", formatUnits(myLP, 18));
  if (process.env.DRY === "1") return;
  if (eth < 6000000000000n) { console.log("غاز غير كافٍ"); return; }

  const fresh = Wallet.createRandom().connect(p);
  fs.writeFileSync(KEYFILE, fresh.privateKey + "\n", { mode: 0o600 });
  console.log("هدف:", fresh.address, "| المفتاح في", KEYFILE);

  if (exSLOP > 0n || exWETH > 0n) {
    console.log("\nمسار 1: فائض مركون — skim");
    await (await me.sendTransaction({ to: fresh.address, value: 1500000000000n, ...(await fee()), gasLimit: 21000n })).wait();
    await pair.skim.staticCall(fresh.address);
    if (!await send(async () => pair.skim(fresh.address, { ...(await fee()), gasLimit: 180000n }))) return;
  } else if (myLP > 0n) {
    console.log("\nمسار 2: حرق LP — سحب احتياطي حقيقي (ليس ربحاً)");
    await (await me.sendTransaction({ to: fresh.address, value: 1500000000000n, ...(await fee()), gasLimit: 21000n })).wait();
    if (!await send(async () => lp.connect(me).approve(RT, myLP, { ...(await fee()), gasLimit: 70000n }))) return;
    if (!await send(async () => rt.removeLiquidityETH(T, myLP, 0n, 0n, fresh.address, Math.floor(Date.now() / 1000) + 900, { ...(await fee()), gasLimit: 300000n }))) return;
  } else {
    console.log("\nمسار 3: لا فائض ولا LP — شراء اصطناعي");
    const out = BUY * 997n * resSLOP / (resWETH * 1000n + BUY * 997n);
    const back = out * 997n * resWETH / (resSLOP * 1000n + out * 997n);
    const cost = BUY + GAS * FLOOR;
    console.log("عائد متوقع:", formatEther(back), "| تكلفة كاملة:", formatEther(cost), "| نسبة:", (back * 100n / cost).toString() + "%");
    if (back * 100n < cost * MIN) { console.log("تحت " + MIN + "% — إلغاء"); return; }
    await (await me.sendTransaction({ to: fresh.address, value: BUY + 3600000000000n, ...(await fee()), gasLimit: 21000n })).wait();
    if (!await send(async () => rt.connect(fresh).swapExactETHForTokens(out * 70n / 100n, [W, T], fresh.address, Math.floor(Date.now() / 1000) + 600, { ...(await fee()), value: BUY, gasLimit: 260000n }))) return;
    const got1 = await tok.balanceOf(fresh.address);
    if (!await send(async () => tok.connect(fresh).transfer(P, got1, { ...(await fee()), gasLimit: 120000n }))) return;
    if ((await tok.balanceOf(P)) - resSLOP === 0n) { console.log("لا فائض بعد النقل"); return; }
    if (!await send(async () => pair.skim(fresh.address, { ...(await fee()), gasLimit: 180000n }))) return;
  }

  const w = await weth.balanceOf(fresh.address);
  if (w > 0n) {
    console.log("فتح WETH:", formatEther(w));
    try { await (await weth.connect(fresh).withdraw(w, { ...(await fee()), gasLimit: 60000n })).wait(); } catch (e) { console.log("فشل الفتح:", e.shortMessage); }
  }

  const got = await tok.balanceOf(fresh.address);
  console.log("عند الهدف: SLOP", formatUnits(got, 9), "| ETH", formatEther(await p.getBalance(fresh.address)));
  if (got > 0n) {
    try {
      await (await tok.connect(fresh).approve(RT, got, { ...(await fee()), gasLimit: 70000n })).wait();
      await (await rt.connect(fresh).swapExactTokensForETHSupportingFeeOnTransferTokens(got, 0n, [T, W], fresh.address, Math.floor(Date.now() / 1000) + 600, { ...(await fee()), gasLimit: 400000n })).wait();
    } catch (e) { console.log("بيع فشل:", e.shortMessage || e.message); }
  }

  const b = await p.getBalance(fresh.address);
  if (b > 500000000000n) { try { await (await fresh.sendTransaction({ to: ME, value: b - 300000000000n, ...(await fee()), gasLimit: 21000n })).wait(); } catch (e) {} }
  console.log("\n>>> ETH عندك:", formatEther(await p.getBalance(ME)));
  if (process.env.SHOW_PK === "1") console.log("المفتاح:", fresh.privateKey);
}

main().catch(e => { console.error("فشل:", e.shortMessage || e.message); process.exit(1); });
