import { JsonRpcProvider, Wallet, Contract, parseUnits } from "ethers";
const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const w=new Wallet(process.env.PK,p);
const tok=new Contract(T,["function transfer(address,uint256) returns (bool)"],w);
const gp=BigInt((await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]})}).then(r=>r.json())).result);
const t=await tok.transfer(P,parseUnits(process.env.N||"120",9),{maxFeePerGas:gp*3n,gasLimit:150000n});
const r=await t.wait();
console.log("بذرة status",r.status,"| بلوك",r.blockNumber);
