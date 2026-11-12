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
const map=async(s,a)=>BigInt((await p.getStorage(T,keccak256(concat([zeroPadValue(a,32),toBeHex(s,32)]))))||0);
const ex=async()=>{const [,r1]=await pair.getReserves(); return (await tok.balanceOf(P))-r1;};

const bal=await tok.balanceOf(ME);
const send=bal/4n;
console.log("تحويل",formatUnits(send,9),"SLOP للحوض...");
const t0=await tok.transfer(P,send,O); const r0=await t0.wait();
console.log("التحويل status",r0.status,"بلوك",r0.blockNumber);

const fresh=Wallet.createRandom();
const T0=Date.now();
let fired=false;
for(let i=0;i<40;i++){
  const e=await ex();
  if(e<=0n){ console.log("راح الفائض (تبديل سبقنا)"); break; }
  const blk=await p.getBlock("latest");
  const lp=await map(0x14,P), lm=await map(0x14,ME);
  let sMe="?", sFr="?";
  try{ await pair.skim.staticCall(ME); sMe="نجح"; }catch(err){ sMe=(err.shortMessage||"").replace("execution reverted: ",""); }
  try{ await pair.skim.staticCall(fresh.address); sFr="نجح"; }catch(err){ sFr=(err.shortMessage||"").replace("execution reverted: ",""); }
  const dt=Math.round((Date.now()-T0)/1000);
  console.log(`[${dt}s] فائض=${formatUnits(e,9)} ts=${blk.timestamp} lastTx[pair]=${lp} (فرق ${blk.timestamp-Number(lp)}) | ME:${sMe} | FRESH:${sFr}`);

  if(sMe==="نجح"||sFr==="نجح"){
    const dest = sMe==="نجح" ? ME : fresh.address;
    console.log(">>> نطلق إلى",dest);
    const tx=await pair.skim(dest,O); const rc=await tx.wait();
    console.log("skim status",rc.status,"| عند المستلم:",formatUnits(await tok.balanceOf(dest),9));
    if(rc.status===1 && dest!==ME){
      const f=new Wallet(fresh.privateKey,p);
      const tk=new Contract(T,["function transfer(address,uint256) returns (bool)"],f);
      let a=await tok.balanceOf(dest);
      for(let k=0;k<10;k++){
        try{ const s=await tk.transfer(ME,a,{...O,gasLimit:150000n}); const rr=await s.wait();
          if(rr.status===1){ console.log("وصلتك:",formatUnits(await tok.balanceOf(ME),9)); break; }
        }catch(err){ console.log("سحب فشل:",err.shortMessage); }
        await new Promise(x=>setTimeout(x,15000));
      }
      console.log("مفتاح العنوان النظيف:",fresh.privateKey);
    }
    fired=true; break;
  }
  if(i>0 && i%6===0 && sMe!=="نجح" && sFr!=="نجح"){
    console.log("لا زال مرفوضاً بعد",dt,"ثانية — استمرار");
  }
  await new Promise(x=>setTimeout(x,5000));
}
if(!fired) console.log("ما نجح خلال الفحص");
