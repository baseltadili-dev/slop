import { JsonRpcProvider, id } from "ethers";

const p = new JsonRpcProvider("https://base-rpc.publicnode.com",8453);
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";

const funcs = [
 "owner()","admin()","paused()","tradingEnabled()",
 "buyTax()","sellTax()","taxBuy()","taxSell()",
 "marketingWallet()","feeWallet()","uniswapV2Pair()",
 "totalSupply()","decimals()"
];

for (const f of funcs) {
 try {
  const r = await p.call({to:T,data:id(f).slice(0,10)});
  console.log(f, r);
 } catch {
  console.log(f, "REVERT / غير متاحة");
 }
}
