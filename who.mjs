const RPC="https://base-rpc.publicnode.com";
const P="0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const T="0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const SYNC="0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1";
const rpc=async(m,p)=>(await fetch(RPC,{method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})})).json();
const pad=a=>"0".repeat(24)+a.slice(2);

const head=parseInt((await rpc("eth_blockNumber",[])).result,16);
const from=head-400;
console.log("head",head,"| نفحص",head-from,"بلوك");

const logs=[];
for(let s=from;s<=head;s+=25){
  const j=await rpc("eth_getLogs",[{address:P,fromBlock:"0x"+s.toString(16),
    toBlock:"0x"+Math.min(s+24,head).toString(16),topics:[SYNC]}]);
  if(j.error){ console.log("range",s,j.error.message); continue; }
  logs.push(...j.result);
}
console.log("عدد Sync:",logs.length);
for(const l of logs.slice(-15)){
  const tx=await rpc("eth_getTransactionByHash",[l.transactionHash]);
  const b=parseInt(l.blockNumber,16);
  console.log("بلوك",b,"| hash",l.transactionHash.slice(0,12),"| from",tx.result?.from,"| to",tx.result?.to,"| sel",tx.result?.input?.slice(0,10));
}
const [,r1]=await rpc("eth_call",[{to:T,data:"0x70a08231"+pad(P)},"latest"]).then(j=>({},{})).catch(()=>({},{}));
