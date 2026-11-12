const R = process.env.RPC || "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const ME = "0xA4BC81CecCC9D8637147Fa4b5daAf55E8f9Ef33f";
const OWNER = "0xb31c22569075b0068480b72a3959b0348099f8c8";
const GS = 0x0e;

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const kecc = async () => {
  const { keccak256, concat, zeroPadValue, toBeHex } = await import("ethers");
  return [keccak256(concat([zeroPadValue(ME, 32), toBeHex(GS, 32)])), keccak256(concat([zeroPadValue(OWNER, 32), toBeHex(GS, 32)]))];
};
const [sME, sOWN] = await kecc();
const g = async s => BigInt((await j("eth_getStorageAt", [T, s, "latest"])).result);

console.log("gate[ME]:", (await g(sME)).toString(), "| gate[OWNER]:", (await g(sOWN)).toString());

const code = (await j("eth_getCode", [T, "latest"])).result;
const sels = [...new Set((code.match(/63[0-9a-f]{8}/g) || []).map(x => x.slice(2)))];
console.log("عدد المحددات في الكود:", sels.length);
console.log("هل 35665e12 موجود؟", code.includes("35665e12") ? "نعم" : "لا");
console.log(sels.join(" "));

const trace = async (from, data) => {
  const r = await j("debug_traceCall", [{ from, to: T, data, gas: "0x60000" }, "latest", { disableMemory: true, disableStorage: false, disableStack: false }]);
  if (r.error) return { err: r.error.message };
  const st = [];
  for (const l of r.result.structLogs) {
    if (l.op === "SSTORE") {
      const n = l.stack.length;
      st.push(BigInt(l.stack[n - 2]).toString(16) + " = " + BigInt(l.stack[n - 1]).toString(16));
    }
  }
  return { st };
};

const probe = async (from, data, lbl) => {
  const r = await trace(from, data);
  if (r.err) { console.log("✗", lbl, "|", r.err.slice(0, 80)); return false; }
  const hit = r.st.some(x => x.startsWith(sME.slice(2).toLowerCase()));
  console.log((r.st.length ? "• " : "  ") + lbl, "| SSTORE:", r.st.length ? r.st.join(" ; ") : "لا شيء");
  return hit;
};

console.log("\n=== أثر الدالة المعروفة 0x35665e12 ===");
await probe(ME, "0x35665e12" + pad(ME) + w32(0), "35665e12(ME,0) من ME");
await probe(OWNER, "0x35665e12" + pad(ME) + w32(0), "35665e12(ME,0) من المالك");

console.log("\n=== فحص المحددات بحثاً عن كتابة في خانة الحجب ===");
const ARGS = ["", pad(ME), pad(ME) + w32(0), pad(ME) + w32(1)];
const hits = [];
for (const s of sels) {
  for (const arg of ARGS) {
    for (const [who, from] of [["ME", ME], ["OWN", OWNER]]) {
      const ok = await probe(from, "0x" + s + arg, "0x" + s + (arg ? " +" + (arg.length / 64) : "") + " من " + who);
      if (ok) { hits.push("0x" + s + arg); break; }
    }
    if (hits.length) break;
  }
  if (hits.length) break;
}
console.log("\nنتيجة:", hits.length ? "★ " + hits.join(" ") : "لا دالة تكتب في خانة الحجب");
