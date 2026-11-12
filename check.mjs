const PAIR="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const A="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";  // SLOP
const B="0x4200000000000000000000000000000000000006";  // WETH
const RPCS=["https://mainnet.base.org","https://base.drpc.org","https://1rpc.io/base"];
const pad=a=>"0".repeat(24)+a.slice(2);
const rpc=async(u,b)=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),3000);
 try{const r=await fetch(u,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify(b),signal:c.signal});return await r.json()}catch{return null}finally{clearTimeout(t)}};
const u9=n=>(Number(n)/1e9).toFixed(3), u18=n=>(Number(n)/1e18).toFixed(6);

for(const u of RPCS){
  const b=await rpc(u,[
    {jsonrpc:"2.0",id:1,method:"eth_blockNumber",params:[]},
    {jsonrpc:"2.0",id:2,method:"eth_call",params:[{to:PAIR,data:"0x0dfe1681"},"latest"]},
    {jsonrpc:"2.0",id:3,method:"eth_call",params:[{to:PAIR,data:"0x0902f1ac"},"latest"]},
    {jsonrpc:"2.0",id:4,method:"eth_call",params:[{to:A,data:"0x70a08231"+pad(PAIR)},"latest"]},
    {jsonrpc:"2.0",id:5,method:"eth_call",params:[{to:B,data:"0x70a08231"+pad(PAIR)},"latest"]}]);
  if(!Array.isArray(b)){console.log(u,"✗ رد غير متوقع");continue}
  const g=id=>b.find(x=>x.id===id)||{};
  const blk=g(1).result?parseInt(g(1).result,16):0;
  const t0="0x"+(g(2).result||"").slice(-40).toLowerCase();
  const res=g(3).result;
  if(!res){console.log(u,"✗",g(3).error?.message);continue}
  const r0=BigInt("0x"+res.slice(2,66)), r1=BigInt("0x"+res.slice(66,130));
  const bSlop=BigInt(g(4).result), bWeth=BigInt(g(5).result);
  const [rs,rw,bs,bw] = t0===A.toLowerCase()
    ? [r0,r1,bSlop,bWeth] : [r1,r0,bSlop,bWeth];
  console.log(`\n${u} | بلوك ${blk} | token0=${t0}`);
  console.log(`  SLOP: رصيد ${u9(bs)} | احتياطي ${u9(rs)} | فائض ${u9(bs-rs)}`);
  console.log(`  WETH: رصيد ${u18(bw)} | احتياطي ${u18(rw)} | فائض ${u18(bw-rw)}`);
}
