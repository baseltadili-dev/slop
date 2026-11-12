import { JsonRpcProvider, id, formatUnits } from "ethers";

const p = new JsonRpcProvider("https://mainnet.base.org",8453);
const pair = "0x69249e64fd8D35036965fa09FadAEdb955D70C31";

const transfer = id("Transfer(address,address,uint256)");
const zero = "0x0000000000000000000000000000000000000000";

const logs = await p.getLogs({
  address: pair,
  topics: [transfer],
  fromBlock: 0,
  toBlock: "latest"
});

for (const l of logs) {
  const from = "0x" + l.topics[1].slice(-40);
  const to = "0x" + l.topics[2].slice(-40);
  const amount = BigInt(l.data);
  console.log({
    block: l.blockNumber,
    from,
    to,
    LP: formatUnits(amount,18)
  });
}
