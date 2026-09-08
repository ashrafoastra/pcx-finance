import express from 'express';
import cors from 'cors';
import { createPublicClient, http, defineChain, formatUnits } from 'viem';
import 'dotenv/config';

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET'],
}));

let cachedTokens = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

app.get('/api/all-tokens', async (req, res) => {
  const now = Date.now();

  if (cachedTokens && (now - cacheTimestamp) < CACHE_DURATION) {
    return res.json(cachedTokens);
  }

  try {
    const response = await fetch('https://robinhoodchain.blockscout.com/api/v2/tokens?type=ERC-20', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    if (!response.ok) {
      throw new Error('Blockscout returned status ' + response.status);
    }
    const data = await response.json();

    cachedTokens = data;
    cacheTimestamp = now;

    res.json(data);
  } catch (err) {
    console.error('Fetch error:', err.message);
    if (cachedTokens) {
      return res.json(cachedTokens);
    }
    res.status(500).json({ error: 'Failed to fetch tokens: ' + err.message });
  }
});

app.get('/', (req, res) => {
  res.json({ status: 'PCX Finance API is running' });
});

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

const STABLECOINS = {
  '0x5411257cedf60bc40f4bead410bf8d02079056a2': 1.0, // USDG
};

async function getTokenPrice(contractAddress) {
  const lower = contractAddress.toLowerCase();
  if (STABLECOINS[lower]) return STABLECOINS[lower];

  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`);
    const data = await res.json();
    if (data.pairs && data.pairs.length > 0) {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));