#!/usr/bin/env bash
cd ~/hh
pkill -f "hardhat node" 2>/dev/null; sleep 1
nohup npx hardhat node --port 8545 --hostname 127.0.0.1 > ~/slop/out/hh.log 2>&1 &
for i in $(seq 1 60); do
  curl -s -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    http://127.0.0.1:8545 >/dev/null 2>&1 && break; sleep 1
done
curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  http://127.0.0.1:8545
echo
cd ~/slop && node forkrecon.mjs
