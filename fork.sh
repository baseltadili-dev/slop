#!/usr/bin/env bash
cd "$HOME/slop"; mkdir -p out
pkill -f "anvil --fork" 2>/dev/null; pkill -f "hardhat node" 2>/dev/null; sleep 1
if command -v anvil >/dev/null; then
  nohup anvil --fork-url "${RPC:-https://mainnet.base.org}" --chain-id 8453 --port 8545 --auto-impersonate --silent > out/node.log 2>&1 &
elif [ -f "$HOME/hh/hardhat.config.js" ]; then
  cd "$HOME/hh"; nohup npx hardhat node --port 8545 --hostname 127.0.0.1 > "$HOME/slop/out/node.log" 2>&1 &
else
  echo "لا anvil ولا hardhat جاهزين. نفّذ: pkg install -y foundry"; exit 1
fi
for i in $(seq 1 60); do
  cast chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1 && break; sleep 1
done
cd "$HOME/slop"
cast chain-id --rpc-url http://127.0.0.1:8545 || { echo "الفورك فشل:"; tail -20 out/node.log; exit 1; }
echo "fork ok, block $(cast block-number --rpc-url http://127.0.0.1:8545)"
node forkrecon.mjs
