// TGT=0x<32b> node hit.mjs
import { execFileSync } from "node:child_process";
import { keccak_256 } from "@noble/hashes/sha3";

const gh = (a) => execFileSync("gh", a, { encoding: "utf8" });
const REPO = process.env.REPO || "baseltadili-dev/slop";
const TGT = (process.env.TGT || "").toLowerCase();
const SUF = process.env.SUF ?? "(uint256)";
const seen = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const alarm = (t) => {
  process.stdout.write("\x07");
  for (const c of [["termux-vibrate", "-d", "2000", "-f"],
                   ["termux-notification", "--title", "HIT", "--content", t, "--priority", "high", "--vibrate", "2000"]])
    try { execFileSync(c[0], c.slice(1)); } catch {}
};

const verify = (salt) => {
  const h = "0x" + Buffer.from(keccak_256(new TextEncoder().encode(salt + SUF))).toString("hex");
  return { h, ok: TGT ? h === TGT : null };
};

let wait = 20;
for (;;) {
  try {
    const runs = JSON.parse(gh(["run", "list", "--repo", REPO, "--workflow=brute.yml",
      "--limit", "30", "--json", "databaseId,status,conclusion"]));
    const live = runs.filter((r) => r.status !== "completed");
    const bad = runs.filter((r) => r.conclusion && !["success", "cancelled"].includes(r.conclusion));
    const issues = JSON.parse(gh(["issue", "list", "--repo", REPO, "--state", "all",
      "--limit", "50", "--json", "number,title"]));
    const hits = issues.filter((i) => i.title.startsWith("HIT "));

    console.log(`[${new Date().toISOString().slice(11, 19)}] شغال: ${live.length} | فشل: ${bad.length} | HIT: ${hits.length}`);
    if (bad.length) console.log(`  شوف: gh run view ${bad[0].databaseId} --repo ${REPO} --log`);

    for (const i of hits) {
      const salt = i.title.slice(4).trim();
      if (seen.has(salt)) continue;
      seen.add(salt);
      const v = verify(salt);
      console.log(`\n>>> HIT #${i.number}: ${salt}`);
      console.log(`    ${v.h}  ${v.ok === true ? "MATCH ✅" : v.ok === false ? "prefix فقط ❌" : ""}`);
      alarm(`${salt} ${v.ok === true ? "MATCH" : "prefix"}`);
    }
    if (hits.length && live.length === 0) console.log("\nكل الـ runs خلصت — Ctrl+C.");
    wait = 20;
  } catch (e) {
    console.log(`net: ${String(e.message).split("\n")[0]} | إعادة بعد ${wait}s`);
    wait = Math.min(120, wait * 2);
  }
  await sleep(wait * 1000);
}
