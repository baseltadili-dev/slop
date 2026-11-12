import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits, formatEther } from "ethers";

const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const W="0x4200000000000000000000000000000000000006";
const ME=(process.env.ME||"").trim();
const MIN=parseUnits(process.env.MIN||"1000000",9);
const pk=(process.env.PK||"").trim();

if(!/^0x[0-9a-fA-F]{40}$/.test(ME)){ console.log("ME غلط"); process.exit(1); }
const send=pk!=="";
if(send&&!/^0x[0-9a-fA-F]{64}$/.test(pk)){ console.log("PK غلط، طوله",pk.length); process.exit(1); }

const p=new JsonRpcProvider(process.env.RPC||"https://base.gateway.tenderly.co",8453,{staticNetwork:true});
const w=send?new Wallet(pk,p):null;
const erc=n=>new Contract(n,["function balanceOf(address) view returns (uint256)"],p);
const tok=erc(T), weth=erc(W);
const pair=new Contract(P,["function skim(address)","function getReserves() view returns (uint112,uint112,uint32)"],p);

console.log("مراقبة",P,"\nعتبة",formatUnits(MIN,9),"SLOP | مستلم",ME,"| إرسال:",send);
let last="";

for(;;){
  try{
    const [bS,bW,rs]=await Promise.all([tok.balanceOf(P),weth.balanceOf(P),pair.getReserves()]);
    const r0=rs[0], r1=rs[1];
    const eW=bW-r0, eS=bS-r1;
    const tag=`SLOP=${formatUnits(bS,9)} فائض=${formatUnits(eS,9)} | WETH فائض=${formatUnits(eW,18)}`;
    if(tag!==last){ console.log(new Date().toISOString().slice(11,19),tag); last=tag; }

    if(eS>MIN && eW>=0n){
      console.log(">>> مؤهّل");
      if(!w){ console.log("بلا PK — توقف"); process.exit(0); }
      try{ await pair.connect(w).skim.staticCall(ME); }
      catch(e){ console.log("محاكاة ارتدّت:",e.shortMessage||e.message); await new Promise(r=>setTimeout(r,800)); continue; }
      const fee=await p.getFeeData();
      const gas=await w.getBalance();
      const need=150000n*(fee.gasPrice||0n);
      if(gas<need){ console.log("غاز ناقص:",formatEther(gas),"محتاج",formatEther(need)); await new Promise(r=>setTimeout(r,15000)); continue; }
      const tx=await pair.connect(w).skim(ME,{gasLimit:150000n});
      console.log("أُرسلت",tx.hash);
      const rc=await tx.wait();
      console.log(rc.status===1?"تمّت ✓":"ارتدّت ✗");
      process.exit(rc.status===1?0:1);
    }
  }catch(e){ console.log("خطأ:",e.shortMessage||e.message); }
  await new Promise(r=>setTimeout(r,800));
}
