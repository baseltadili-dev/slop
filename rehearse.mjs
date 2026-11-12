import { keccak256, concat, zeroPadValue, toBeHex } from "ethers";

const TOK = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const PAIR= "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const MC3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const ME  = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const RPCS= ["https://base-rpc.publicnode.com","https://base.drpc.org",
             "https://1rpc.io/base","https://mainnet.base.org"];

const padA = a => zeroPadValue(a, 32);
const w32  = n => n.toString(16).padStart(64, "0");
const gwei = 10n ** 9n;

const rpc = async (u, m, p) => {
  const r = await fetch(u, { method:"POST", headers:{"content-type":"application/json"},
    body: JSON.stringify({ jsonrpc:"2.0", id:1, method:m, params:p }) });
  return r.json();
};

let U = null;
for (const u of RPCS) { try { if ((await rpc(u,"eth_blockNumber",[])).result) { U = u; break; } } catch {} }
if (!U) { console.log("ما في RPC شغّال"); process.exit(1); }
console.log("RPC:", U);

// ترميز يدوي: tryAggregate(bool,(address,bytes)[])  = 0xbce38bd7
function encodeAgg(calls){
  const el = calls.map(c => {
    const d = c.data.replace(/^0x/,"");
    const words = Math.ceil(d.length/64);
    return padA(c.target).slice(2) + w32(0x40) + w32(d.length/2) + d.padEnd(words*64,"0");
  });
  let arr = w32(calls.length), off = calls.length*32;
  for (const e of el){ arr += w32(off); off += e.length/2; }
  return "0xbce38bd7" + w32(0) + w32(0x40) + arr + el.join("");
}

// فك يدوي لـ (bool,bytes)[]
function decodeAgg(hex){
  const h = hex.replace(/^0x/,"");
  const w = i => h.slice(i*64, (i+1)*64);
  const base = Number(BigInt("0x"+w(0)))/32;
  const len  = Number(BigInt("0x"+w(base)));
  const out = [];
  for (let i=0;i<len;i++){
    const e = base + 1 + Number(BigInt("0x"+w(base+1+i)))/32;
    const bOff = Number(BigInt("0x"+w(e+1)))/32;
    const bLen = Number(BigInt("0x"+w(e+1+bOff)));
    let d = "";
    for (let k=0;k<Math.ceil(bLen/32);k++) d += w(e+1+bOff+1+k);
    out.push({ success: BigInt("0x"+w(e)) === 1n, data: "0x"+d.slice(0,bLen*2) });
  }
  return out;
}

// 1) الرصيد والاحتياطي
const bal = BigInt((await rpc(U,"eth_call",[{to:TOK,data:"0x70a08231"+padA(PAIR).slice(2)},"latest"])).result);
const res = (await rpc(U,"eth_call",[{to:PAIR,data:"0x0902f1ac"},"latest"])).result;
const r0 = BigInt("0x"+res.slice(2,66)), r1 = BigInt("0x"+res.slice(66,130));
console.log("رصيد الحوض:", bal.toString(), "| فائض SLOP:", (bal-r1).toString(), "| فائض WETH:", (BigInt((await rpc(U,"eth_call",[{to:"0x4200000000000000000000000000000000000006",data:"0x70a08231"+padA(PAIR).slice(2)},"latest"])).result)-r0).toString());

// 2) خانة balanceOf
let slot = null;
for (let s=0;s<0x60;s++){
  const k = keccak256(concat([padA(PAIR), toBeHex(s,32)]));
  const v = (await rpc(U,"eth_getStorageAt",[TOK,k,"latest"])).result;
  if (v && BigInt(v) === bal){ slot = s; break; }
}
if (slot === null){ console.log("ما لقيت الخانة"); process.exit(1); }
console.log("خانة balanceOf = 0x"+slot.toString(16));

// 3) تجاوز: +1000 SLOP
const fake = bal + 1000n*gwei;
const key  = keccak256(concat([padA(PAIR), toBeHex(slot,32)]));
const ov   = { [TOK]: { stateDiff: { [key]: toBeHex(fake,32) } } };
console.log("رصيد مزوّر:", fake.toString());

// 4) skim + balanceOf(ME) في نداء واحد
const data = encodeAgg([
  { target:PAIR, data:"0xbc25cf77"+padA(ME).slice(2) },
  { target:TOK,  data:"0x70a08231"+padA(ME).slice(2) }
]);

const j = await rpc(U,"eth_call",[{to:MC3, data, from:ME},"latest",ov]);
if (j.error){ console.log("ارتدّ:", j.error.message, "| data:", j.error.data); process.exit(1); }
console.log("نتيجة خام:", j.result.slice(0,140)+"...");

const r = decodeAgg(j.result);
console.log("skim نجحت؟", r[0].success);
console.log("المبلغ المستلم:", r[1].success ? BigInt(r[1].data).toString() : "?");
