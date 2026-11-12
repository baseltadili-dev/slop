import { ethers } from "ethers";

const RPC = "https://mainnet.base.org";
const ADDRESS = "0x69249e64fd8d35036965fa09fadaedb955d70c31";

const provider = new ethers.JsonRpcProvider(RPC);
const code = await provider.getCode(ADDRESS);

if (code === "0x") {
  throw new Error("العقد لا يحتوي على Bytecode");
}

const hex = code.slice(2);
const selectors = new Set();

for (let i = 0; i < hex.length;) {
  const op = parseInt(hex.slice(i, i + 2), 16);
  i += 2;

  if (op === 0x63) {
    selectors.add("0x" + hex.slice(i, i + 8));
  }

  if (op >= 0x60 && op <= 0x7f) {
    i += (op - 0x5f) * 2;
  }
}

const standard = [
 "factory()",
 "token0()",
 "token1()",
 "getReserves()",
 "mint(address)",
 "burn(address)",
 "swap(uint256,uint256,address,bytes)",
 "skim(address)",
 "sync()",
 "initialize(address,address)",
 "totalSupply()",
 "balanceOf(address)",
 "transfer(address,uint256)",
 "approve(address,uint256)",
 "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)"
];

console.log("=== BYTECODE FUNCTION MAP ===");
console.log("Address:", ADDRESS);
console.log("Bytecode bytes:", hex.length / 2);
console.log("Unique PUSH4 values:", selectors.size);

console.log("\n=== SELECTORS ===");

for (const s of [...selectors].sort()) {
  const known = standard.find(
    x => ethers.id(x).slice(0,10).toLowerCase() === s.toLowerCase()
  );

  console.log(s, known || "UNKNOWN");
}

