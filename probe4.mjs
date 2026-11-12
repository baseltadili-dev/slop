import fs from "node:fs";
import { JsonRpcProvider, Wallet } from "ethers";

const R = "https://mainnet.base.org";
const T = "0xA5a3A7a1dec1a57E41A0Cdd8c2129CfD7B46b592";
const P = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";
const MC = "0xcA11bde05977b3631167028862bE2a173976CA11";
const M = 10n ** 21n;

const j = async (m, pr) => (await fetch(R, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: pr }) })).json();
const pad = a => "0".repeat(24) + a.slice(2).toLowerCase();
const w32 = n => BigInt(n).toString(16).padStart(64, "0");
const balOf = a => "0x70a08231" + pad(a);
const drop = (amt, to) => "0x983bc41b" + w32(0x60) + pad(to) + w32(amt) + w32(1) + pad(P);

function agg3(calls) {
  const els = calls.map(([t, d]) => {
    const b = d.slice(2), len = b.length / 2;
    return pad(t) + w32(1) + w32(0x60) + w32(len) + b.padEnd(Math.ceil(len / 32) * 64, "0");
  });
  let head = w32(0x20) + w32(calls.length), off = calls.length * 32;
  for (const e of els) { head += w32(off); off += e.length / 2; }
  return "0x82ad56cb" + head + els.join("");
}

function dec3(hex) {
  const b = hex.slice(2), w = i => b.slice(i * 64, i * 64 + 64);
  const n = parseInt(w(1), 16);
  const out = [];
  for (let i = 0; i < n; i++) {
    const base = 2 + i * 2;
    const ok = BigInt("0x" + w(base)) === 1n;
    const ds = base + parseInt(w(base + 1), 16) / 32;
    const dl = parseInt(w(ds), 16);
    const data = "0x" + b.slice((ds + 1) * 64, (ds + 1) * 64 + dl * 2);
    out.push({ ok, data });
  }
  return out;
}

const p = new JsonRpcProvider(R, 8453, { staticNetwork: true });
const me = new Wallet(fs.readFileSync(process.env.HOME + "/.pk", "utf8").trim(), p);
const ME = me.address;

const run = async (label, calls, names) => {
  const r = await j("eth_call", [{ from: ME, to: MC, data: agg3(calls), gas: "0x90000" }, "latest"]);
  console.log("\n=== " + label + " ===");
  if (r.error) { console.log("رفض:", r.error.message); return; }
  const res = dec3(r.result);
  res.forEach((x, i) => {
    const val = x.data === "0x" ? "-" : BigInt(x.data).toString();
    console.log((x.ok ? "✓ " : "✗ ") + names[i] + (names[i].startsWith("bal") ? " = " + val : ""));
  });
};

const b = async a => BigInt((await j("eth_call", [{ to: T, data: balOf(a) }, "latest"])).result);
console.log("قبل — ME:", (await b(ME)).toString(), "| الحوض:", (await b(P)).toString(), "| MC:", (await b(MC)).toString());

await run("سك إلى الحوض", [[T, drop(M, P)], [T, balOf(P)], [T, balOf(ME)], [T, balOf(MC)]], ["airdrop→P", "bal(P)", "bal(ME)", "bal(MC)"]);
await run("سك إلى MC نفسه", [[T, drop(M, MC)], [T, balOf(MC)], [T, balOf(ME)], [T, balOf(P)]], ["airdrop→MC", "bal(MC)", "bal(ME)", "bal(P)"]);
