import { ethers } from "ethers";
const p = new ethers.JsonRpcProvider("https://mainnet.base.org");
const ME = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const sibs = ["0x8f2e651ef70fff9282f29c397eb2a5d472b30082","0x18fbb4ea0085936681ed6858027fd92b4792b8ba",
 "0x46e3e18f4c6ea3d9a0ec18bf628334b0918e72a1","0x56db0ddd93e7e8e14020b4253f227e817151df2a",
 "0xf92739a272fb1711968dfc87205933124a572e9d","0x503df1d048ed51b59a10654897e43317e4a0ff7b",
 "0x8a6847ae09b3f06f19ffe2f483be38ae8bb9f215","0xb75e9fe79546b1cae117f7d8706f8efa09ca4b76"];
const h = (c) => ethers.keccak256(c);
const me = h(await p.getCode(ME));
console.log("target codehash", me);
for (const a of sibs) {
  const c = await p.getCode(a).catch(() => "0x");
  if (c === "0x") { console.log(a, "empty"); continue; }
  const same = h(c) === me;
  console.log(a, same ? "SAME BYTECODE" : "different", "| https://basescan.org/address/" + a);
}
