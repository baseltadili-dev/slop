const R="https://base-rpc.publicnode.com";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const rpc=async(m,p)=>(await fetch(R,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})})).json();
for(const s of ["0x11","0x13","0x1a","0x1d","0x1e","0x1f","0x20"]){
  const v=(await rpc("eth_getStorageAt",[T,s,"latest"])).result;
  const a=v&&/^0x0{24}/.test(v)?"0x"+v.slice(-40):"";
  console.log(s.padEnd(5), v, a?"-> "+a:"");
}
// الأرصدة الحقيقية: slot 0 مابنغ، لا balanceOf
const {keccak256,concat,zeroPadValue,toBeHex}=await import("ethers");
for(const [lbl,ad] of [["pair",P],["token",T],["me",ME]]){
  const k=keccak256(concat([zeroPadValue(ad,32),toBeHex(0,32)]));
  const v=(await rpc("eth_getStorageAt",[T,k,"latest"])).result;
  console.log(lbl,BigInt(v||0).toString());
}
