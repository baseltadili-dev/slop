import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits } from "ethers";

const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const MIN=parseUnits(process.env.MIN||"50",9);
const POOLF=process.env.HOME+"/slop/pool.json";

const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const me=new Wallet(process.env.PK,p), ME=await me.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],p);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)","function skim(address)"],p);

let pool=fs.existsSync(POOLF)?JSON.parse(fs.readFileSync(POOLF,"utf8")):[];
while(pool.length<4){const x=Wallet.createRandom();pool.push({pk:x.privateKey,addr:x.address,ok:false});}
fs.writeFileSync(POOLF,JSON.stringify(pool,null,2));

const gp=async()=>BigInt((await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]})}).then(r=>r.json())).result);
const tip=async()=>{const g=await gp();const pr=3000000000n;return {maxFeePerGas:g*3n>pr*2n?g*3n:pr*2n,maxPriorityFeePerGas:pr};};

for(const a of pool){
  const b=await p.getBalance(a.addr);
  if(b<3000000000000n){ const t=await me.sendTransaction({to:a.addr,value:4000000000000n,maxFeePerGas:(await gp())*3n}); await t.wait(); }
  a.ok=true;
}
console.log("المخزون مموّل | عتبة",formatUnits(MIN,9),"| نافذة 120 ثانية");

const T0=Date.now();
setTimeout(async()=>{
  try{
    const t=await tok.connect(me).transfer(P,parseUnits(process.env.N||"120",9),{...(await tip()),gasLimit:150000n});
    const r=await t.wait();
    console.log(">>> بذرة status",r.status,"بلوك",r.blockNumber);
  }catch(e){ console.log("بذرة فشلت:",e.shortMessage); }
},4000);

async function sweep(f){
  const w=new Wallet(f.pk,p);
  const tk=new Contract(T,["function transfer(address,uint256) returns (bool)"],w);
  for(let k=0;k<10;k++){
    const a=await tok.balanceOf(f.addr);
    if(a<=0n) return;
    try{ const t=await tk.transfer(ME,a,{...(await tip()),gasLimit:150000n}); const r=await t.wait();
      if(r.status===1){ console.log(">>> كنس نجح | رصيدك:",formatUnits(await tok.balanceOf(ME),9)); return; }
    }catch(e){ console.log("  كنس فشل:",e.shortMessage); }
    await new Promise(x=>setTimeout(x,10000));
  }
}

let lastBlk=0, busy=false;
for(;;){
  if(Date.now()-T0>120000){ console.log("انتهت النافذة بلا نجاح"); process.exit(2); }
  try{
    const blk=parseInt((await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_blockNumber",params:[]})}).then(r=>r.json())).result,16);
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
    const slot=pool.find(a=>a.ok)||pool[0];
    busy=true;
    console.log(">>> فائض",formatUnits(ex,9),"| إلى",slot.addr);
    try{
      const t=await pair.connect(me).skim(slot.addr,{...(await tip()),gasLimit:200000n});
      const r=await t.wait();
      console.log("  skim status",r.status,"بلوك",r.blockNumber);
      if(r.status===1){ await sweep(slot); process.exit(0); }
    }catch(e){ console.log("  فشل:",e.shortMessage); }
    busy=false;
  }catch(e){ if(!/rate|limit/i.test(e.message||"")) console.log("خطأ:",e.shortMessage||e.message); }
  await new Promise(r=>setTimeout(r,300));
}
