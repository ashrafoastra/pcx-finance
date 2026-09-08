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
const CACHE_DURATION = 5 * 60 * 1000;

app.get('/api/all-tokens', async (req, res) => {
  const now = Date.now();

  if (cachedTokens && (now - cacheTimestamp) < CACHE_DURATION) {
    return res.json(cachedTokens);
  }

  try {
    const validAddress = /^0x[a-fA-F0-9]{40}$/;
    const seen = {};
    const allItems = [];

    for (let page = 1; page <= 5; page++) {
      const response = await fetch('https://api.geckoterminal.com/api/v2/networks/robinhood/pools?page=' + page);
      if (!response.ok) continue;
      const data = await response.json();

      (data.data || []).forEach(function (pool) {
        const attrs = pool.attributes || {};
        const address = attrs.address;
        if (!address || !validAddress.test(address) || seen[address]) return;
        seen[address] = true;
        allItems.push({
          address_hash: address,
          name: attrs.name ? attrs.name.split(' / ')[0] : 'Unknown',
          symbol: attrs.name ? attrs.name.split(' / ')[0] : '?',
          icon_url: null,
        });
      });
    }

    const reshaped = { items: allItems };
    cachedTokens = reshaped;
    cacheTimestamp = now;

    res.json(reshaped);
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
  '0x5411257cedf60bc40f4bead410bf8d02079056a2': 1.0,
};

async function getTokenPrice(contractAddress) {
  const lower = contractAddress.toLowerCase();
  if (STABLECOINS[lower]) return STABLECOINS[lower];

  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + contractAddress);
    const data = await res.json();
    if (data.pairs && data.pairs.length > 0) {
      const bestPair = data.pairs.sort(function (a, b) {
        return (b.liquidity && b.liquidity.usd ? b.liquidity.usd : 0) - (a.liquidity && a.liquidity.usd ? a.liquidity.usd : 0);
      })[0];
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
      const results = await Promise.all([
        client.readContract({ address: token.contractAddress, abi: erc20Abi, functionName: 'symbol' }),
        client.readContract({ address: token.contractAddress, abi: erc20Abi, functionName: 'decimals' }),
      ]);
      const symbol = results[0];
      const decimals = results[1];
      const balance = parseFloat(formatUnits(BigInt(token.tokenBalance), decimals));
      const price = await getTokenPrice(token.contractAddress);
      const usdValue = balance * price;
      totalUsd += usdValue;

      tokens.push({
        symbol: symbol,
        balance: balance,
        price: price,
        usdValue: usdValue,
        contract: token.contractAddress,
      });
    } catch {}
  }

  res.json({ wallet: wallet, tokens: tokens, totalUsd: totalUsd });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('API running on port ' + PORT);
});