import { JsonRpcProvider, Wallet, Contract, formatUnits } from "ethers";
const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const w=new Wallet(process.env.PK,p), ME=await w.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],w);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)","function skim(address)"],w);
const O={gasLimit:250000n,maxFeePerGas:20000000n};

const bal=await tok.balanceOf(ME);
console.log("رصيدك:",formatUnits(bal,9));
const send=bal/4n;
console.log("تحويل",formatUnits(send,9),"للحوض...");
const tx=await tok.transfer(P,send,O);
const rc=await tx.wait();
console.log("التحويل status =",rc.status,"بلوك",rc.blockNumber);

const [,r1]=await pair.getReserves();
const pb=await tok.balanceOf(P);
console.log("فائض فوراً:",formatUnits(pb-r1,9),"| بلوك القراءة",await p.getBlockNumber());

if(pb-r1<=0n){ console.log("النتيجة: الحوض بيتزامن تلقائياً — skim بلا فائدة"); process.exit(0); }
try{ await pair.skim.staticCall(ME); console.log("محاكاة: نجحت"); }
catch(e){ console.log("محاكاة: رفض →",e.shortMessage); process.exit(1); }
const t2=await pair.skim(ME,O);
const r2=await t2.wait();
console.log("السحب status =",r2.status,"| رصيدك الآن",formatUnits(await tok.balanceOf(ME),9));
