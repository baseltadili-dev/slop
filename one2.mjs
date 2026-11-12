import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits, formatEther } from "ethers";

const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const AMT=parseUnits(process.env.N||"300",9);
const FUND=20000000000000n;
const TIP=300000000n;

let pk=(process.env.PK||"").trim();
if(!pk&&fs.existsSync(process.env.HOME+"/.pk")) pk=fs.readFileSync(process.env.HOME+"/.pk","utf8").trim();
if(!/^0x[0-9a-fA-F]{64}$/.test(pk)){ console.log("PK ناقص"); process.exit(1); }

const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const me=new Wallet(pk,p), ME=me.address;
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],p);
const pair=new Contract(P,["function skim(address)"],p);
const j=async(m,pr)=>(await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:pr})})).json();
const fee=async(pr)=>{const g=BigInt((await j("eth_gasPrice",[])).result);
  const mf=g*2n>pr*2n?g*2n:pr*2n;return {maxFeePerGas:mf,maxPriorityFeePerGas:pr};};

(async()=>{
const eth=await p.getBalance(ME);
console.log("غاز:",formatEther(eth),"| SLOP:",formatUnits(await tok.balanceOf(ME),9));
if(eth<300000000000000n){ console.log("غاز قليل"); process.exit(1); }

for(let r=1;r<=3;r++){
  const have=await tok.balanceOf(ME);
  if(have<AMT/4n){ console.log("ما بقي SLOP"); break; }
  const amt=have<AMT?have:AMT;

  const clean=Wallet.createRandom();
  console.log(`\nجولة ${r} | ${formatUnits(amt,9)} SLOP -> ${clean.address}`);
  await (await me.sendTransaction({to:clean.address,value:FUND,...(await fee(20000000n))})).wait();

  const nonce=await p.getTransactionCount(ME,"pending");
  let t1,t2;
  try{
    t1=await tok.connect(me).transfer(P,amt,{...(await fee(20000000n)),nonce,gasLimit:150000n});
    t2=await pair.connect(me).skim(clean.address,{...(await fee(TIP)),nonce:nonce+1,gasLimit:220000n});
    console.log(" tx1",t1.hash,"\n tx2",t2.hash);
  }catch(e){ console.log(" إرسال فشل:",e.shortMessage||e.message); continue; }

  const [r1,r2]=await Promise.all([t1.wait().catch(()=>null),t2.wait().catch(()=>null)]);
  const s1=r1?.status??0, s2=r2?.status??0;
  console.log(" tx1",s1,"بلوك",r1?.blockNumber,"| tx2",s2,"بلوك",r2?.blockNumber);

  if(s2===1){
    const got=await tok.balanceOf(clean.address);
    console.log(">>> نجح | عند الهدف:",formatUnits(got,9));
    const c=new Wallet(clean.privateKey,p);
    const ct=new Contract(T,["function transfer(address,uint256) returns (bool)"],c);
    for(let k=0;k<10;k++){
      try{
        const s=await ct.transfer(ME,await tok.balanceOf(clean.address),{...(await fee(3000000n)),gasLimit:150000n});
        const rr=await s.wait();
        if(rr.status===1){ console.log(">>> وصلتك:",formatUnits(await tok.balanceOf(ME),9)); process.exit(0); }
      }catch(e){}
      await new Promise(x=>setTimeout(x,12000));
    }
    console.log("عالق — المفتاح:",clean.privateKey);
    process.exit(0);
  }
  console.log(" ارتدّ — جولة تالية");
  await new Promise(x=>setTimeout(x,2000));
}
console.log("انتهت الجولات");
})();
