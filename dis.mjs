import fs from "node:fs";
const R="https://base-rpc.publicnode.com",K="0x119fdC1e88b92A1F6565203b4288bEd9c30fFbCE";
const j=async(m,p)=>(await fetch(R,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})})).json();
const code=(await j("eth_getCode",[K,"latest"])).result;
fs.writeFileSync(process.env.HOME+"/slop/out/keeper.txt",code);
const h=code.slice(2);
console.log("بايتات:",h.length/2);

// كل سيليكتور ومنطقته
for(const s of ["8e194978","bb51ea92","edf8f2df","f9b39637","fc2015f8","2df45df5","3495b17e","3ea5b682","5e86c2ca","610fe672"]){
  const i=h.indexOf("63"+s);
  if(i<0){ console.log(s,"غير موجود"); continue; }
  console.log("\n=== "+s+" عند "+i+" ===");
  console.log(h.slice(i, i+140).replace(/(..)/g,"$1 "));
}

// هل يوجد فحص للمُرسِل (CALLER EQ)؟
let caller=0;
for(let i=0;i<Math.min(h.length,2200);i+=2) if(h.slice(i,i+2)==="33"&&h.slice(i+2,i+4)==="14") caller++;
console.log("\nأنماط CALLER-EQ بالدسباتشر:",caller);

// عناوين ثابتة مضمّنة
const addrs=[...h.matchAll(/73([0-9a-f]{40})/g)].map(m=>"0x"+m[1]);
console.log("عناوين PUSH20 مضمّنة:",[...new Set(addrs)].join(" ")||"لا شيء");

// عدّ عمليات النداء الخارجي
for(const [op,name] of [["f4","DELEGATECALL"],["f1","CALL"],["fa","STATICCALL"]]) console.log(name,(h.match(new RegExp(op,"g"))||[]).length);
