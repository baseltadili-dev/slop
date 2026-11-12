const R="https://base-rpc.publicnode.com";
const K="0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const ME="0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const FRESH="0x0ef6263A4e505156cbA7D3D4C7AEcb601AC9DEE1";
const AMT=10367952381047n;
const SELS=["8e194978","bb51ea92","edf8f2df","f9b39637","fc2015f8","2df45df5","3495b17e","3ea5b682","5e86c2ca","610fe672"];
const j=async(m,pr)=>(await fetch(R,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:pr})})).json();
const pad=a=>"0".repeat(24)+a.slice(2).toLowerCase();
const w32=n=>BigInt(n).toString(16).padStart(64,"0");

const code=(await j("eth_getCode",[K,"latest"])).result.slice(2);
const h=code;

// أين فحوص المُرسِل؟
const ce=[];
for(let i=0;i<h.length;i+=2) if(h.slice(i,i+2)==="33"&&h.slice(i+2,i+4)==="14") ce.push(i/2);
console.log("CALLER-EQ:", ce.length?ce.map(x=>"0x"+x.toString(16)).join(" "):"لا شيء");
const dests={};
for(const s of SELS){
  const i=h.indexOf("63"+s);
  if(i<0){ console.log(s,"غير موجود"); continue; }
  const m=h.slice(i+10,i+14);
  const d=m.startsWith("61")?parseInt(h.slice(i+12,i+16),16):null;
  dests[s]=d;
  console.log("\n=== "+s+" → "+(d!==null?"0x"+d.toString(16):"?")+" ===");
  if(d!==null) console.log(h.slice(d*2,d*2+120).replace(/(..)/g,"$1 "));
}

console.log("\n--- نداءات (من "+ME.slice(0,10)+") ---");
const argsFull=[pad(T),pad(FRESH),w32(AMT)];
for(const s of SELS){
  for(const n of [0,2,3]){
    const data="0x"+s+argsFull.slice(0,n).join("");
    const c=await j("eth_call",[{from:ME,to:K,data},"latest"]);
    console.log(s,"n="+n,c.error?"✗":"يمر ✓ "+String(c.result||"").slice(0,66));
  }
}
