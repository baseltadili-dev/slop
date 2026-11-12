import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits } from "ethers";
const R="https://mainnet.base.org",T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592",W="0x4200000000000000000000000000000000000006",ROUTER="0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const p=new JsonRpcProvider(R,8453,{staticNetwork:true});
const w=new Wallet(fs.readFileSync(process.env.HOME+"/.pk","utf8").trim(),p),ME=w.address;
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)"],w);
const rt=new Contract(ROUTER,["function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)"],w);
const g=BigInt((await fetch(R,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_gasPrice",params:[]})}).then(r=>r.json())).result);
const o={maxFeePerGas:g*3n,maxPriorityFeePerGas:10000000n};
const b=await tok.balanceOf(ME);
console.log("تبيع:",formatUnits(b,9),"SLOP | غاز:",formatUnits(await p.getBalance(ME),18));
try{ await tok.approve(ROUTER,b,{...o,gasLimit:80000n}).then(t=>t.wait()); console.log("موافقة تمت"); }catch(e){ console.log("موافقة فشلت:",e.shortMessage); }
const t=await rt.swapExactTokensForETHSupportingFeeOnTransferTokens(b,0n,[T,W],ME,Math.floor(Date.now()/1000)+600,{...o,gasLimit:350000n});
const r=await t.wait();
console.log(r.status===1?"تم البيع ✓ | رصيدك: "+formatUnits(await p.getBalance(ME),18)+" ETH":"ارتد ✗");
