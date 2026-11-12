import { JsonRpcProvider, Wallet, Contract, formatUnits, keccak256, concat, zeroPadValue, toBeHex } from "ethers";
const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const w=new Wallet(process.env.PK,p), ME=await w.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],w);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)"],w);
const st=async(s)=>BigInt((await p.getStorage(T,s))||0);
const map=async(s,a)=>BigInt((await p.getStorage(T,keccak256(concat([zeroPadValue(a,32),toBeHex(s,32)]))))||0);

console.log("رصيدك:",formatUnits(await tok.balanceOf(ME),9));
console.log("maxTx 0x1d:",(await st(0x1d)).toString());
console.log("totalSupply 0x06:",(await st(0x06)).toString());
console.log("flags[ME] 0x0e:",(await map(0x0e,ME)).toString());
console.log("lastTx[ME] 0x14:",(await map(0x14,ME)).toString());
console.log("exempt[ME] 0x0d:",(await map(0x0d,ME)).toString());
console.log("exempt[pair] 0x0d:",(await map(0x0d,P)).toString());
const bal=await tok.balanceOf(ME);
const [,r1]=await pair.getReserves();
console.log("رصيد الحوض:",(await tok.balanceOf(P)).toString(),"| احتياطي:",r1.toString());

try{ const g=await tok.transfer.estimateGas(P,bal/2n); console.log("تقدير التحويل: نجح",g.toString()); }
catch(e){ console.log("تقدير التحويل: رفض →",e.shortMessage,"|",e.data); }

try{
  const tx=await tok.transfer(P,bal/2n,{gasLimit:200000n,maxFeePerGas:20000000n});
  const rc=await tx.wait();
  console.log("الإيصال status =",rc.status,"|",tx.hash);
}catch(e){ console.log("الإرسال رفض →",e.shortMessage,"|",e.data); }
