const RPC="https://mainnet.base.org";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const pad=a=>"0".repeat(24)+a.slice(2).toLowerCase();
const call=async(from,to,data)=>(await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_call",params:[{from,to,data},"latest"]})})).json();
const dec=d=>{ if(!d) return ""; if(d.startsWith("0x08c379a0")){
  const h=d.slice(10); const len=parseInt(h.slice(64,128),16);
  return Buffer.from(h.slice(128,128+len*2),"hex").toString(); } return d.slice(0,40); };

for(const amt of [800428356660n, 1000000000n, 1n, 0n]){
  const j=await call(P,T,"0xa9059cbb"+pad(ME)+amt.toString(16).padStart(64,"0"));
  console.log("مبلغ",amt.toString(),"→", j.error?"رفض: "+dec(j.error.data)+" | "+j.error.message : "نجح");
}
// نفس الشي لكن المستلم عنوان آخر
const j2=await call(P,T,"0xa9059cbb"+pad("0x000000000000000000000000000000000000dEaD")+(800428356660n).toString(16).padStart(64,"0"));
console.log("لمستلم آخر →", j2.error?"رفض: "+dec(j2.error.data):"نجح");
