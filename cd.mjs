import { JsonRpcProvider, Wallet, Contract, formatUnits, keccak256, concat, zeroPadValue, toBeHex } from "ethers";
const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const w=new Wallet(process.env.PK,p), ME=await w.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],w);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)","function skim(address)"],w);
const gp=BigInt((await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]})}).then(r=>r.json())).result);
const O={maxFeePerGas:gp*3n,maxPriorityFeePerGas:1000000n};

const [,r1]=await pair.getReserves();
const ex=(await tok.balanceOf(P))-r1;
console.log("فائض:",formatUnits(ex,9),"| رصيدك:",formatUnits(await tok.balanceOf(ME),9));
if(ex<=0n){ console.log("راح الفائض"); process.exit(0); }

const map=async(s,a)=>BigInt((await p.getStorage(T,keccak256(concat([zeroPadValue(a,32),toBeHex(s,32)]))))||0);
const blk=await p.getBlock("latest");
const lt=await map(0x14,ME);
console.log("ts:",blk.timestamp,"| lastTx[ME]:",lt.toString(),"| فرق:",blk.timestamp-Number(lt),"| lastTx[pair]:",(await map(0x14,P)).toString());

const fresh=Wallet.createRandom();
console.log("عنوان نظيف:",fresh.address,"\nمفتاحه:",fresh.privateKey,"\n");

const ok={};
for(const [l,d] of [["ME",ME],["FRESH",fresh.address]]){
  try{ await pair.skim.staticCall(d); ok[l]=true; console.log(l,"→ نجح ✓"); }
  catch(e){ ok[l]=false; console.log(l,"→ رفض:",e.shortMessage); }
}

async function send(to,amt){ const t=await tok.transfer(to,amt,O); const r=await t.wait(); return r.status; }

if(ok.ME){
  console.log("\nإطلاق إلى ME...");
  const t=await pair.skim(ME,O); const r=await t.wait();
  console.log("status",r.status,"| رصيدك:",formatUnits(await tok.balanceOf(ME),9));
  process.exit(r.status===1?0:1);
}
if(ok.FRESH){
  console.log("\nالحل: التهدئة على المستلم. تمويل العنوان النظيف ورميه...");
  const f=new Wallet(fresh.privateKey,p);
  let t=await w.sendTransaction({to:f.address,value:3000000000000n,...O}); await t.wait();
  t=await pair.skim(f.address,O); let r=await t.wait();
  console.log("skim status",r.status,"| عند النظيف:",formatUnits(await tok.balanceOf(f.address),9));
  if(r.status!==1) process.exit(1);
  const amt=await tok.balanceOf(f.address);
  for(let i=0;i<8;i++){
    const tk=new Contract(T,["function transfer(address,uint256) returns (bool)"],f);
    try{ const s=await tk.transfer(ME,amt,{...O,gasLimit:150000n}); const rr=await s.wait();
      if(rr.status===1){ console.log("سحب للنظيف نجح | رصيدك:",formatUnits(await tok.balanceOf(ME),9)); process.exit(0); }
    }catch(e){ console.log("سحب فشل:",e.shortMessage); }
    await new Promise(x=>setTimeout(x,20000));
  }
  console.log("عالق عند النظيف — المفتاح فوق");
  process.exit(1);
}
console.log("\nالاثنان رفضا — التهدئة ليست على المستلم");
