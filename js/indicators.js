/**
 * SEMI·PULSE 技術指標計算模組
 * 與 scripts/fetch_stocks.py 採用一致之計算口徑 (SMA / EMA / MACD / Wilder RSI / 布林通道)
 */
window.SemiIndicators = (function () {
  function sma(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function ema(values, period) {
    if (!values.length) return [];
    const k = 2 / (period + 1);
    const out = [values[0]];
    for (let i = 1; i < values.length; i++) {
      out.push(values[i] * k + out[i - 1] * (1 - k));
    }
    return out;
  }

  function bollinger(closes, period = 20, mult = 2) {
    const mid = sma(closes, period);
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      const m = mid[i];
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const d = closes[j] - m;
        sumSq += d * d;
      }
      const std = Math.sqrt(sumSq / period);
      upper[i] = m + mult * std;
      lower[i] = m - mult * std;
    }
    return { mid, upper, lower };
  }

  function macd(closes, fast = 12, slow = 26, signal = 9) {
    const emaFast = ema(closes, fast);
    const emaSlow = ema(closes, slow);
    const dif = closes.map((_, i) => emaFast[i] - emaSlow[i]);
    const dea = ema(dif, signal);
    const hist = dif.map((d, i) => d - dea[i]);
    return { dif, dea, hist };
  }

  function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;

    let gainSum = 0;
    let lossSum = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gainSum += diff;
      else lossSum += -diff;
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;

    const calc = (ag, al) => {
      if (al === 0) return ag > 0 ? 100 : 50;
      return 100 - 100 / (1 + ag / al);
    };

    out[period] = calc(avgGain, avgLoss);
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const g = diff > 0 ? diff : 0;
      const l = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      out[i] = calc(avgGain, avgLoss);
    }
    return out;
  }

  function computeSeries(history) {
    const closes = history.map((r) => r.c);
    const ma5 = sma(closes, 5);
    const ma20 = sma(closes, 20);
    const ma60 = sma(closes, 60);
    const ma200 = sma(closes, 200);
    const bb = bollinger(closes, 20, 2);
    const rsi14 = rsi(closes, 14);
    const macdObj = macd(closes, 12, 26, 9);
    return {
      ma5,
      ma20,
      ma60,
      ma200,
      bbUpper: bb.upper,
      bbLower: bb.lower,
      rsi14,
      dif: macdObj.dif,
      dea: macdObj.dea,
      hist: macdObj.hist,
    };
  }

  function generateDiagnostics(stock, series) {
    const history = stock.history || [];
    const n = history.length;
    if (n < 2) return [];

    const i = n - 1;
    const c = history[i].c;
    const m5 = series.ma5[i];
    const m20 = series.ma20[i];
    const m60 = series.ma60[i];
    const m200 = series.ma200 ? series.ma200[i] : null;
    const rsiVal = series.rsi14[i];
    const histVal = series.hist[i];
    const prevHist = series.hist[i - 1];
    const signals = [];

    if (m5 !== null && m20 !== null && m60 !== null) {
      if (c > m5 && m5 > m20 && m20 > m60) {
        signals.push({ type: "bull", label: "均線呈現多頭排列（收盤價 > MA5 > MA20 > MA60）" });
      } else if (c < m5 && m5 < m20 && m20 < m60) {
        signals.push({ type: "bear", label: "均線呈現空頭排列（收盤價 < MA5 < MA20 < MA60）" });
      } else if (c >= m20 && c >= m60) {
        signals.push({ type: "bull", label: "股價站穩月線 MA20 與季線 MA60 之上" });
      } else if (c < m20 && c < m60) {
        signals.push({ type: "bear", label: "股價位於月線 MA20 與季線 MA60 之下，留意壓力" });
      } else {
        signals.push({ type: "neutral", label: "股價於月季線之間震盪整理" });
      }
    }

    if (i >= 1 && series.ma5[i - 1] !== null && series.ma20[i - 1] !== null && m5 !== null && m20 !== null) {
      if (series.ma5[i - 1] <= series.ma20[i - 1] && m5 > m20) {
        signals.push({ type: "bull", label: "MA5 向上穿過 MA20（短中期黃金交叉）" });
      } else if (series.ma5[i - 1] >= series.ma20[i - 1] && m5 < m20) {
        signals.push({ type: "bear", label: "MA5 向下跌破 MA20（短中期死亡交叉）" });
      }
    }

    if (rsiVal !== null) {
      const rTxt = rsiVal.toFixed(1);
      if (rsiVal >= 70) {
        signals.push({ type: "warn", label: `RSI(14) = ${rTxt}，進入高檔超買警戒區` });
      } else if (rsiVal <= 30) {
        signals.push({ type: "warn", label: `RSI(14) = ${rTxt}，進入超賣區（觀察止跌反彈）` });
      } else if (rsiVal >= 55) {
        signals.push({ type: "bull", label: `RSI(14) = ${rTxt}，短線動能偏多` });
      } else if (rsiVal <= 45) {
        signals.push({ type: "bear", label: `RSI(14) = ${rTxt}，短線動能偏弱` });
      } else {
        signals.push({ type: "neutral", label: `RSI(14) = ${rTxt}，處於多空中性區間` });
      }
    }

    if (prevHist <= 0 && histVal > 0) {
      signals.push({ type: "bull", label: "MACD 柱狀體由負翻正（多方動能轉強）" });
    } else if (prevHist >= 0 && histVal < 0) {
      signals.push({ type: "bear", label: "MACD 柱狀體由正翻負（短線動能轉弱）" });
    } else if (histVal > 0) {
      signals.push({ type: "bull", label: "MACD DIF 位於訊號線 DEA 上方，維持多方結構" });
    } else {
      signals.push({ type: "bear", label: "MACD DIF 位於訊號線 DEA 下方，屬偏弱整理" });
    }

    if (series.bbUpper[i] !== null && series.bbLower[i] !== null) {
      if (c >= series.bbUpper[i] * 0.995) {
        signals.push({ type: "warn", label: "股價觸及布林通道上軌，乖離擴大" });
      } else if (c <= series.bbLower[i] * 1.005) {
        signals.push({ type: "warn", label: "股價觸及布林通道下軌，關注支撐力道" });
      }
    }

    if (m200 !== null) {
      const b200 = (((c - m200) / m200) * 100).toFixed(1);
      if (c >= m200) {
        signals.push({ type: "bull", label: `站穩年線 MA200 之上（年線乖離 +${b200}%）` });
      } else {
        signals.push({ type: "bear", label: `位於年線 MA200 之下（年線乖離 ${b200}%），長線仍待築底` });
      }
    }

    if (stock.metrics && stock.metrics.vs_sox_1m !== null && stock.metrics.vs_sox_1m !== undefined) {
      const v1m = stock.metrics.vs_sox_1m;
      if (v1m >= 5) {
        signals.push({ type: "bull", label: `近 1 月相對費半 ^SOX 強勢超額 +${v1m.toFixed(1)} 個百分點` });
      } else if (v1m <= -5) {
        signals.push({ type: "bear", label: `近 1 月相對費半 ^SOX 落後 ${v1m.toFixed(1)} 個百分點` });
      }
    }

    return signals;
  }

  return {
    sma,
    ema,
    bollinger,
    macd,
    rsi,
    computeSeries,
    generateDiagnostics,
  };
})();
