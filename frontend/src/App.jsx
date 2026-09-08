import { useState, useEffect } from 'react';
import { BrowserProvider, Contract, JsonRpcProvider, parseEther, formatEther } from 'ethers';
import PriceChart from './PriceChart.jsx';
import './App.css';

const UNISWAP_ROUTER = '0x89e5DB8B5aA49aA85AC63f691524311AEB649eba';
const FACTORY_ADDRESS = '0xC917F2F85E71dB667b920ff67Ca34a61760b735C';
const RPC_URL = 'https://rpc.mainnet.chain.robinhood.com';
const EXPLORER_URL = 'https://robinhoodchain.blockscout.com';
const FREEIMAGE_API_KEY = '6d207e02198a847aa98d0a2a901485a5';
const ALL_TOKENS_API = 'https://wholesome-smile-production-6536.up.railway.app/api/all-tokens';

const ROUTER_ABI = [
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] path, address to, uint deadline) external payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external',
  'function WETH() external view returns (address)',
];

const ERC20_ABI = [
  'function balanceOf(address) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
];

const FACTORY_ABI = [
  'function launch(string name, string symbol, uint256 totalSupply, uint256 feeBps, uint256 minHoldForRewards, string imageUrl, uint256 liquidityTokenAmount) external payable returns (address, address)',
  'function totalLaunches() external view returns (uint256)',
  'function launches(uint256) external view returns (address token, address vault, address dev, uint256 launchedAt, string imageUrl)',
];

const TOKEN_ABI = [
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function feeBps() external view returns (uint256)',
  'function minHoldForRewards() external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
];

const VAULT_ABI = [
  'function poolBalance() external view returns (uint256)',
];

const ROBINHOOD_MAINNET = {
  chainId: '0x1237',
  chainName: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: [RPC_URL],
  blockExplorerUrls: [EXPLORER_URL],
};

function truncate(addr) {
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

function parseUnitsLike(value, decimals) {
  const parts = (value || '0').split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(Number(decimals), '0').slice(0, Number(decimals));
  return BigInt((whole + frac) || '0');
}

function Avatar(props) {
  var symbol = props.symbol;
  var imageUrl = props.imageUrl;
  var hue = symbol ? (symbol.charCodeAt(0) * 37) % 360 : 0;

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={symbol}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
        onError={function (e) { e.target.style.display = 'none'; }}
      />
    );
  }

  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'hsl(' + hue + ', 35%, 30%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: 14,
        color: '#EDEAE2',
        flexShrink: 0,
      }}
    >
      {symbol ? symbol[0].toUpperCase() : '?'}
    </div>
  );
}

function TokenRow(props) {
  var t = props.token;

  function handleClick() {
    props.onSelect(t);
  }

  return (
    <div className="token-row" onClick={handleClick} role="button">
      <Avatar symbol={t.symbol} imageUrl={t.imageUrl} />
      <div className="token-info">
        <div className="token-name">
          {t.name} <span className="token-symbol">{t.symbol}</span>
          {t.isOurs ? <span className="pcx-badge">PCX</span> : null}
          {t.isOurs && t.hasActivity ? <span className="graduated-badge">active</span> : null}
        </div>
        <div className="token-meta">
          {t.isOurs
            ? t.feePercent + '% tax · min hold ' + Number(t.minHold).toLocaleString() + ' · reward pool ' + Number(t.rewardPool).toFixed(2)
            : 'Trade on Robinhood Chain'}
        </div>
      </div>
    </div>
  );
}

