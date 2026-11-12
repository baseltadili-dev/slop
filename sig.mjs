import { id, keccak256, concat, zeroPadValue, toBeHex, formatUnits, formatEther } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const slot = (a, s) => keccak256(concat([zeroPadValue(a, 32), toBeHex(s, 32)]));
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const dec = d => { if (!d || !d.startsWith("0x08c379a0")) return "(بلا نص)"; try { const n = parseInt(d.slice(66, 130), 16); return Buffer.from(d.slice(130, 130 + n * 2), "hex").toString(); } catch { return "?"; } };

const code = (await j("eth_getCode", [P, "latest"])).result;
const sels = [...new Set((code.match(/63[0-9a-f]{8}14/g) || []).map(x => x.slice(2, 10)))];
console.log("محددات في الكود:", sels.length);
console.log(sels.join(" "));

const KNOWN = {
  "022c0d9f": "swap(uint256,uint256,address,bytes)",
  "bc25cf77": "skim(address)", "fff6cae9": "sync()", "0902f1ac": "getReserves()",
  "0dfe1681": "token0()", "d21220a7": "token1()", "70a08231": "balanceOf(address)",
  "6a627842": "mint(address)", "89afcb44": "burn(address)", "18160ddd": "totalSupply()",
  "d505accf": "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
  "3644e515": "DOMAIN_SEPARATOR()", "7ecebe00": "nonces(address)",
  "5a3d5493": "price0CumulativeLast()", "5909c0d5": "price1CumulativeLast()",
  "7464fc3d": "kLast()", "1a686502": "MINIMUM_LIQUIDITY()", "c45a0155": "factory()",
  "2779cd97": "initialize(address,address)", "30adf81f": "PERMIT_TYPEHASH()"
};

const CAND = [
  "swap(uint256,uint256,address,bytes,uint256)", "swap(uint256,uint256,address,uint256,bytes)",
  "swap(uint256,uint256,address,uint256)", "swap(address,uint256,uint256,bytes)",
  "swap(uint256,uint256,address,bytes,uint256,uint8,bytes32,bytes32)",
  "swap(uint256,uint256,address,bytes,uint256,bytes)", "swap(address,uint256,uint256,bytes,uint256)",
  "swap(uint256,uint256,address,bytes,address)", "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
  "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)",
  "swapWithPermit(uint256,uint256,address,bytes,uint256,uint8,bytes32,bytes32)"
];

console.log("\n=== تعريف المحددات ===");
for (const s of sels) {
  if (KNOWN[s]) console.log(s, "=", KNOWN[s]);
  else {
    let hit = CAND.find(c => id(c).slice(2, 10) === s);
    console.log(s, hit ? "★ " + hit : "؟ غير معروف");
  }
}

const rv = (await j("eth_call", [{ to: P, data: "0x0902f1ac" }, "latest"])).result;
const r0 = BigInt("0x" + rv.slice(2, 66)), r1 = BigInt("0x" + rv.slice(66, 130));
const tk0 = "0x" + (await j("eth_call", [{ to: P, data: "0x0dfe1681" }, "latest"])).result.slice(-40).toLowerCase();
const isW0 = tk0 === W.toLowerCase();
const rW = isW0 ? r0 : r1;
const balT = await bn(T, "0x70a08231" + pad(P));
const ov = { [T]: { stateDiff: { [slot(P, 1)]: "0x" + (balT + 10n ** 21n).toString(16).padStart(64, "0") } } };
const call = async (lbl, data, o) => {
  const pr = [{ from: ME, to: P, data, gas: "0x120000" }, "latest"];
  if (o) pr.push(o);
  const r = await j("eth_call", pr);
  console.log((r.error ? "✗ " : "✓ ") + lbl + (r.error ? "  " + dec(r.error.data) : ""));
  return !r.error;
};

console.log("\n=== تأكيد أن التجاوز يعمل (skim) ===");
await call("skim مع فائض مصطنع", "0xbc25cf77" + pad(ME), ov);
await call("skim بدون تجاوز", "0xbc25cf77" + pad(ME), undefined);

console.log("\n=== sync الحقيقي ===");
await call("sync()", "0xfff6cae9", undefined);

console.log("\n=== تجربة كل توقيع swap مطابق ===");
const dl = BigInt(Math.floor(Date.now() / 1000) + 900);
const a0 = isW0 ? 10n ** 18n : 0n, a1 = isW0 ? 0n : 10n ** 18n;
const base = "0x" + (isW0 ? w32(a0) + w32(a1) : w32(a0) + w32(a1)) + pad(ME);
const tests = {
  "swap(4,bytes)": "0x022c0d9f" + base + w32(0x80) + w32(0),
  "swap(4,deadline)": "0x022c0d9f" + base + w32(0x80) + w32(dl) + w32(0),
  "swap(deadline,bytes)": "0x022c0d9f" + base + w32(dl) + w32(0xa0) + w32(0)
};
for (const [k, d] of Object.entries(tests)) await call(k, d, ov);
