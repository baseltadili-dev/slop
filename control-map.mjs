import fs from "node:fs";

const file = "slop-runtime.hex";
if (!fs.existsSync(file)) {
  console.log("الملف غير موجود:", file);
  process.exit(1);
}

const hex = fs.readFileSync(file, "utf8").replace(/^0x/, "").replace(/[^0-9a-f]/gi, "");
if (!hex.length || hex.length % 2) throw Error("ملف bytecode غير صالح");

const b = Buffer.from(hex, "hex");

const names = {
  0x14:"EQ",0x15:"ISZERO",0x10:"LT",0x11:"GT",
  0x33:"CALLER",0x32:"ORIGIN",0x54:"SLOAD",
  0x55:"SSTORE",0x56:"JUMP",0x57:"JUMPI",
  0x5b:"JUMPDEST",0xf1:"CALL",0xf2:"CALLCODE",
  0xf4:"DELEGATECALL",0xfa:"STATICCALL",
  0xfd:"REVERT",0xff:"SELFDESTRUCT",0x50:"POP",
  0x01:"ADD",0x02:"MUL",0x03:"SUB",0x16:"AND",
  0x17:"OR",0x18:"XOR",0x19:"NOT",0x20:"KECCAK256",
  0x35:"CALLDATALOAD",0x36:"CALLDATASIZE",
  0x37:"CALLDATACOPY",0x3d:"RETURNDATASIZE",
  0x3e:"RETURNDATACOPY",0x40:"BLOCKHASH",
  0x41:"COINBASE",0x42:"TIMESTAMP",0x43:"NUMBER",
  0x45:"GASLIMIT",0x46:"CHAINID",0x47:"SELFBALANCE",
  0x48:"BASEFEE",0x5a:"GAS",0xf3:"RETURN"
};

const ins = [];
for (let pc = 0; pc < b.length;) {
  const at = pc, op = b[pc++];
  let arg = "";
  if (op >= 0x60 && op <= 0x7f) {
    const n = op - 0x5f;
    arg = b.subarray(pc, pc + n).toString("hex");
    pc += n;
  }
  const name = op >= 0x60 && op <= 0x7f
    ? `PUSH${op - 0x5f}`
    : op >= 0x80 && op <= 0x8f ? `DUP${op - 0x7f}`
    : op >= 0x90 && op <= 0x9f ? `SWAP${op - 0x8f}`
    : names[op] || `OP_${op.toString(16).padStart(2,"0")}`;
  ins.push({pc:at, op, name, arg});
}

const fmt = x =>
  "0x" + x.pc.toString(16).padStart(4,"0") + "  " +
  x.name.padEnd(13) + (x.arg ? "0x" + x.arg : "");

console.log("BYTECODE:", b.length, "bytes");
console.log("\n=== DISPATCHER SELECTOR CANDIDATES ===");

let found = 0;
for (let i = 0; i < ins.length; i++) {
  if (ins[i].op !== 0x63) continue;
  const next = ins.slice(i + 1, i + 5);
  const eq = next.findIndex(x => x.op === 0x14);
  const dest = next.find(x => x.op === 0x61);
  const jumpi = next.find(x => x.op === 0x57);
  if (eq >= 0 && dest && jumpi) {
    console.log(
      "selector=0x" + ins[i].arg,
      "candidate destination=0x" + parseInt(dest.arg || "0",16).toString(16)
    );
    found++;
  }
}
if (!found) console.log("No obvious selector pattern found");

console.log("\n=== SSTORE CONTEXTS ===");
const stores = ins.map((x,i) => ({x,i})).filter(v => v.x.op === 0x55);

for (const {x,i} of stores) {
  console.log(`\n--- SSTORE at 0x${x.pc.toString(16)} ---`);
  const start = Math.max(0, i - 24);
  const end = Math.min(ins.length, i + 7);
  for (let j = start; j < end; j++) {
    console.log((j === i ? ">>> " : "    ") + fmt(ins[j]));
  }
  const nearby = ins.slice(start, end);
  console.log("Nearby access checks:",
    nearby.filter(v => [0x33,0x32,0x14,0x57,0x54,0xfa].includes(v.op))
      .map(v => `${v.name}@0x${v.pc.toString(16)}`).join(", ") || "none");
}

console.log("\n=== END: STATIC ANALYSIS ONLY; NO TRANSACTIONS ===");
