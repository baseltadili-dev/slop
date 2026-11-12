import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits, formatEther } from "ethers";

const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const MIN=parseUnits(process.env.MIN||"50",9);
const POOLF=process.env.HOME+"/slop/pool.json";
const PR=3000000n;                 // 0.003 gwei بقشيش
const FUND=8000000000000n;         // 0.000008 لكل عنوان مساعد
const SEED=parseUnits(process.env.N||"120",9);

const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const me=new Wallet(process.env.PK,p), ME=await me.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],p);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)","function skim(address)"],p);

const gp=async()=>BigInt((await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]})}).then(r=>r.json())).result);
const tip=async()=>{const g=await gp();const mf=g*3n>PR*2n?g*3n:PR*2n;return {maxFeePerGas:mf,maxPriorityFeePerGas:PR};};

let pool=fs.existsSync(POOLF)?JSON.parse(fs.readFileSync(POOLF,"utf8")):[];
while(pool.length<4){const x=Wallet.createRandom();pool.push({pk:x.privateKey,addr:x.address});}
pool=pool.slice(0,4);
fs.writeFileSync(POOLF,JSON.stringify(pool,null,2));

const bal=await p.getBalance(ME);
console.log("غاز:",formatEther(bal),"ETH | SLOP:",formatUnits(await tok.balanceOf(ME),9));
for(const a of pool){
  if(await p.getBalance(a.addr)<FUND){
    const t=await me.sendTransaction({to:a.addr,value:FUND,...(await tip())}); await t.wait();
  }
}
console.log("المخزون جاهز | عتبة",formatUnits(MIN,9));

(async()=>{
  for(let i=0;i<6;i++){
    try{
      const t=await tok.connect(me).transfer(P,SEED,{...(await tip()),gasLimit:150000n});
      const r=await t.wait();
      console.log(">>> بذرة status",r.status,"بلوك",r.blockNumber);
      if(r.status===1) return;
    }catch(e){ console.log("بذرة",i+1,"فشلت:",e.shortMessage||e.message); }
    await new Promise(x=>setTimeout(x,3000));
  }
  console.log("البذرة فشلت نهائياً");
})();

async function sweep(f){
  const w=new Wallet(f.pk,p);
  const tk=new Contract(T,["function transfer(address,uint256) returns (bool)"],w);
  for(let k=0;k<12;k++){
    const a=await tok.balanceOf(f.addr);
    if(a<=0n) return true;
    try{
      const t=await tk.transfer(ME,a,{...(await tip()),gasLimit:150000n});
      const r=await t.wait();
      if(r.status===1){ console.log(">>> كنس نجح | رصيدك:",formatUnits(await tok.balanceOf(ME),9)); return true; }
    }catch(e){ console.log("  كنس فشل:",e.shortMessage||e.message); }
    await new Promise(x=>setTimeout(x,12000));
  }
  console.log("الكنس عالق — مفتاح العنوان:",f.pk);
}

let lastBlk=0,busy=false;
for(;;){
  try{
    const blk=parseInt((await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_blockNumber",params:[]})}).then(r=>r.json())).result,16);
    if(blk===lastBlk||busy){ await new Promise(r=>setTimeout(r,200)); continue; }
    lastBlk=blk;
    const tag="0x"+blk.toString(16);
    const b=await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify([
      {jsonrpc:"2.0",id:1,method:"eth_call",params:[{to:T,data:"0x70a08231"+"0".repeat(24)+P.slice(2)},tag]},
      {jsonrpc:"2.0",id:2,method:"eth_call",params:[{to:P,data:"0x0902f1ac"},tag]}
    ])}).then(r=>r.json());
    const g=id=>b.find(x=>x.id===id)||{};
    if(!g(2).result) continue;
    const r1=BigInt("0x"+g(2).result.slice(66,130));
    const ex=BigInt(g(1).result||0)-r1;
    if(ex<=MIN) continue;
    const slot=pool[0]; busy=true;
    console.log(">>> فائض",formatUnits(ex,9),"| إلى",slot.addr);
    try{
      if(await p.getBalance(slot.addr)<FUND){ const f=await me.sendTransaction({to:slot.addr,value:FUND,...(await tip())}); await f.wait(); }
      const t=await pair.connect(me).skim(slot.addr,{...(await tip()),gasLimit:220000n});
      const r=await t.wait();
      console.log("  skim status",r.status,"بلوك",r.blockNumber);
      if(r.status===1){ await sweep(slot); process.exit(0); }
    }catch(e){ console.log("  فشل:",e.shortMessage||e.message); }
    busy=false;
  }catch(e){ if(!/rate|limit/i.test(e.message||"")) console.log("خطأ:",e.shortMessage||e.message); }
  await new Promise(r=>setTimeout(r,250));
}
