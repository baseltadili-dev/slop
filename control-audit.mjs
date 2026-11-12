import { ethers } from "ethers";

const RPC = "https://mainnet.base.org";
const TOKEN = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";

const p = new ethers.JsonRpcProvider(RPC);
const selectors = [
  "owner()",
  "admin()",
  "getOwner()",
  "paused()",
  "isBlacklisted(address)",
  "blacklist(address)",
  "setBlacklist(address,bool)",
  "setTax(uint256)",
  "setFee(uint256)",
  "setPair(address)",
  "renounceOwnership()",
  "transferOwnership(address)"
];

const slots = [0x02,0x0e,0x11,0x1a,0x1d,0x1e];

console.log("=== SLOP CONTROL AUDIT ===");
console.log("Block:", await p.getBlockNumber());

for (const sig of selectors) {
  const selector = ethers.id(sig).slice(0,10);
  try {
    const data = await p.call({
      to: TOKEN,
      data: selector + (sig.includes("(address)") ? "0".repeat(64) : "")
    });
    console.log(sig, "=>", data);
  } catch {
    console.log(sig, "=> unavailable / reverted");
  }
}

console.log("\n=== STORAGE ===");
for (const n of slots) {
  const slot = ethers.toBeHex(n,32);
  console.log(slot, await p.getStorage(TOKEN,slot));
}

console.log("\n=== BYTECODE FLAGS ===");
const code = await p.getCode(TOKEN);
console.log("Bytecode bytes:", (code.length-2)/2);
for (const op of ["f1","f2","f4","ff","fa"]) {
  const count = (code.slice(2).match(new RegExp(op,"gi")) || []).length;
  console.log(op, count);
}
console.log("\nRead-only audit finished. No transaction sent.");
