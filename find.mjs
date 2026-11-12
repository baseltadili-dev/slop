const PAIR="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const TOK ="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const WETH="0x4200000000000000000000000000000000000006";
const KEEP="0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE";
const ROUTER="0x10ED43C718714eb63d5aA57B78B54704E256024E";
const RPC="https://mainnet.base.org";
const PAIRCREATED="0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";

const call=async(to,data)=>{try{
  const r=await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_call",params:[{to,data},"latest"]})});
  const j=await r.json(); return j.result||null;
}catch{return null}};

const logs=async(fac,topic)=>{
  const t="0x"+"0".repeat(24)+TOK.slice(2).toLowerCase();
  const f={address:fac,fromBlock:"0x0",toBlock:"latest",topics:[PAIRCREATED,topic===1?t:null,topic===2?t:null]};
  try{
    const r=await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_getLogs",params:[f]})});
    const j=await r.json();
    if(j.error){console.log("  logs error:",j.error.message);return[]}
    return j.result||[];
  }catch{return[]}};

// تقسيم BigInt بلا Number
const fmt=(v,d)=>{const s=(v<0n?"-":"")+(v<0n?-v:v).toString().padStart(d+1,"0");
  const i=s.slice(0,-d), f=s.slice(-d); return i+"."+f.slice(0,6)};

// 0) تحقق من decimals قبل أي حساب
for(const [lbl,a] of [["SLOP",TOK],["WETH",WETH]]){
  const d=await call(a,"0x313ce567");
  const dec=d?Number(BigInt(d)):null;
  console.log(`${lbl} decimals = ${dec}`);
  if(dec===null){console.log("ما قدرت أقرأ decimals — وقفت");process.exit(1)}
  if(lbl==="SLOP"&&dec!==9){console.log("SLOP مو 9 !!");process.exit(1)}
}

// 1) الفاكتوري من الحوض، ومحاولة ثانية من الراوتر
const seen=new Set();
const facs=new Set();
const f1=await call(PAIR,"0xc45a0155"); if(f1)facs.add("0x"+f1.slice(-40).toLowerCase());
const f2=await call(ROUTER,"0xc45a0155"); if(f2)facs.add("0x"+f2.slice(-40).toLowerCase());
console.log("فاكتوري:",[...facs].join(" , "));

// 2) PairCreated بالحدث — بلا لف على كل الأحواض
for(const f of facs){
  for(const pos of [1,2]){
    const ls=await logs(f,pos);
    for(const l of ls){
      const w=l.data.slice(2);
      const a="0x"+w.slice(24,64).toLowerCase();
      const b="0x"+w.slice(88,128).toLowerCase();
      if(a===TOK.toLowerCase()||b===TOK.toLowerCase()) seen.add(a+"|"+b);
    }
  }
}
console.log("أحواض فيها SLOP:",seen.size);

// 3) لكل حوض: أرصدة واحتياطيات وفائض
for(const k of seen){
  const [a,b]=k.split("|");
  const rs=await call(a,"0x0902f1ac"); if(!rs)continue;
  const t0=a===TOK.toLowerCase()?TOK:WETH, t1=b===TOK.toLowerCase()?TOK:WETH;
  const bl=await call(TOK,"0x70a08231"+"0".repeat(24)+a.slice(2));
  if(!bl)continue;
  const r0=BigInt("0x"+rs.slice(2,66)), r1=BigInt("0x"+rs.slice(66,130));
  const rsSlop=t0===TOK?r0:r1, rWeth=t0===TOK?r1:r0;
  const bw=await call(WETH,"0x70a08231"+"0".repeat(24)+a.slice(2));
  const bWeth=bw?BigInt(bw):0n;
  const ex=BigInt(bl)-rsSlop, exW=bWeth-rWeth;
  console.log(`\nحوض ${a}`);
  console.log(`  SLOP رصيد ${fmt(BigInt(bl),9)} | احتياطي ${fmt(rsSlop,9)} | فائض ${fmt(ex,9)}`);
  console.log(`  WETH رصيد ${fmt(bWeth,18)} | احتياطي ${fmt(rWeth,18)} | فائض ${fmt(exW,18)}`);
  if(ex>0n&&exW>=0n)console.log("  ← قابل للسحب بـ skim");
}

// 4) أرصدة الحارس والمالك
const own=await call(KEEP,"0x8da5cb5b");
const owner=own?"0x"+own.slice(-40):null;
console.log(`\nمالك الحارس: ${owner||"تعذّر"}`);
for(const [lbl,ad] of [["الحارس",KEEP],["المالك",owner]]){
  if(!ad)continue;
  const b=await call(TOK,"0x70a08231"+"0".repeat(24)+ad.slice(2));
  console.log(`SLOP عند ${lbl} ${ad}: ${b?fmt(BigInt(b),9):"?"}`);
}
