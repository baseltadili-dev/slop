import { keccak256, concat, zeroPadValue, toBeHex } from "ethers";

const TOK="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const PAIR="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const MC3="0xcA11bde05977b3631167028862bE2a173976CA11";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const RPCS=["https://base-rpc.publicnode.com","https://1rpc.io/base",
            "https://base.drpc.org","https://mainnet.base.org"];
const padA=a=>zeroPadValue(a,32), w32=n=>n.toString(16).padStart(64,"0");
const T0=Date.now(), log=(...a)=>console.log(`[${((Date.now()-T0)/1000).toFixed(1)}s]`,...a);

let U=null;
async function rpc(m,p,{ms=6000,re=/rate|limit|timeout/i}={}){
  const list=U?[U,...RPCS.filter(x=>x!==U)]:RPCS;
  let last="";
  for(const u of list) for(let a=0;a<2;a++){
    const c=new AbortController(), t=setTimeout(()=>c.abort(),ms);
    try{
      const r=await fetch(u,{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p}),signal:c.signal});
      const j=await r.json();
      if(j.error&&re.test(j.error.message)){last=u+" → "+j.error.message;continue;}
      U=u; return j;
    }catch(e){last=u+" → "+(e.name==="AbortError"?"timeout":e.message);}
    finally{clearTimeout(t);}
  }
  throw new Error("rpc: "+last);
}

const enc=calls=>{
  const el=calls.map(c=>{const d=c.data.slice(2);const w=Math.ceil(d.length/64);
    return padA(c.target).slice(2)+w32(0x40)+w32(d.length/2)+d.padEnd(w*64,"0");});
  let a=w32(calls.length),o=calls.length*32;
  for(const e of el){a+=w32(o);o+=e.length/2;}
  return "0xbce38bd7"+w32(0)+w32(0x40)+a+el.join("");
};
const dec=hex=>{
  const h=hex.slice(2),w=i=>h.slice(i*64,(i+1)*64);
  const b=Number(BigInt("0x"+w(0)))/32, n=Number(BigInt("0x"+w(b))), out=[];
  for(let i=0;i<n;i++){
    const e=b+1+Number(BigInt("0x"+w(b+1+i)))/32, o=Number(BigInt("0x"+w(e+1)))/32;
    const L=Number(BigInt("0x"+w(e+1+o))); let d="";
    for(let k=0;k<Math.ceil(L/32);k++) d+=w(e+1+o+1+k);
    out.push({ok:BigInt("0x"+w(e))===1n,ret:"0x"+d.slice(0,L*2)});
  }
  return out;
};

log("مرحلة 1: أرصدة");
const bal=BigInt((await rpc("eth_call",[{to:TOK,data:"0x70a08231"+padA(PAIR).slice(2)},"latest"])).result);
const res=(await rpc("eth_call",[{to:PAIR,data:"0x0902f1ac"},"latest"])).result;
const r1=BigInt("0x"+res.slice(66,130));
log("رصيد",bal.toString(),"| احتياطي",r1.toString(),"| فائض",(bal-r1).toString());

log("مرحلة 2: خانة balanceOf");
let slot=null;
for(let s=0;s<0x40&&slot===null;s+=8){
  const ks=[...Array(8)].map((_,i)=>s+i).filter(i=>i<0x40)
    .map(i=>({i,k:keccak256(concat([padA(PAIR),toBeHex(i,32)]))}));
  const vs=await Promise.all(ks.map(x=>rpc("eth_getStorageAt",[TOK,x.k,"latest"]).then(j=>j.result).catch(()=>null)));
  vs.forEach((v,i)=>{ if(v&&BigInt(v)===bal&&slot===null) slot=ks[i].i; });
}
if(slot===null){log("ما لقيت الخانة");process.exit(1);}
log("الخانة = 0x"+slot.toString(16));

const fake=bal+1000n*10n**9n;
const ov={[TOK]:{stateDiff:{[keccak256(concat([padA(PAIR),toBeHex(slot,32)]))]:toBeHex(fake,32)}}};
const data=enc([
  {target:PAIR,data:"0xbc25cf77"+padA(ME).slice(2)},
  {target:TOK, data:"0x70a08231"+padA(ME).slice(2)},
  {target:TOK, data:"0x70a08231"+padA(PAIR).slice(2)}
]);

log("مرحلة 3: تجاوز + نداء");
const j=await rpc("eth_call",[{to:MC3,data,from:ME},"latest",ov],
  {ms:12000,re:/rate|limit|timeout|invalid|override|unsupported|not supported|unknown/i});
if(j.error){log("OUTER-REVERT:",j.error.message,"|",j.error.data);process.exit(1);}

const r=dec(j.result);
const recv=r[1].ok?BigInt(r[1].ret):null, after=r[2].ok?BigInt(r[2].ret):null;
log("VERDICT|skim="+r[0].ok+"|recv="+recv+"|pairAfter="+after+"|reserve="+r1+
    "|exact="+(recv===1000n*10n**9n)+"|snapped="+(after===r1));
if(!r[0].ok) log("REVERT-DATA",r[0].ret);
