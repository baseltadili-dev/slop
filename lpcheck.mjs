import { JsonRpcProvider, Contract, formatUnits } from "ethers";

const p = new JsonRpcProvider("https://mainnet.base.org",8453);
const pair = new Contract(
 "0x69249e64fd8D35036965fa09FadAEdb955D70C31",
 [
  "function totalSupply() view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function token0() view returns(address)",
  "function token1() view returns(address)"
 ],p
);

const total = await pair.totalSupply();
console.log("LP TOTAL:",formatUnits(total,18));
console.log("TOKEN0:",await pair.token0());
console.log("TOKEN1:",await pair.token1());
console.log("PAIR LP BALANCE:",formatUnits(
 await pair.balanceOf("0x69249e64fd8D35036965fa09FadAEdb955D70C31"),18
));
