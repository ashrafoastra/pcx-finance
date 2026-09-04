import { useState } from 'react';
import './App.css';

function App() {
  const [wallet, setWallet] = useState('');
  const [tokens, setTokens] = useState([]);
  const [totalUsd, setTotalUsd] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function fetchPortfolio() {
    if (!wallet) return;
    setLoading(true);
    setError('');
    setTokens([]);
    setTotalUsd(0);

    try {
      const res = await fetch(`https://wholesome-smile-production-6536.up.railway.app/api/portfolio/${wallet}`);
      const data = await res.json();
      setTokens(data.tokens || []);
      setTotalUsd(data.totalUsd || 0);
    } catch (err) {
      setError('Could not fetch portfolio. Check the address and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '60px auto', fontFamily: 'sans-serif' }}>
      <h1>PCX Finance</h1>
      <p style={{ color: '#666' }}>prove it on chain.</p>

      <input
        type="text"
        placeholder="Enter wallet address"
        value={wallet}
        onChange={(e) => setWallet(e.target.value)}
        style={{ width: '100%', padding: 10, fontSize: 14, marginBottom: 10 }}
      />
      <button onClick={fetchPortfolio} style={{ padding: '10px 20px', cursor: 'pointer' }}>
        {loading ? 'Loading...' : 'View Portfolio'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {tokens.length > 0 && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: '#111',
            color: '#fff',
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.7 }}>Total Portfolio Value</div>
          <div style={{ fontSize: 32, fontWeight: 'bold' }}>
            ${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        {tokens.map((t) => (
          <div
            key={t.contract}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <div>
              <strong>{t.symbol}</strong>
              <div style={{ fontSize: 13, color: '#888' }}>{t.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 'bold' }}>
                ${t.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 12, color: '#888' }}>@ ${t.price.toFixed(6)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;