function TradeView(props) {
  var token = props.token;
  var onBack = props.onBack;

  const [wallet, setWallet] = useState('');
  const [mode, setMode] = useState('buy');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');
  const [pairData, setPairData] = useState(null);
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(function () {
    async function fetchPair() {
      setChartLoading(true);
      try {
        const res = await fetch('https://api.dexscreener.com/token-pairs/v1/robinhood/' + token.address);
        const data = await res.json();
        if (data && data.length > 0) {
          setPairData(data[0]);
        }
      } catch (err) {
        console.error('Chart fetch failed:', err);
      } finally {
        setChartLoading(false);
      }
    }
    fetchPair();
  }, [token.address]);

  async function connect() {
    const provider = new BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    setWallet(accounts[0]);
  }

  async function executeTrade() {
    if (!wallet) {
      setStatus('Connect your wallet first.');
      return;
    }
    setStatus('Sending transaction…');
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const router = new Contract(UNISWAP_ROUTER, ROUTER_ABI, signer);
      const weth = await router.WETH();
      const deadline = Math.floor(Date.now() / 1000) + 300;

      if (mode === 'buy') {
        const path = [weth, token.address];
        const tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
          0, path, wallet, deadline, { value: parseEther(amount || '0') }
        );
        setStatus('Waiting for confirmation…');
        await tx.wait();
        setStatus('Bought successfully.');
      } else {
        const tokenContract = new Contract(token.address, ERC20_ABI, signer);
        const decimals = await tokenContract.decimals();
        const amountIn = parseUnitsLike(amount, decimals);

        const allowance = await tokenContract.allowance(wallet, UNISWAP_ROUTER);
        if (allowance < amountIn) {
          setStatus('Approving…');
          const approveTx = await tokenContract.approve(UNISWAP_ROUTER, amountIn);
          await approveTx.wait();
        }

        const path = [token.address, weth];
        setStatus('Swapping…');
        const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
          amountIn, 0, path, wallet, deadline
        );
        await tx.wait();
        setStatus('Sold successfully.');
      }
    } catch (err) {
      setStatus('Trade failed — ' + (err.reason || err.message));
    }
  }

  function fmtCompact(n) {
    if (!n) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(2);
  }

  const change24h = pairData && pairData.priceChange ? pairData.priceChange.h24 : null;

  return (
    <div className="ledger">
      <span className="back-link" onClick={onBack} role="button">← back</span>

      <div className="trade-header">
        <Avatar symbol={token.symbol} imageUrl={token.imageUrl} />
        <div>
          <div className="token-name">{token.name} <span className="token-symbol">{token.symbol}</span></div>
          {token.isOurs ? (
            <div className="token-meta">
              {token.feePercent}% tax · min hold {Number(token.minHold).toLocaleString()} · reward pool {Number(token.rewardPool).toFixed(2)}
            </div>
          ) : (
            <div className="token-meta">No reward program — not launched on PCX</div>
          )}
        </div>
      </div>

      {pairData ? (
        <div className="stats-row">
          <div className="stat">
            <span className="stat-label">Price</span>
            <span className="stat-value">${Number(pairData.priceUsd).toFixed(6)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">24h</span>
            <span className={'stat-value ' + (change24h >= 0 ? 'up' : 'down')}>
              {change24h != null ? (change24h >= 0 ? '+' : '') + change24h.toFixed(2) + '%' : '—'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Market cap</span>
            <span className="stat-value">{fmtCompact(pairData.marketCap)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Liquidity</span>
            <span className="stat-value">{fmtCompact(pairData.liquidity ? pairData.liquidity.usd : null)}</span>
          </div>
        </div>
      ) : null}

      {chartLoading ? (
        <p className="token-meta" style={{ textAlign: 'center', margin: '20px 0' }}>Loading chart…</p>
      ) : pairData ? (
        <div style={{ margin: '16px 0', border: '1px solid rgba(255,255,255,0.1)', padding: 12 }}>
          <PriceChart pairAddress={pairData.pairAddress} />
        </div>
      ) : (
        <p className="token-meta" style={{ textAlign: 'center', margin: '20px 0' }}>Chart not yet available — pool too new to be indexed.</p>
      )}

      {!wallet ? (
        <div className="wallet-row">
          <button className="connect-btn" onClick={connect}>Connect wallet</button>
        </div>
      ) : null}

      <div className="tabs" style={{ marginTop: 24 }}>
        <button className={mode === 'buy' ? 'tab active' : 'tab'} onClick={function () { setMode('buy'); }}>Buy</button>
        <button className={mode === 'sell' ? 'tab active' : 'tab'} onClick={function () { setMode('sell'); }}>Sell</button>
      </div>

      <div className="field">
        <label>{mode === 'buy' ? 'ETH amount' : token.symbol + ' amount'}</label>
        <input
          placeholder="0.0"
          value={amount}
          onChange={function (e) { setAmount(e.target.value); }}
        />
      </div>

      <div className="quick-amounts">
        {['0.01', '0.05', '0.1', '0.5'].map(function (v) {
          return (
            <button key={v} className="quick-btn" onClick={function () { setAmount(v); }}>
              {v} {mode === 'buy' ? 'ETH' : token.symbol}
            </button>
          );
        })}
      </div>

      <button className="launch-btn" onClick={executeTrade} disabled={!wallet}>
        {mode === 'buy' ? 'Buy' : 'Sell'} {token.symbol}
      </button>

      {status ? <div className="receipt"><p className="receipt-status">{status}</p></div> : null}
    </div>
  );
}

function ExploreTab(props) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTokens();
  }, []);

  async function loadTokens() {
    setLoading(true);
    try {
      const provider = new JsonRpcProvider(RPC_URL);
      const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);

      const total = await factory.totalLaunches();
      const ourTokens = {};
      const ourResults = [];

      for (let i = 0; i < Number(total); i++) {
        const launch = await factory.launches(i);
        const token = new Contract(launch.token, TOKEN_ABI, provider);
        const vault = new Contract(launch.vault, VAULT_ABI, provider);

        const tokenName = await token.name();
        const tokenSymbol = await token.symbol();
        const feeBps = await token.feeBps();
        const minHold = await token.minHoldForRewards();
        const poolBalance = await vault.poolBalance();

        const entry = {
          address: launch.token.toLowerCase(),
          vault: launch.vault,
          imageUrl: launch.imageUrl,
          name: tokenName,
          symbol: tokenSymbol,
          feePercent: Number(feeBps) / 100,
          minHold: formatEther(minHold),
          rewardPool: formatEther(poolBalance),
          hasActivity: poolBalance > 0n,
          isOurs: true,
        };
        ourTokens[entry.address] = true;
        ourResults.push(entry);
      }

      let externalResults = [];
      try {
        const res = await fetch(ALL_TOKENS_API);
        const data = await res.json();
        externalResults = (data.items || [])
          .filter(function (t) { return t.address_hash && !ourTokens[t.address_hash.toLowerCase()]; })
          .slice(0, 40)
          .map(function (t) {
            return {
              address: t.address_hash.toLowerCase(),
              imageUrl: t.icon_url,
              name: t.name,
              symbol: t.symbol,
              isOurs: false,
            };
          });
      } catch (err) {
        console.error('Token list fetch failed:', err);
      }

      const combined = ourResults.concat(externalResults);
      setTokens(combined);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <p style={{ color: 'rgba(255,255,255,0.42)', textAlign: 'center' }}>Loading tokens…</p>;
  }
  if (tokens.length === 0) {
    return <p style={{ color: 'rgba(255,255,255,0.42)', textAlign: 'center' }}>No tokens found.</p>;
  }

  return (
    <div className="token-list">
      {tokens.map(function (t) {
        return <TokenRow key={t.address} token={t} onSelect={props.onSelect} />;
      })}
    </div>
  );
}

