import { id } from "ethers";
const TOK="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const WETH="0x4200000000000000000000000000000000000006";
const PAIR="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const FAC="0x8909dc15e40173ff4699343b6eb8132c65e18ec6";
const U="https://base-rpc.publicnode.com";
const SYNC=id("Sync(uint112,uint112)");
const PC=id("PairCreated(address,address,address,uint256)");
const CREATED=1793025797;
const padA=a=>"0".repeat(24)+a.slice(2).toLowerCase();
const T="0x"+padA(TOK);

const rpc=async(m,p)=>{const r=await fetch(U,{method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})});
  return r.json()};
const call=async(to,data)=>(await rpc("eth_call",[{to,data},"latest"])).result||null;

// 1) getPair — هل في حوض ثاني لنفس الزوج؟
const gp=await call(FAC,"0xe6a43905"+padA(TOK)+padA(WETH));
console.log("getPair(SLOP,WETH) =",gp?"0x"+gp.slice(-40):"فشل");
if(gp)console.log(gp.slice(-40).toLowerCase()===PAIR.slice(2).toLowerCase()
  ? "  ✓ نفس الحوض المعروف — لا حوض ثانٍ لنفس الزوج"
  : "  ⚠ حوض مختلف!");

// 2) شاهد getLogs على مدى أعرض وحول النشاط الحالي
const head=parseInt((await rpc("eth_blockNumber",[])).result,16);
const hb=await rpc("eth_getBlockByNumber",["0x"+head.toString(16),false]);
console.log("head",head,"ts",hb.result?Number(BigInt(hb.result.timestamp)):"?");

for(const span of [200,5000,20000]){
  const j=await rpc("eth_getLogs",[{address:PAIR,
    fromBlock:"0x"+(head-span).toString(16),toBlock:"latest",topics:[SYNC]}]);
  console.log(`شاهد Sync آخر ${span} بلوك:`,j.error?"✗ "+j.error.message:j.result.length+" حدث");
}

// 3) بلوك الإنشاء — بحث ثنائي بمدى أوسع
let lo=head-4000000, hi=head;
while(lo<hi){
  const mid=Math.floor((lo+hi)/2);
  const b=(await rpc("eth_getBlockByNumber",["0x"+mid.toString(16),false])).result;
  if(!b){console.log("بلوك مفقود",mid);break}
  if(Number(BigInt(b.timestamp))>=CREATED) hi=mid; else lo=mid+1;
}
console.log("بلوك الإنشاء ≈",lo);
const f0="0x"+(lo-3000).toString(16), f1="0x"+(lo+3000).toString(16);
for(const pos of [1,2]){
  const j=await rpc("eth_getLogs",[{address:FAC,fromBlock:f0,toBlock:f1,
    topics:[PC,pos===1?T:null,pos===2?T:null]}]);
  if(j.error){console.log(`topic${pos} ✗`,j.error.message);continue}
  console.log(`topic${pos}: ${j.result.length} حدث`);
  for(const l of j.result)console.log("  حوض:","0x"+l.data.slice(2).slice(24,64));
}
