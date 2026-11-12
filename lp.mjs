import { formatUnits } from "ethers";

const R = "https://mainnet.base.org";
const H = "0x093ff43dc36f83b0b18fb9ce72ec7a4966901259174814ae48b3acf271c5e5b8";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W = "0x4200000000000000000000000000000000000006";
const HOLD = "0xb31c22569075b0068480b72a3959b0348099f8c8";
const ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const TR = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MINT = "0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const a = t => "0x" + t.slice(26).toLowerCase();
const bn = async (to, data) => { const r = await j("eth_call", [{ to, data }, "latest"]); return r.error ? null : BigInt(r.result); };
const who = x => { const l = x.toLowerCase(); return l === T.toLowerCase() ? "SLOP" : l === W.toLowerCase() ? "WETH" : l === P.toLowerCase() ? "LP-TOKEN" : l === ROUTER.toLowerCase() ? "ROUTER" : l; };

const tx = (await j("eth_getTransactionByHash", [H])).result;
if (!tx) { console.log("المعاملة غير موجودة"); process.exit(1); }
const rc = (await j("eth_getTransactionReceipt", [H])).result;

console.log("=== المعاملة ===");
console.log("الحالة:", rc.status === "0x1" ? "نجحت" : "فشلت");
console.log("المرسل:", tx.from);
console.log("إلى:", who(tx.to));
console.log("المحدد:", tx.input.slice(0, 10));
console.log("الكتلة:", parseInt(tx.blockNumber, 16));
console.log("القيمة (ETH):", formatUnits(BigInt(tx.value), 18));

console.log("\n=== الـ Logs ===");
for (const l of rc.logs) {
  const t0 = l.topics[0];
  if (l.address.toLowerCase() === P.toLowerCase() && t0 === MINT) {
    console.log("MINT | من:", a(l.topics[1]), "| amount0:", u(BigInt(l.data.slice(2, 66)), 18), "| amount1:", u(BigInt(l.data.slice(66, 130)), 9));
  } else if (t0 === TR && l.topics.length === 3) {
    console.log("TRANSFER " + who(l.address) + " |", a(l.topics[1]), "→", a(l.topics[2]), "|", u(BigInt(l.data), l.address.toLowerCase() === P.toLowerCase() ? 18 : 9));
  } else {
    console.log("LOG عند", who(l.address), "| topic0:", t0.slice(0, 10));
  }
}

const ts = await bn(P, "0x18160ddd");
const bal = await bn(P, "0x70a08231" + "0".repeat(24) + HOLD.slice(2).toLowerCase());
const dead = await bn(P, "0x70a08231" + "0".repeat(24) + DEAD.slice(2).toLowerCase());
const rbal = await bn(P, "0x70a08231" + "0".repeat(24) + ROUTER.slice(2).toLowerCase());

console.log("\n=== حصص LP الآن ===");
console.log("العرض الكلي:", formatUnits(ts, 18));
console.log("عند صاحب الحصص:", formatUnits(bal, 18), "=", (bal * 10000n / ts).toString() / 100 + "%");
console.log("عند الراوتر (متبقٍ):", formatUnits(rbal ?? 0n, 18));
console.log("محروق/مقفل:", formatUnits(dead, 18), "| العنوان الصفري:", formatUnits(await bn(P, "0x70a08231" + "0".repeat(24) + "0".repeat(40)) ?? 0n, 18));

console.log("\n=== خروج أي LP من عنوان صاحب الحصص ===");
const from = parseInt(tx.blockNumber, 16);
let logs = [];
for (let s = from; s <= from + 600000; s += 100000) {
  const r = await j("eth_getLogs", [{ address: P, fromBlock: "0x" + s.toString(16), toBlock: "latest", topics: [TR, "0x" + "0".repeat(24) + HOLD.slice(2).toLowerCase()] }]);
  if (r.error) { console.log("خطأ في النطاق", s, r.error.message); break; }
  logs = logs.concat(r.result);
  if (r.result.length < 1000) break;
}
if (!logs.length) console.log("لا شيء — الحصص لم تخرج من هذا العنوان إطلاقاً");
for (const l of logs) console.log("الكتلة", parseInt(l.blockNumber, 16), "→", a(l.topics[2]), "|", formatUnits(BigInt(l.data), 18));
