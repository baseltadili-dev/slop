import fs from "node:fs";

const ADDRESS = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const RPC = "https://mainnet.base.org";

const hex = fs.readFileSync("slop-runtime.hex", "utf8").trim().replace(/^0x/, "");
const code = Buffer.from(hex, "hex");

function section(name) {
  console.log("\n" + "=".repeat(65));
  console.log(name);
  console.log("=".repeat(65));
}

function word(n) {
  return "0x" + BigInt(n).toString(16).padStart(64, "0");
}

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const j = await r.json();
  if (j.error) throw Error(j.error.message);
  return j.result;
}

section("1. معلومات العقد");
console.log("Address:", ADDRESS);
console.log("Chain: Base (8453)");
console.log("Runtime bytes:", code.length);

section("2. دوال ERC20 القياسية");
const standard = {
  "06fdde03": "name()",
  "095ea7b3": "approve(address,uint256)",
  "18160ddd": "totalSupply()",
  "23b872dd": "transferFrom(address,address,uint256)",
  "313ce567": "decimals()",
  "70a08231": "balanceOf(address)",
  "95d89b41": "symbol()",
  "a9059cbb": "transfer(address,uint256)",
  "dd62ed3e": "allowance(address,address)"
};
for (const [s, n] of Object.entries(standard)) {
  console.log(s, n);
}

section("3. دوال العقد المكتشفة في Dispatcher");
const seen = new Set();
for (let i = 0; i < Math.min(code.length - 12, 0x800); i++) {
  if (code[i] !== 0x63) continue;
  const selector = code.subarray(i + 1, i + 5).toString("hex");
  if (seen.has(selector)) continue;

  const end = Math.min(i + 20, code.length - 4);
  for (let k = i + 5; k < end; k++) {
    if (code[k] === 0x14) {
      for (let p = k + 1; p < Math.min(k + 8, end - 3); p++) {
        if (code[p] === 0x61 && code[p + 3] === 0x57) {
          const dest = code.readUInt16BE(p + 1);
          console.log("0x" + selector, "-> entry 0x" + dest.toString(16));
          seen.add(selector);
          break;
        }
      }
      if (seen.has(selector)) break;
    }
  }
}

section("4. النصوص ورسائل الرفض");
const printable = code.toString("latin1");
const re = /[\x20-\x7e]{4,}/g;
for (const m of printable.matchAll(re)) {
  console.log("0x" + m.index.toString(16), m[0]);
}

section("5. تعليمات حساسة في Bytecode");
const counts = {
  SLOAD: 0,
  SSTORE: 0,
  CALL: 0,
  STATICCALL: 0,
  DELEGATECALL: 0,
  SELFDESTRUCT: 0
};

const locations = Object.fromEntries(Object.keys(counts).map(k => [k, []]));

for (let i = 0; i < code.length;) {
  const op = code[i];
  const names = {
    0x54: "SLOAD",
    0x55: "SSTORE",
    0xf1: "CALL",
    0xfa: "STATICCALL",
    0xf4: "DELEGATECALL",
    0xff: "SELFDESTRUCT"
  };

  if (names[op]) {
    const n = names[op];
    counts[n]++;
    if (locations[n].length < 80) locations[n].push("0x" + i.toString(16));
  }

  i += op >= 0x60 && op <= 0x7f ? op - 0x5f + 1 : 1;
}

for (const [name, count] of Object.entries(counts)) {
  console.log(name + ":", count);
  if (locations[name].length)
    console.log("  locations:", locations[name].join(", "));
}

section("6. قراءة معلومات عامة من الشبكة");
const views = [
  ["name", "0x06fdde03"],
  ["symbol", "0x95d89b41"],
  ["decimals", "0x313ce567"],
  ["totalSupply", "0x18160ddd"],
  ["pair getter", "0x49bd5a5e"]
];

for (const [name, selector] of views) {
  try {
    const result = await rpc("eth_call", [
      { to: ADDRESS, data: "0x" + selector },
      "latest"
    ]);
    console.log(name + ":", result);
  } catch (e) {
    console.log(name + ": قراءة غير متاحة -", e.message);
  }
}

section("7. قراءة Slots للتخزين فقط");
for (const slot of [0, 1, 2, 0x11, 0x19, 0x1a, 0x1b, 0x1c, 0x25]) {
  try {
    const value = await rpc("eth_getStorageAt", [
      ADDRESS,
      word(slot),
      "latest"
    ]);
    console.log("slot", "0x" + slot.toString(16), "=", value);
  } catch (e) {
    console.log("slot", slot, "خطأ:", e.message);
  }
}

section("انتهى الفحص");
console.log("هذا تقرير استكشاف ثابت وقراءة فقط.");
console.log("وجود تعليمة أو دالة لا يثبت وحده وجود ثغرة.");
