const RPC="https://mainnet.base.org";
const W="0x4200000000000000000000000000000000000006";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const pad=a=>"0".repeat(24)+a.slice(2).toLowerCase();
const j=async(m,p)=>(await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})})).json();

const bal=(await j("eth_call",[{to:W,data:"0x70a08231"+pad(P)},"latest"])).result;
const res=(await j("eth_call",[{to:P,data:"0x0902f1ac"},"latest"])).result;
const r0=BigInt("0x"+res.slice(2,66));
console.log("رصيد WETH بالحوض:",bal,"| احتياطي WETH:",r0.toString());
console.log("فرق WETH:",(BigInt(bal)-r0).toString());

for(const amt of [0n,1n]){
  const c=await j("eth_call",[{from:P,to:W,data:"0xa9059cbb"+pad(ME)+amt.toString(16).padStart(64,"0")},"latest"]);
  console.log("WETH.transfer",amt.toString(),"→",c.error?"رفض: "+c.error.message:"نجح");
}
