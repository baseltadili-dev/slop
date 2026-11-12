import fs from "node:fs";

const file = "slop-runtime.hex";
if (!fs.existsSync(file)) throw Error("ملف slop-runtime.hex غير موجود");

const hex = fs.readFileSync(file, "utf8").trim().replace(/^0x/, "");
const b = Buffer.from(hex, "hex");

const names = {
  0x00:"STOP",0x01:"ADD",0x02:"MUL",0x03:"SUB",0x04:"DIV",
  0x05:"SDIV",0x06:"MOD",0x08:"ADDMOD",0x09:"MULMOD",
  0x10:"LT",0x11:"GT",0x14:"EQ",0x15:"ISZERO",
  0x16:"AND",0x17:"OR",0x18:"XOR",0x19:"NOT",
  0x20:"KECCAK256",0x30:"ADDRESS",0x31:"BALANCE",
  0x32:"ORIGIN",0x33:"CALLER",0x34:"CALLVALUE",
  0x35:"CALLDATALOAD",0x36:"CALLDATASIZE",
  0x37:"CALLDATACOPY",0x38:"CODESIZE",0x39:"CODECOPY",
  0x3d:"RETURNDATASIZE",0x3e:"RETURNDATACOPY",
  0x40:"BLOCKHASH",0x41:"COINBASE",0x42:"TIMESTAMP",
  0x43:"NUMBER",0x45:"GASLIMIT",0x50:"POP",
  0x51:"MLOAD",0x52:"MSTORE",0x53:"MSTORE8",
  0x54:"SLOAD",0x55:"SSTORE",0x56:"JUMP",
  0x57:"JUMPI",0x5b:"JUMPDEST",0x5f:"PUSH0",
  0xf1:"CALL",0xfa:"STATICCALL",0xf4:"DELEGATECALL",
  0xf3:"RETURN",0xfd:"REVERT",0xfe:"INVALID",0xff:"SELFDESTRUCT"
};

function decode() {
  const out = [];
  for (let pc = 0; pc < b.length;) {
    const start = pc;
    const op = b[pc++];
    let arg = "";
    if (op >= 0x60 && op <= 0x7f) {
      const n = op - 0x5f;
      arg = "0x" + b.subarray(pc, pc+n).toString("hex");
      pc += n;
    } else if (op === 0x5f) {
      arg = "0";
    }
    const name = op >= 0x60 && op <= 0x7f
      ? "PUSH" + (op - 0x5f)
      : op >= 0x80 && op <= 0x8f
      ? "DUP" + (op - 0x7f)
      : op >= 0x90 && op <= 0x9f
      ? "SWAP" + (op - 0x8f)
      : names[op] || "OP_" + op.toString(16).padStart(2,"0");
    out.push({pc:start, op, name, arg});
  }
  return out;
}

const ins = decode();
const targets = ["SSTORE","SLOAD","CALL","STATICCALL","DELEGATECALL","SELFDESTRUCT","REVERT"];

console.log("SLOP BYTECODE DEEP AUDIT");
console.log("Bytes:", b.length, "| Instructions:", ins.length);

for (const target of targets) {
  const hits = ins.map((x,i)=>({...x,i})).filter(x=>x.name===target);
  console.log("\n" + "=".repeat(55));
  console.log(target + " — count: " + hits.length);
  for (const hit of hits) {
    console.log("\n--- Offset 0x" + hit.pc.toString(16) + " ---");
    const from = Math.max(0, hit.i-12);
    const to = Math.min(ins.length, hit.i+9);
    for (let j=from;j<to;j++) {
      const x=ins[j];
      console.log(
        (j===hit.i ? " >>> " : "     ") +
        "0x"+x.pc.toString(16).padStart(4,"0")+
        "  "+x.name+
        (x.arg ? " "+x.arg : "")
      );
    }
  }
}

console.log("\n" + "=".repeat(55));
console.log("DISPATCHER SELECTORS");
for(let i=0;i<ins.length-3;i++){
  const x=ins[i];
  if(x.name!=="PUSH4") continue;
  if(ins[i+1]?.name!=="EQ") continue;
  const dest=ins.slice(i+2,i+5).find(y=>y.name==="PUSH2");
  if(dest) console.log(x.arg,"=>",dest.arg);
}

console.log("\nانتهى التحليل الثابت. لم يتم إرسال أي معاملة.");
