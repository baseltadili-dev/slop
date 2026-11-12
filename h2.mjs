import fs from "node:fs";
import { Wallet, JsonRpcProvider, Contract, formatUnits, parseUnits, formatEther } from "ethers";

const RPC=["https://mainnet.base.org","https://base.gateway.tenderly.co","https://base-rpc.publicnode.com","https://1rpc.io/base","https://base.drpc.org","https://base.meowrpc.com"];
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const MIN=parseUnits(process.env.MIN||"20000",9);
const FUND=20000000000000n;
const SLOTS=4;
const TIP=150000000n;
const PF=process.env.HOME+"/slop/pool2.json";

const p=new JsonRpcProvider(RPC[0],8453,{staticNetwork:true});
const me=new Wallet(process.env.PK,p), ME=await me.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],p);

const j=async(u,m,pr)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),6000);
  try{return await (await fetch(u,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:pr}),signal:c.signal})).json()}
  catch{return null}finally{clearTimeout(t)}};
const gp=async()=>BigInt((await j(RPC[0],"eth_gasPrice",[])).result);
const fee=async(pr)=>{const g=await gp();const mf=g*2n>pr*2n?g*2n:pr*2n;return {maxFeePerGas:mf,maxPriorityFeePerGas:pr}};

let pool=fs.existsSync(PF)?JSON.parse(fs.readFileSync(PF,"utf8")):[];
while(pool.length<SLOTS){const x=Wallet.createRandom();pool.push({pk:x.privateKey,addr:x.address});}
pool=pool.slice(0,SLOTS);
fs.writeFileSync(PF,JSON.stringify(pool,null,2));

const top=async(a)=>{const b=await p.getBalance(a);if(b>=FUND)return;
  const t=await me.sendTransaction({to:a,value:FUND,...(await fee(20000000n))});await t.wait();};
for(const s of pool) await top(s.addr);

const bal=await p.getBalance(ME);
console.log("غاز:",formatEther(bal),"| عتبة",formatUnits(MIN,9),"SLOP | منافذ",RPC.length);
if(bal<300000000000000n) console.log("تحذير: الغاز أقل من 0.0003");

async function fire(slot,ex){
  const blk=parseInt((await j(RPC[0],"eth_blockNumber",[])).result,16);
  const nonce=await p.getTransactionCount(ME,"pending");
  const raw=await me.signTransaction({type:2,chainId:8453,nonce,to:P,value:0n,
    data:"0xbc25cf77"+"0".repeat(24)+slot.addr.slice(2),gasLimit:150000n,...(await fee(TIP))});
  const t0=Date.now();
  const res=await Promise.allSettled(RPC.map(u=>j(u,"eth_sendRawTransaction",[raw])));
  const ok=res.map(x=>x.value?.result).find(x=>typeof x==="string"&&x.startsWith("0x"));
  console.log(`  بث ${RPC.length} منافذ في ${Date.now()-t0}ms | ${ok||"رفض"}`);
  if(!ok) return false;
  for(let i=0;i<30;i++){
    const r=await j(RPC[0],"eth_getTransactionReceipt",[ok]);
    if(r?.result){
      const s=r.result.status==="0x1";
      console.log("  skim",s?"نجح ✓":"ارتدّ ✗","بلوك",parseInt(r.result.blockNumber,16));
      if(s){
        const w=new Wallet(slot.pk,p);
        const tk=new Contract(T,["function transfer(address,uint256) returns (bool)"],w);
        for(let k=0;k<12;k++){
          const a=await tok.balanceOf(slot.addr);
          if(a<=0n) break;
          try{const t=await tk.transfer(ME,a,{...(await fee(3000000n)),gasLimit:150000n});const rr=await t.wait();
            if(rr.status===1){console.log("  كنس:",formatUnits(a,9),"| رصيدك:",formatUnits(await tok.balanceOf(ME),9));break;}
          }catch{}
          await new Promise(x=>setTimeout(x,12000));
        }
      }
      await top(slot.addr);
      return s;
    }
    await new Promise(x=>setTimeout(x,120));
  }
  return false;
}

let last=0,beat=Date.now(),busy=false,win=0,loss=0;
for(;;){
  try{
    const b=await j(RPC[0],"eth_blockNumber",[]);
    const blk=parseInt(b.result,16);
    if(blk===last||busy){await new Promise(r=>setTimeout(r,120));continue;}
    last=blk;
    const tag="0x"+blk.toString(16);
    const r=await j(RPC[0],"eth_call",[{to:P,data:"0x0902f1ac"},tag]);
    if(!r?.result) continue;
    const r1=BigInt("0x"+r.result.slice(66,130));
    const bb=await j(RPC[0],"eth_call",[{to:T,data:"0x70a08231"+"0".repeat(24)+P.slice(2)},tag]);
    if(!bb?.result) continue;
    const ex=BigInt(bb.result)-r1;
    if(Date.now()-beat>60000){console.log("نبضة",blk,"فائض",formatUnits(ex,9),"| فوز",win,"خسارة",loss);beat=Date.now();}
    if(ex<=MIN) continue;
    const slot=pool[0]; busy=true;
    console.log(">>> فائض",formatUnits(ex,9),"| إلى",slot.addr);
    if(await fire(slot,ex)){win++;process.exit(0);} else {loss++;pool.push(pool.shift());}
    busy=false;
  }catch(e){ if(!/rate|limit/i.test(e.message||"")) console.log("خطأ:",e.shortMessage||e.message); }
  await new Promise(r=>setTimeout(r,100));
}
