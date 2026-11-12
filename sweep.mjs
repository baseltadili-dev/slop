import { JsonRpcProvider, Wallet, Contract, formatUnits } from "ethers";
const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const p=new JsonRpcProvider(RPC,8453,{staticNetwork:true});
const w=new Wallet(process.env.PK,p), ME=await w.getAddress();
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function transfer(address,uint256) returns (bool)"],p);
console.log("عند ME:",formatUnits(await tok.balanceOf(ME),9));
for(const a of process.argv.slice(2)) console.log(a,":",formatUnits(await tok.balanceOf(a),9));
