// slop-crack2.mjs  test <name> | dict | brute <addr|uint256>
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { ethers } from "ethers";
import os from "node:os";

const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const MGR = "0x119fdC1e88b92A1F6565203b4288bEd3c9d8d125f9".replace("d3c9d8d125f9","") || "";
const mgr = "0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE";
const sel = (s) => ethers.id(s).slice(0, 10);
const b36 = (n) => { let s = ""; do { s = "0123456789abcdefghijklmnopqrstuvwxyz"[n % 36] + s; n = (n / 36) | 0; } while (s.length < 7); return s; };
const mode = process.argv[2];

if (!isMainThread) {
  const { suffix, target, id, n } = workerData;
  for (let i = id; ; i += n) {
    const s = b36(i);
    if (sel(s + suffix) === target) { parentPort.postMessage(s); break; }
  }
}

if (mode === "test") {
  const nm = process.argv[3];
  for (const suf of ["(address)", "(uint256)", "(address,bool)"])
    console.log(sel(nm + suf), "  ", nm + suf, sel(nm + suf) === "0x1fe0624c" ? "<- setWallet" : sel(nm + suf) === "0xccb9135c" ? "<- pull" : "");
  process.exit(0);
}

const dict = ["setWallet","setFeeWallet","setMarketingWallet","setTreasury","setWalletAddress","wallet","setBuyWallet","setPair","setExcluded","setBlacklist","mxuenirbara","pullFromPair","pull","rescue","withdraw","skim","airdrop","setTax","setFees","setLimits"];
if (mode === "dict") {
  for (const nm of dict) {
    const a = sel(nm + "(address)"), u = sel(nm + "(uint256)");
    if (a === "0x1fe0624c") console.log("SETWALLET =", nm);
    if (u === "0xccb9135c") console.log("PULL      =", nm);
  }
  console.log("dict done"); process.exit(0);
}

if (mode === "brute") {
  const which = process.argv[3] || "uint256";
  const suffix = "(" + which + ")";
  const target = which === "uint256" ? "0xccb9135c" : "0x1fe0624c";
  const n = Math.max(1, os.cpus().length), t0 = Date.now();
  console.log(`brute ${suffix} -> ${target} on ${n} cores`);
  const iv = setInterval(() => console.log(`${((Date.now() - t0) / 1000) | 0}s`), 20000);
  for (let i = 0; i < n; i++) {
    const wk = new Worker(new URL(import.meta.url), { workerData: { suffix, target, id: i, n } });
    wk.on("message", (s) => { clearInterval(iv); console.log(`\nHIT: "${s}${suffix}"`); process.exit(0); });
  }
}
