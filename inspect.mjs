import { ethers } from "ethers";

const RPC = "https://mainnet.base.org";
const PAIR = "0x69249e64fd8d35036965fa09fadaedb955d70c31";

const abi = [
 "function token0() view returns(address)",
 "function token1() view returns(address)",
 "function getReserves() view returns(uint112,uint112,uint32)",
 "function totalSupply() view returns(uint256)",
 "function factory() view returns(address)",
 "function kLast() view returns(uint256)"
];

const provider = new ethers.JsonRpcProvider(RPC);
const pair = new ethers.Contract(PAIR, abi, provider);

try {
 const [code, t0, t1, reserves, supply, factory, kLast] =
 await Promise.all([
  provider.getCode(PAIR),
  pair.token0(),
  pair.token1(),
  pair.getReserves(),
  pair.totalSupply(),
  pair.factory(),
  pair.kLast()
 ]);

 const [b0,b1] = await Promise.all([
  provider.getBalance(PAIR),
  provider.getBalance(PAIR)
 ]);

 console.log("\n=== PAIR INSPECTION ===");
 console.log("Code bytes:", (code.length-2)/2);
 console.log("Token0:", t0);
 console.log("Token1:", t1);
 console.log("Reserve0:", reserves[0].toString());
 console.log("Reserve1:", reserves[1].toString());
 console.log("Timestamp:", reserves[2].toString());
 console.log("Total LP:", supply.toString());
 console.log("Factory:", factory);
 console.log("kLast:", kLast.toString());
 console.log("WETH balance:", ethers.formatEther(b0));
 console.log("Native balance:", ethers.formatEther(b1));
} catch(e) {
 console.log("ERROR:",e.shortMessage || e.message);
}
