import fs from "node:fs";
import { JsonRpcProvider, Wallet, Contract, formatUnits } from "ethers";
const R="https://mainnet.base.org",T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592",P="0x69249e64fd8D35036965fa09FadAEdb955D70C31",W="0x4200000000000000000000000000000000000006",ROUTER="0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";
const {keccak256,concat,zeroPadValue,toBeHex}=await import("ethers");
const p=new JsonRpcProvider(R,8453,{staticNetwork:true});
const w=new Wallet(fs.readFileSync(process.env.HOME+"/.pk","utf8").trim(),p),ME=w.address;
const tok=new Contract(T,["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)","function allowance(address,address) view returns (uint256)"],w);
const rt=new Contract(ROUTER,["function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)"],w);
const j=async(m,pr)=>(await fetch(R,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:pr})})).json();
const slot=async(s,a)=>(await j("eth_getStorageAt",[T,keccak256(concat([zeroPadValue(a,32),toBeHex(s,32)])),"latest"])).result;

for(let i=1;i<=40;i++){
  const bal=await tok.balanceOf(ME);
  if(bal<=0n){ console.log("ما بقي SLOP"); process.exit(0); }
  const fl=await slot(14,ME), lt=BigInt(await slot(20,ME)||0);
  const b=await j("eth_getBlockByNumber",["latest",false]);
  const gap=lt?String(BigInt(b.result.timestamp)-lt):"لا قيمة";

  const c=await j("eth_call",[{from:ME,to:T,data:"0xa9059cbb"+"0".repeat(24)+P.slice(2)+bal.toString(16).padStart(64,"0")},"latest"]);
  console.log(`[${i}] flagged=${fl} lastTx=${lt} فارق=${gap} | ${c.error?"مقفول":"مفتوح ✓"}`);

  if(!c.error){
    const g=BigInt((await j("eth_gasPrice",[])).result);
    const o={maxFeePerGas:g*3n,maxPriorityFeePerGas:10000000n};
    const al=await tok.allowance(ME,ROUTER);
    if(al<bal){ console.log(" موافقة..."); await (await tok.approve(ROUTER,bal,{...o,gasLimit:80000n})).wait(); }
    try{
      const t=await rt.swapExactTokensForETHSupportingFeeOnTransferTokens(bal,0n,[T,W],ME,Math.floor(Date.now()/1000)+600,{...o,gasLimit:350000n});
      const r=await t.wait();
      if(r.status===1){ console.log(">>> بِعت ✓ | رصيدك:",formatUnits(await p.getBalance(ME),18),"ETH"); process.exit(0); }
      console.log(" ارتد رغم الفحص المفتوح");
    }catch(e){ console.log(" إرسال فشل:",e.shortMessage); }
  }
  await new Promise(x=>setTimeout(x,15000));
}
console.log("انتهت المحاولات بلا فتح");