function LaunchTab() {
  const [wallet, setWallet] = useState('');
  const [form, setForm] = useState({
    name: '',
    symbol: '',
    supply: '1000000',
    feePercent: 3,
    minHold: '1000',
    imageUrl: '',
    liquidityPercent: 50,
    ethAmount: '0.01',
  });
  const [status, setStatus] = useState('');
  const [verified, setVerified] = useState(false);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function connectWallet() {
    if (!window.ethereum) {
      setStatus('MetaMask not found.');
      return;
    }
    try {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: ROBINHOOD_MAINNET.chainId }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [ROBINHOOD_MAINNET],
          });
        }
      }
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      setWallet(accounts[0]);
      setStatus('');
    } catch (err) {
      setStatus('Failed to connect: ' + err.message);
    }
  }

  async function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('key', FREEIMAGE_API_KEY);

      const res = await fetch('https://freeimage.host/api/1/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setForm(function (prev) {
          return { ...prev, imageUrl: data.image.url };
        });
      } else {
        setStatus('Image upload failed.');
      }
    } catch (err) {
      setStatus('Image upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function launchToken() {
    if (!wallet) {
      setStatus('Connect your wallet first.');
      return;
    }
    setStatus('Sending transaction…');
    setVerified(false);
    setResult(null);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
      const feeBps = Math.round(form.feePercent * 100);

      const totalSupplyWei = parseEther(form.supply || '0');
      const liquidityTokenAmount = (totalSupplyWei * BigInt(Math.round(form.liquidityPercent))) / 100n;
      const ethValue = parseEther(form.ethAmount || '0');

      const tx = await factory.launch(
        form.name,
        form.symbol,
        totalSupplyWei,
        feeBps,
        parseEther(form.minHold || '0'),
        form.imageUrl,
        liquidityTokenAmount,
        { value: ethValue }
      );
      setStatus('Waiting for confirmation…');
      await tx.wait();
      setStatus('Verified on chain.');
      setVerified(true);
      setResult({
        txHash: tx.hash,
        explorerUrl: EXPLORER_URL + '/tx/' + tx.hash,
      });
    } catch (err) {
      setStatus('Launch failed — ' + (err.reason || err.message));
      setVerified(false);
    }
  }

  function openTx() {
    window.open(result.explorerUrl, '_blank');
  }

  return (
    <div className="ledger">
      <div className="wallet-row">
        {!wallet ? (
          <button className="connect-btn" onClick={connectWallet}>Connect wallet</button>
        ) : (
          <div className="connected-row">
            <span className="seal">◆</span>
            <span>{truncate(wallet)}</span>
          </div>
        )}
      </div>

      <div className="field">
        <label>Token name</label>
        <input
          placeholder="e.g. Practical Coin"
          value={form.name}
          onChange={function (e) { setForm({ ...form, name: e.target.value }); }}
        />
      </div>

      <div className="field">
        <label>Symbol</label>
        <input
          placeholder="e.g. PCXT"
          value={form.symbol}
          onChange={function (e) { setForm({ ...form, symbol: e.target.value }); }}
        />
      </div>

      <div className="field">
        <label>Total supply</label>
        <input
          value={form.supply}
          onChange={function (e) { setForm({ ...form, supply: e.target.value }); }}
        />
      </div>

      <div className="field">
        <label>Tax on every trade — funds holder rewards</label>
        <div className="slider-row">
          <input
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={form.feePercent}
            onChange={function (e) { setForm({ ...form, feePercent: parseFloat(e.target.value) }); }}
          />
          <span className="slider-value">{form.feePercent}%</span>
        </div>
      </div>

      <div className="field">
        <label>Minimum hold to qualify for rewards</label>
        <input
          value={form.minHold}
          onChange={function (e) { setForm({ ...form, minHold: e.target.value }); }}
        />
      </div>

      <div className="field">
        <label>% of supply seeding liquidity — the rest goes to you</label>
        <div className="slider-row">
          <input
            type="range"
            min="10"
            max="90"
            step="5"
            value={form.liquidityPercent}
            onChange={function (e) { setForm({ ...form, liquidityPercent: parseFloat(e.target.value) }); }}
          />
          <span className="slider-value">{form.liquidityPercent}%</span>
        </div>
      </div>

      <div className="field">
        <label>ETH to seed liquidity — permanently locked, paired with your tokens</label>
        <input
          value={form.ethAmount}
          onChange={function (e) { setForm({ ...form, ethAmount: e.target.value }); }}
        />
      </div>

      <div className="field">
        <label>Token image</label>
        <div className="image-upload">
          <label className="upload-circle">
            {uploading ? '…' : form.imageUrl ? <img src={form.imageUrl} alt="preview" /> : '+'}
            <input
              type="file"
              accept="image/png, image/jpeg"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
          </label>
          <span className="upload-hint">
            {form.imageUrl ? 'Image uploaded' : 'Click to choose a PNG'}
          </span>
        </div>
      </div>

      <button className="launch-btn" onClick={launchToken} disabled={!wallet}>
        Launch token
      </button>

      {status ? (
        <div className="receipt">
          <p className={verified ? 'receipt-status verified' : 'receipt-status'}>{status}</p>
          {result ? (
            <span className="tx-link" onClick={openTx} role="button">View transaction</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('explore');
  const [selectedToken, setSelectedToken] = useState(null);

  function handleSelectToken(t) {
    setSelectedToken(t);
  }

  function handleBack() {
    setSelectedToken(null);
  }

  return (
    <div className="page">
      <div className="coin-stage">
        <div className="coin">
          <div className="face obverse">
            <span className="coin-glyph">☾</span>
            <div className="sheen"></div>
          </div>
          <div className="face reverse">
            <div className="reverse-content">
              <span className="reverse-word">PCX</span>
              <span className="reverse-rule"></span>
              <span className="reverse-motto">PROVE IT ON CHAIN</span>
            </div>
            <div className="sheen"></div>
          </div>
        </div>
      </div>
      <h1 className="wordmark">PCX Launchpad</h1>
      <p className="tagline">Launch a token whose growth pays its holders — provably, on chain.</p>

      {selectedToken ? (
        <TradeView token={selectedToken} onBack={handleBack} />
      ) : (
        <div>
          <div className="tabs">
            <button className={tab === 'explore' ? 'tab active' : 'tab'} onClick={function () { setTab('explore'); }}>
              Explore
            </button>
            <button className={tab === 'launch' ? 'tab active' : 'tab'} onClick={function () { setTab('launch'); }}>
              Launch
            </button>
          </div>
          {tab === 'explore' ? <ExploreTab onSelect={handleSelectToken} /> : <LaunchTab />}
        </div>
      )}
    </div>
  );
}

export default App;