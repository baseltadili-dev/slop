import { JsonRpcProvider, Wallet, Contract, formatUnits } from "ethers";
const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const w=new Wallet(process.env.PK,p), ME=await w.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],w);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)","function skim(address)"],w);
const gp=BigInt((await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]})}).then(r=>r.json())).result);
const O={maxFeePerGas:gp*3n};

const amt=(await tok.balanceOf(ME))/4n;
const nonce=await p.getTransactionCount(ME,"pending");
const fresh=Wallet.createRandom();
console.log("مبلغ",formatUnits(amt,9),"| nonce",nonce,"| هدف نظيف",fresh.address);

// إطلاق متتالٍ بلا انتظار
const t1=await tok.transfer(P,amt,{...O,nonce,gasLimit:150000n,maxPriorityFeePerGas:1500000n});
console.log("tx1",t1.hash);
const t2=await pair.skim(fresh.address,{...O,nonce:nonce+1,gasLimit:200000n,maxPriorityFeePerGas:3000000n});
console.log("tx2",t2.hash);

const [r1,r2]=await Promise.all([t1.wait(),t2.wait()]);
console.log("tx1 status",r1.status,"بلوك",r1.blockNumber);
console.log("tx2 status",r2.status,"بلوك",r2.blockNumber);
console.log("فرق البلوكات:",r2.blockNumber-r1.blockNumber);

if(r2.status!==1){
  console.log("skim رفض — البوت سبق. مفتاح النظيف:",fresh.privateKey);
  process.exit(1);
}
console.log(">>> نجح! عند النظيف:",formatUnits(await tok.balanceOf(fresh.address),9));

const f=new Wallet(fresh.privateKey,p);
let g=await w.sendTransaction({to:f.address,value:4000000000000n,...O}); await g.wait();
const tk=new Contract(T,["function transfer(address,uint256) returns (bool)"],f);
let a=await tok.balanceOf(f.address);
for(let k=0;k<10;k++){
  try{ const s=await tk.transfer(ME,a,{...O,gasLimit:150000n}); const rr=await s.wait();
    if(rr.status===1){ console.log("وصلتك:",formatUnits(await tok.balanceOf(ME),9)); process.exit(0); }
  }catch(e){ console.log("سحب فشل:",e.shortMessage); }
  await new Promise(x=>setTimeout(x,15000));
}
console.log("عالق عند النظيف — المفتاح:",fresh.privateKey);
