import { JsonRpcProvider, Wallet, Contract, parseEther, formatUnits } from "ethers";
const RPC=process.env.RPC||"https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const W="0x4200000000000000000000000000000000000006";
const ROUTER="0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const BUY=parseEther(process.env.BUY||"0.00003");
const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const w=new Wallet(process.env.PK,p), ME=await w.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],w);
const pair=new Contract(P,["function getReserves() view returns (uint112,uint112,uint32)","function skim(address)"],w);
const router=new Contract(ROUTER,["function swapExactETHForTokens(uint256,address[],address,uint256) payable returns (uint256[])"],w);

const code=await p.getCode(ROUTER);
if(code==="0x"){ console.log("الراوتر بلا كود على هذا RPC"); process.exit(1); }
const gp=BigInt((await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]})}).then(r=>r.json())).result);
const o={maxFeePerGas:gp*3n,maxPriorityFeePerGas:1000000n};
console.log("gasPrice",gp.toString(),"| رصيدك",formatUnits(await p.getBalance(ME),18));

console.log("1) شراء بـ",formatUnits(BUY,18),"ETH");
const [r0,r1]=await pair.getReserves();
const out=BUY*r1*997n/(r0*1000n+BUY*997n);
let tx=await router.swapExactETHForTokens(out*95n/100n,[W,T],ME,Math.floor(Date.now()/1000)+600,{...o,value:BUY,gasLimit:300000n});
await tx.wait();
const bal=await tok.balanceOf(ME);
console.log("   استلمت",formatUnits(bal,9),"SLOP");

console.log("2) إيداع النصف في الحوض");
tx=await tok.transfer(P,bal/2n,{...o,gasLimit:120000n}); await tx.wait();

console.log("3) قياس الفائض");
const [,s1]=await pair.getReserves();
console.log("   الفائض الآن:",formatUnits((await tok.balanceOf(P))-s1,9),"SLOP");

console.log("4) محاكاة ثم سحب");
await pair.skim.staticCall(ME);
tx=await pair.skim(ME,{...o,gasLimit:120000n}); await tx.wait();

console.log("5) النتيجة: رصيدك",formatUnits(await tok.balanceOf(ME),9),"SLOP");
const [,f1]=await pair.getReserves();
console.log("   فائض بعد السحب:",formatUnits((await tok.balanceOf(P))-f1,9));
