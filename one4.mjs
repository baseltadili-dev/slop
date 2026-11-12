import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits, parseEther, formatEther } from "ethers";
const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W="0x4200000000000000000000000000000000000006";
const ROUTER="0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const BUY=parseEther(process.env.BUY||"0.000045");
const FUND=60000000000000n;
const TIP=10000000n;

let pk=(process.env.PK||"").trim();
if(!pk&&fs.existsSync(process.env.HOME+"/.pk")) pk=fs.readFileSync(process.env.HOME+"/.pk","utf8").trim();
const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const me=new Wallet(pk,p), ME=me.address;
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],p);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)"],p);
const j=async(m,pr)=>(await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:pr})})).json();
const fee=async(pr)=>{const g=BigInt((await j("eth_gasPrice",[])).result);
  const mf=g*2n>pr*2n?g*2n:pr*2n;return {maxFeePerGas:mf,maxPriorityFeePerGas:pr};};

(async()=>{
console.log("غاز:",formatEther(await p.getBalance(ME)),"| SLOP:",formatUnits(await tok.balanceOf(ME),9));

const op=Wallet.createRandom().connect(p);
console.log("عامل:",op.address,"\nمفتاحه:",op.privateKey);
await (await me.sendTransaction({to:op.address,value:FUND,...(await fee(TIP))})).wait();

const o=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],op);
const rt=new Contract(ROUTER,["function swapExactETHForTokens(uint256,address[],address,uint256) payable returns (uint256[])"],op);
const pr=new Contract(P,["function skim(address)"],op);

const [r0,r1]=await pair.getReserves();
const out=BUY*r1*997n/(r0*1000n+BUY*997n);
try{
  const t=await rt.swapExactETHForTokens(out*90n/100n,[W,T],op.address,Math.floor(Date.now()/1000)+600,
    {...(await fee(TIP)),value:BUY,gasLimit:300000n});
  const rc=await t.wait(); console.log(" شراء",rc.status);
  if(rc.status!==1){ console.log("الشراء ارتد"); process.exit(1); }
}catch(e){ console.log(" شراء فشل:",e.shortMessage); process.exit(1); }

const got=await o.balanceOf(op.address);
console.log(" استلم",formatUnits(got,9),"SLOP | غاز متبقٍ:",formatEther(await p.getBalance(op.address)));

const nonce=await p.getTransactionCount(op.address,"pending");
let t1,t2;
try{
  t1=await o.transfer(P,got,{...(await fee(TIP)),nonce,gasLimit:120000n});
  t2=await pr.skim(ME,{...(await fee(TIP*2n)),nonce:nonce+1,gasLimit:180000n});
  console.log(" tx1",t1.hash,"\n tx2",t2.hash);
}catch(e){ console.log(" إرسال فشل:",e.shortMessage); process.exit(1); }

const [a,b]=await Promise.all([t1.wait().catch(()=>null),t2.wait().catch(()=>null)]);
console.log(" tx1",a?.status,"| tx2",b?.status);
if(b?.status===1) console.log(">>> نجح | رصيدك الآن:",formatUnits(await tok.balanceOf(ME),9));
else console.log("ارتد — مفتاح العامل فوق، ورصيده:",formatUnits(await tok.balanceOf(op.address),9));
})();
