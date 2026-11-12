import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits } from "ethers";

const ME   = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const T    = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P    = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const SEND = process.argv.includes("--send");
const MIN  = parseUnits(process.env.MIN || "1000", 9);

const pk = (process.env.PK || "").trim();
if (SEND && !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
  console.error("PK غلط. لازم 0x + 64 خانة. الطول الآن:", pk.length);
  process.exit(1);
}
const url = process.env.RPC || "https://mainnet.base.org";
const p = new JsonRpcProvider(url, 8453, { staticNetwork: true });

const tok  = new Contract(T, ["function balanceOf(address) view returns (uint256)"], p);
const pair = new Contract(P, ["function skim(address)","function getReserves() view returns (uint112,uint112,uint32)"], p);

const blk = await p.getBlockNumber();
const bal = await tok.balanceOf(P);
const [r0, r1] = await pair.getReserves();
const ex  = bal - r0;
const u9  = n => formatUnits(n, 9);

console.log(`بلوك ${blk} عبر ${url}`);
console.log(`رصيد ${u9(bal)} | احتياطي ${u9(r0)} | WETH ${formatUnits(r1,18)}`);
console.log(`الفائض ${u9(ex)} SLOP`);

if (ex <= 0n) { console.log("لا فائض — الحوض مشدود."); process.exit(0); }
if (ex < MIN) { console.log(`الفائض تحت العتبة (${u9(MIN)}) — ما أرسل.`); process.exit(0); }

// محاكاة كاملة قبل أي غاز
try { await pair.skim.staticCall(ME); console.log("محاكاة: نجحت ✓"); }
catch (e) { console.log("محاكاة: ارتدّت ✗ —", e.shortMessage || e.message); process.exit(1); }

if (!SEND) { console.log("للتوقيع والإرسال: PK=0x... node skim.mjs --send"); process.exit(0); }

const w = new Wallet(pk, p);              // ← الإصلاح: سطر مستقل
const est = await pair.connect(w).skim.estimateGas(ME);
const fee = await p.getFeeData();
console.log(`تقدير الغاز ${est} | سعر ${fee.gasPrice} | كلفة ${formatUnits(est*fee.gasPrice,18)} ETH`);

const tx = await pair.connect(w).skim(ME, { gasLimit: est*13n/10n });
console.log("أُرسلت:", tx.hash);
const rc = await tx.wait();
console.log("الحالة:", rc.status === 1 ? "نجحت ✓" : "ارتدّت ✗");
if (rc.status === 1) console.log("استلمت:", u9(await tok.balanceOf(ME)), "SLOP");
