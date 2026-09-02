import { createPublicClient, http, defineChain, formatUnits } from 'viem';
import 'dotenv/config';

const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL] } },
});

const client = createPublicClient({
  chain: robinhoodChain,
  transport: http(),
});

const TEST_WALLET = '0x1dd570664fe1708faa5970591e6dabcc24c9dd80';

const erc20Abi = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
];

async function main() {
  // Call Alchemy's special endpoint directly (viem doesn't wrap this one natively)
  const response = await fetch(process.env.RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getTokenBalances',
      params: [TEST_WALLET],
    }),
  });

  const data = await response.json();
  const balances = data.result.tokenBalances;

  console.log(`Found ${balances.length} token(s) in wallet.\n`);

  for (const token of balances) {
    // Skip tokens with zero balance
    if (token.tokenBalance === '0x0000000000000000000000000000000000000000000000000000000000000000') continue;

    try {
      const [symbol, decimals] = await Promise.all([
        client.readContract({
          address: token.contractAddress,
          abi: erc20Abi,
          functionName: 'symbol',
        }),
        client.readContract({
          address: token.contractAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
      ]);

      const rawBalance = BigInt(token.tokenBalance);
      const readableBalance = formatUnits(rawBalance, decimals);

      console.log(`${symbol}: ${readableBalance}  (${token.contractAddress})`);
    } catch (err) {
      console.log(`Unknown token at ${token.contractAddress} — couldn't read symbol/decimals`);
    }
  }
}

main();