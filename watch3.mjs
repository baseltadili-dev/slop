import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits, formatEther } from "ethers";

const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const W="0x4200000000000000000000000000000000000006";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const MIN=parseUnits(process.env.MIN||"1000000",9);
const pk=(process.env.PK||"").trim();
if(!/^0x[0-9a-fA-F]{64}$/.test(pk)){ console.log("PK غلط، طوله",pk.length); process.exit(1); }

const RPC=["https://base-rpc.publicnode.com","https://base.gateway.tenderly.co","https://1rpc.io/base"];
let U=0, back=0;
const rpc=async(m,p,ms=7000)=>{
  const c=new AbortController(), t=setTimeout(()=>c.abort(),ms);
  try{
    const r=await fetch(RPC[U%RPC.length],{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p}),signal:c.signal});
    const j=await r.json();
    if(j.error&&/rate|limit|capacity/i.test(j.error.message)){ back=Math.min(back+1,6); U++; throw new Error("rl"); }
    back=0; return j;
  } finally { clearTimeout(t); }
};
const p=new JsonRpcProvider("https://mainnet.base.org",8453,{staticNetwork:true});
const w=new Wallet(pk,p);
const erc=n=>new Contract(n,["function balanceOf(address) view returns (uint256)"],p);
const tok=erc(T), weth=erc(W);
const pair=new Contract(P,["function skim(address)","function getReserves() view returns (uint112,uint112,uint32)"],p);

console.log("مراقب v3 | مستلم",ME,"| عتبة",formatUnits(MIN,9),"SLOP");
let lastBlk=0, lastTag="", beat=Date.now();

for(;;){
  try{
    const bn=await rpc("eth_blockNumber",[]);
    const blk=parseInt(bn.result,16);
    if(blk===lastBlk){ await new Promise(r=>setTimeout(r,250*(1+back))); continue; }
    lastBlk=blk;
    const tag="0x"+blk.toString(16);
    // نداء واحد، بلوك واحد، ثلاث قراءات
    const batch=await fetch(RPC[U%RPC.length],{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify([
        {jsonrpc:"2.0",id:1,method:"eth_call",params:[{to:T,data:"0x70a08231"+"0".repeat(24)+P.slice(2)},tag]},
        {jsonrpc:"2.0",id:2,method:"eth_call",params:[{to:W,data:"0x70a08231"+"0".repeat(24)+P.slice(2)},tag]},
        {jsonrpc:"2.0",id:3,method:"eth_call",params:[{to:P,data:"0x0902f1ac"},tag]}
      ])}).then(r=>r.json());
    const g=id=>batch.find(x=>x.id===id)||{};
    if(!g(3).result) continue;
    const r0=BigInt("0x"+g(3).result.slice(2,66)), r1=BigInt("0x"+g(3).result.slice(66,130));
    const bS=BigInt(g(1).result||0), bW=BigInt(g(2).result||0);
    const eS=bS-r1, eW=bW-r0;

    if(Date.now()-beat>300000){ console.log("نبضة",blk,"فائض",formatUnits(eS,9)); beat=Date.now(); }

    if(eS<0n){
      const disc=Number(-eS*10000n/r1)/100;
      if(disc>2) console.log("انحراف سحب حارس:",formatUnits(-eS,9),"SLOP | خصم",disc+"%");
    }
    if(eS>MIN && eW>=0n){
      console.log(">>> مؤهّل | فائض",formatUnits(eS,9),"| WETH فائض",formatUnits(eW,18));
      try{ await pair.connect(w).skim.staticCall(ME); }
      catch(e){ console.log("محاكاة ارتدّت:",e.shortMessage||e.message); await new Promise(r=>setTimeout(r,1500)); continue; }
      const fee={gasPrice:BigInt((await rpc("eth_gasPrice",[])).result||0)}, bal=await p.getBalance(ME);
      const need=120000n*(fee.gasPrice||0n);
      if(bal<need){ console.log("غاز ناقص:",formatEther(bal)); await new Promise(r=>setTimeout(r,20000)); continue; }
      const tx=await pair.connect(w).skim(ME,{gasLimit:120000n});
      console.log("أُرسلت",tx.hash);
      const rc=await tx.wait();
      console.log(rc.status===1?"تمّت ✓":"ارتدّت ✗");
      if(rc.status===1) console.log("رصيدك الآن:",formatUnits(await tok.balanceOf(ME),9),"SLOP");
      process.exit(rc.status===1?0:1);
    }
  }catch(e){ if(e.message!=="rl") console.log("خطأ:",e.shortMessage||e.message); }
  await new Promise(r=>setTimeout(r,250*(1+back)));
}
