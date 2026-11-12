const RPC="https://base-rpc.publicnode.com";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const RND="0x1111111111111111111111111111111111111111";
const pad=a=>"0".repeat(24)+a.slice(2).toLowerCase();
const {keccak256,concat,zeroPadValue,toBeHex}=await import("ethers");
const j=async(m,p)=>(await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})})).json();
const dec=d=>{if(!d)return"";if(d.startsWith("0x08c379a0")){const h=d.slice(10);
  const n=parseInt(h.slice(64,128),16);return Buffer.from(h.slice(128,128+n*2),"hex").toString();}return d.slice(0,30);};

console.log("balanceOf(ME):",(await j("eth_call",[{to:T,data:"0x70a08231"+pad(ME)},"latest"])).result);
for(const s of [0,7]){
  const k=keccak256(concat([zeroPadValue(ME,32),toBeHex(s,32)]));
  console.log("slot 0x"+s.toString(16)+"(ME):",(await j("eth_getStorageAt",[T,k,"latest"])).result);
}
const amt=(300n*10n**9n).toString(16).padStart(64,"0");
for(const [lbl,to] of [["للمحفظة عشوائية",RND],["للحوض",P]]){
  const c=await j("eth_call",[{from:ME,to:T,data:"0xa9059cbb"+pad(to)+amt},"latest"]);
  console.log(lbl,"→",c.error?"رفض: "+dec(c.error.data)+" | "+c.error.message:"نجح");
}
