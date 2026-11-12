import { JsonRpcProvider, Wallet, Contract, formatUnits, parseUnits, formatEther } from "ethers";

const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const SEED=parseUnits(process.env.N||"120",9);
const FUND=20000000000000n;
const ROUNDS=3;

const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const me=new Wallet(process.env.PK,p), ME=await me.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],p);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)","function skim(address)"],p);

const gp=async()=>BigInt((await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]})}).then(r=>r.json())).result);
const fee=async(pr)=>{const g=await gp();const mf=g*2n>pr*2n?g*2n:pr*2n;return {maxFeePerGas:mf,maxPriorityFeePerGas:pr};};

console.log("غاز:",formatEther(await p.getBalance(ME)),"| SLOP:",formatUnits(await tok.balanceOf(ME),9));

const fresh=[];
for(let i=0;i<ROUNDS;i++){
  const x=Wallet.createRandom();
  const t=await me.sendTransaction({to:x.address,value:FUND,...(await fee(20000000n))}); await t.wait();
  fresh.push({addr:x.address,pk:x.privateKey});
}
console.log("عناوين نظيفة مموّلة:",fresh.map(f=>f.addr).join(" "));

for(let r=0;r<ROUNDS;r++){
  const f=fresh[r];
  const nonce=await p.getTransactionCount(ME,"pending");
  console.log(`\nجولة ${r+1}/${ROUNDS} | nonce ${nonce} | هدف ${f.addr}`);

  let t1,t2;
  try{
    t1=await tok.connect(me).transfer(P,SEED,{...(await fee(20000000n)),nonce,gasLimit:150000n});
    console.log("  tx1",t1.hash);
    t2=await pair.connect(me).skim(f.addr,{...(await fee(100000000n)),nonce:nonce+1,gasLimit:250000n});
    console.log("  tx2",t2.hash);
  }catch(e){ console.log("  إرسال فشل:",e.shortMessage||e.message); continue; }

  const [r1,r2]=await Promise.all([t1.wait(),t2.wait()]);
  console.log("  tx1",r1.status,"بلوك",r1.blockNumber,"| tx2",r2.status,"بلوك",r2.blockNumber,"| فرق",r2.blockNumber-r1.blockNumber);

  if(r2.status===1){
    const got=await tok.balanceOf(f.addr);
    console.log(">>> نجح | عند الهدف:",formatUnits(got,9));
    console.log(">>> مفتاح الهدف:",f.pk);
    const w=new Wallet(f.pk,p);
    const tk=new Contract(T,["function transfer(address,uint256) returns (bool)"],w);
    for(let k=0;k<10;k++){
      try{
        const s=await tk.transfer(ME,await tok.balanceOf(f.addr),{...(await fee(3000000n)),gasLimit:150000n});
        const rr=await s.wait();
        if(rr.status===1){ console.log(">>> وصلتك:",formatUnits(await tok.balanceOf(ME),9)); process.exit(0); }
      }catch(e){}
      await new Promise(x=>setTimeout(x,12000));
    }
    console.log("الكنس عالق — المفتاح فوق");
    process.exit(0);
  }
}
console.log("\nكل الجولات خسرت السباق");
