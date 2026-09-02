import express from 'express';
import cors from 'cors';
import { createPublicClient, http, defineChain, formatUnits } from 'viem';
import 'dotenv/config';

const app = express();
app.use(cors());

const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_URL] } },
});

const client = createPublicClient({ chain: robinhoodChain, transport: http() });

const erc20Abi = [
  { name: 'symbol', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { name: 'decimals', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
];

// Known stablecoins — treat as fixed $1, don't trust thin liquidity pools for these
const STABLECOINS = {
  '0x5411257cedf60bc40f4bead410bf8d02079056a2': 1.0, // USDG
};

// Fetch USD price for a token contract from DexScreener
async function getTokenPrice(contractAddress) {
  const lower = contractAddress.toLowerCase();
  if (STABLECOINS[lower]) return STABLECOINS[lower];

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
    const data = await res.json();
    if (data.pairs && data.pairs.length > 0) {
      // Use the pair with the highest liquidity for the most reliable price
      const bestPair = data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      return parseFloat(bestPair.priceUsd) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

app.get('/api/portfolio/:wallet', async (req, res) => {
  const wallet = req.params.wallet;

  const response = await fetch(process.env.RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'alchemy_getTokenBalances', params: [wallet],
    }),
  });
  const data = await response.json();
  const tokens = [];
  let totalUsd = 0;

  for (const token of data.result.tokenBalances) {
    if (BigInt(token.tokenBalance) === 0n) continue;
    try {
      const [symbol, decimals] = await Promise.all([
        client.readContract({ address: token.contractAddress, abi: erc20Abi, functionName: 'symbol' }),
        client.readContract({ address: token.contractAddress, abi: erc20Abi, functionName: 'decimals' }),
      ]);

      const balance = parseFloat(formatUnits(BigInt(token.tokenBalance), decimals));
      const price = await getTokenPrice(token.contractAddress);
      const usdValue = balance * price;
      totalUsd += usdValue;

      tokens.push({
        symbol,
        balance,
        price,
        usdValue,
        contract: token.contractAddress,
      });
    } catch {}
  }

  res.json({ wallet, tokens, totalUsd });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));