import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';

function PriceChart(props) {
  var pairAddress = props.pairAddress;
  const containerRef = useRef(null);
  const [ohlc, setOhlc] = useState(null);

  useEffect(function () {
    if (!pairAddress || !containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 320,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.6)',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)' },
      crosshair: { mode: 0 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ffffff',
      downColor: '#3a3a3d',
      borderUpColor: '#ffffff',
      borderDownColor: '#5a5a5d',
      wickUpColor: '#ffffff',
      wickDownColor: '#5a5a5d',
      priceScaleId: 'right',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    chart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.22 },
    });

    let latestCandles = [];

    async function loadData() {
      try {
        const res = await fetch(
          'https://api.geckoterminal.com/api/v2/networks/robinhood/pools/' + pairAddress + '/ohlcv/hour?aggregate=1&limit=100&currency=usd'
        );
        const data = await res.json();
        const list = data.data.attributes.ohlcv_list;

        const candles = list
          .map(function (c) {
            return { time: c[0], open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] };
          })
          .sort(function (a, b) { return a.time - b.time; });

        latestCandles = candles;

        candleSeries.setData(candles.map(function (c) {
          return { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close };
        }));

        volumeSeries.setData(candles.map(function (c) {
          return {
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(255,255,255,0.3)' : 'rgba(90,90,93,0.5)',
          };
        }));

        chart.timeScale().fitContent();

        if (candles.length > 0) {
          setOhlc(candles[candles.length - 1]);
        }
      } catch (err) {
        console.error('OHLCV fetch failed:', err);
      }
    }
    loadData();

    function handleCrosshairMove(param) {
      if (!param.time) {
        if (latestCandles.length > 0) setOhlc(latestCandles[latestCandles.length - 1]);
        return;
      }
      const match = latestCandles.find(function (c) { return c.time === param.time; });
      if (match) setOhlc(match);
    }
    chart.subscribeCrosshairMove(handleCrosshairMove);

    function handleResize() {
      chart.applyOptions({ width: containerRef.current.clientWidth });
    }
    window.addEventListener('resize', handleResize);

    return function cleanup() {
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
    };
  }, [pairAddress]);

  return (
    <div>
      {ohlc ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
          <span style={{ color: 'rgba(255,255,255,0.42)' }}>O</span> {ohlc.open.toFixed(6)}{'  '}
          <span style={{ color: 'rgba(255,255,255,0.42)' }}>H</span> {ohlc.high.toFixed(6)}{'  '}
          <span style={{ color: 'rgba(255,255,255,0.42)' }}>L</span> {ohlc.low.toFixed(6)}{'  '}
          <span style={{ color: 'rgba(255,255,255,0.42)' }}>C</span> {ohlc.close.toFixed(6)}
        </div>
      ) : null}
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  );
}

export default PriceChart;