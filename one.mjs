import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits, formatEther } from "ethers";

const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const MC3="0xcA11bde05977b3631167028862bE2a173976CA11";
const SEED=parseUnits(process.env.N||"300",9);
const FUND=20000000000000n;
const TIP=200000000n;

let pk=(process.env.PK||"").trim();
if(!pk&&fs.existsSync(process.env.HOME+"/.pk")) pk=fs.readFileSync(process.env.HOME+"/.pk","utf8").trim();
if(!/^0x[0-9a-fA-F]{64}$/.test(pk)){ console.log("PK ناقص"); process.exit(1); }

const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const me=new Wallet(pk,p), ME=me.address;
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],p);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)","function skim(address)"],p);

const padA=a=>"0".repeat(24)+a.slice(2).toLowerCase();
const w32=n=>n.toString(16).padStart(64,"0");
const j=async(m,pr)=>(await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:pr})})).json();
const fee=async(pr)=>{const g=BigInt((await j("eth_gasPrice",[])).result);
  const mf=g*2n>pr*2n?g*2n:pr*2n;return {maxFeePerGas:mf,maxPriorityFeePerGas:pr};};

const encAgg=calls=>{
  const el=calls.map(c=>{const d=c.data.slice(2);const w=Math.ceil(d.length/64);
    return padA(c.target).slice(2)+w32(0x40)+w32(d.length/2)+d.padEnd(w*64,"0");});
  let a=w32(calls.length),o=calls.length*32;
  for(const e of el){a+=w32(o);o+=e.length/2;}
  return "0x252dba42"+w32(0x20)+a+el.join("");
};

(async()=>{
const eth=await p.getBalance(ME), slop=await tok.balanceOf(ME);
console.log("غاز:",formatEther(eth),"| SLOP:",formatUnits(slop,9));
if(eth<300000000000000n){ console.log("غاز قليل — وقفت"); process.exit(1); }

const clean=Wallet.createRandom();
console.log("هدف نظيف:",clean.address);
await (await me.sendTransaction({to:clean.address,value:FUND,...(await fee(20000000n))})).wait();

for(let r=1;r<=3;r++){
  const held=await tok.balanceOf(MC3);
  if(held<SEED){
    const need=SEED-held, have=await tok.balanceOf(ME);
    const add=need>have?have:need;
    if(add<=0n){ console.log("ما بقي SLOP"); break; }
    const t=await tok.connect(me).transfer(MC3,add,{...(await fee(20000000n)),gasLimit:120000n});
    await t.wait();
  }
  const amt=await tok.balanceOf(MC3);
  const data=encAgg([
    {target:T,data:"0xa9059cbb"+padA(P)+amt.toString(16).padStart(64,"0")},
    {target:P,data:"0xbc25cf77"+padA(clean.address)}
  ]);
  console.log(`جولة ${r} | بذر ${formatUnits(amt,9)} SLOP`);
  try{
    const tx=await me.sendTransaction({to:MC3,data,...(await fee(TIP)),gasLimit:400000n});
    console.log(" tx",tx.hash);
    const rc=await tx.wait();
    console.log(" status",rc.status);
    if(rc.status===1){
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
  }catch(e){ console.log(" فشل:",e.shortMessage||e.message); }
  await new Promise(x=>setTimeout(x,2500));
}

const left=await tok.balanceOf(MC3);
if(left>0n){
  const d=encAgg([{target:T,data:"0xa9059cbb"+padA(ME)+left.toString(16).padStart(64,"0")}]);
  const t=await me.sendTransaction({to:MC3,data:d,...(await fee(3000000n)),gasLimit:150000n});
  await t.wait();
  console.log("استرجعت المتبقي:",formatUnits(await tok.balanceOf(ME),9));
}
})();
