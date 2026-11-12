/**
 * SEMI·PULSE 高解析度 Canvas 互動金融圖表引擎
 * 支援：K線圖 / 收盤趨勢圖 / MA / 布林通道 / Volume / RSI / MACD / 四象限估值散點圖 / 多股正規化比較圖
 */
window.SemiCharts = (function () {
  const COLORS = {
    up: "#ff4d5a",
    down: "#00d084",
    flat: "#94a3b8",
    grid: "rgba(56, 189, 248, 0.08)",
    axisText: "#64748b",
    crosshair: "rgba(148, 163, 184, 0.55)",
    ma5: "#fbbf24",
    ma20: "#38bdf8",
    ma60: "#a78bfa",
    bbLine: "rgba(129, 140, 248, 0.6)",
    bbFill: "rgba(129, 140, 248, 0.08)",
    areaLine: "#38bdf8",
    rsiLine: "#f472b6",
    difLine: "#38bdf8",
    deaLine: "#fbbf24",
  };

  function setupHiDPI(canvas, heightPx) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = Math.max(300, Math.floor(rect.width - 16));
    const height = heightPx;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  function fmtNum(v, decimals = 2) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    return Number(v).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtVol(v) {
    if (!v) return "0";
    if (v >= 1e8) return (v / 1e8).toFixed(2) + "億";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(v);
  }

  function niceTicks(min, max, count = 5) {
    if (min === max) {
      min = min * 0.98 || -1;
      max = max * 1.02 || 1;
    }
    const span = max - min;
    const stepRaw = span / Math.max(1, count - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(stepRaw)));
    const norm = stepRaw / mag;
    let step = mag;
    if (norm > 5) step = 10 * mag;
    else if (norm > 2.5) step = 5 * mag;
    else if (norm > 1.5) step = 2 * mag;
    const start = Math.floor(min / step) * step;
    const ticks = [];
    for (let t = start; t <= max + step * 0.5; t += step) {
      ticks.push(t);
    }
    return ticks;
  }

  /**
   * 個股主圖 + 副圖渲染
   */
  function renderTerminalChart(canvas, hudEl, stock, fullSeries, opts) {
    if (!canvas || !stock || !stock.history || !stock.history.length) return;

    const rangeDays = { "1M": 22, "3M": 66, "6M": 130, "ALL": stock.history.length }[opts.range] || 66;
    const totalLen = stock.history.length;
    const startIdx = Math.max(0, totalLen - rangeDays);
    const bars = stock.history.slice(startIdx);
    const n = bars.length;

    const sliceArr = (arr) => arr.slice(startIdx);
    const sMa5 = sliceArr(fullSeries.ma5);
    const sMa20 = sliceArr(fullSeries.ma20);
    const sMa60 = sliceArr(fullSeries.ma60);
    const sBbU = sliceArr(fullSeries.bbUpper);
    const sBbL = sliceArr(fullSeries.bbLower);
    const sRsi = sliceArr(fullSeries.rsi14);
    const sDif = sliceArr(fullSeries.dif);
    const sDea = sliceArr(fullSeries.dea);
    const sHist = sliceArr(fullSeries.hist);

    const chartH = window.innerWidth < 640 ? 390 : 450;
    const { ctx, width, height } = setupHiDPI(canvas, chartH);

    const pad = { left: 12, right: 82, top: 14, bottom: 26 };
    const mainTop = pad.top;
    const mainH = Math.floor((height - pad.top - pad.bottom) * 0.67);
    const gapH = 18;
    const subTop = mainTop + mainH + gapH;
    const subH = height - pad.bottom - subTop;
    const plotW = width - pad.left - pad.right;

    // 計算主圖價格上下界
    let minP = Infinity;
    let maxP = -Infinity;
    for (let i = 0; i < n; i++) {
      minP = Math.min(minP, bars[i].l);
      maxP = Math.max(maxP, bars[i].h);
      if (opts.showMa5 && sMa5[i] !== null) { minP = Math.min(minP, sMa5[i]); maxP = Math.max(maxP, sMa5[i]); }
      if (opts.showMa20 && sMa20[i] !== null) { minP = Math.min(minP, sMa20[i]); maxP = Math.max(maxP, sMa20[i]); }
      if (opts.showMa60 && sMa60[i] !== null) { minP = Math.min(minP, sMa60[i]); maxP = Math.max(maxP, sMa60[i]); }
      if (opts.showBB && sBbU[i] !== null && sBbL[i] !== null) {
        minP = Math.min(minP, sBbL[i]);
        maxP = Math.max(maxP, sBbU[i]);
      }
    }
    const pPad = (maxP - minP) * 0.06 || maxP * 0.03 || 1;
    minP -= pPad;
    maxP += pPad;

    const xFor = (i) => pad.left + ((i + 0.5) / n) * plotW;
    const yMain = (p) => mainTop + (1 - (p - minP) / (maxP - minP)) * mainH;

    function updateHud(idx) {
      const i = idx !== null && idx >= 0 && idx < n ? idx : n - 1;
      const b = bars[i];
      const prevC = i > 0 ? bars[i - 1].c : (startIdx > 0 ? stock.history[startIdx - 1].c : b.o);
      const chg = b.c - prevC;
      const pct = prevC ? (chg / prevC) * 100 : 0;
      const cls = chg > 0 ? "up" : chg < 0 ? "down" : "flat";
      const sign = chg > 0 ? "+" : "";
      const decimals = b.c >= 100 ? 2 : 2;
      const parts = [
        `<span class="mono" style="color:#e2e8f0;font-weight:700">${b.d}</span>`,
        `<span>開 <strong class="mono">${fmtNum(b.o, decimals)}</strong></span>`,
        `<span>高 <strong class="mono up">${fmtNum(b.h, decimals)}</strong></span>`,
        `<span>低 <strong class="mono down">${fmtNum(b.l, decimals)}</strong></span>`,
        `<span>收 <strong class="mono ${cls}">${fmtNum(b.c, decimals)} (${sign}${pct.toFixed(2)}%)</strong></span>`,
        `<span>量 <strong class="mono">${fmtVol(b.v)}</strong></span>`,
      ];
      if (opts.showMa5 && sMa5[i] !== null) parts.push(`<span style="color:${COLORS.ma5}">MA5 ${fmtNum(sMa5[i])}</span>`);
      if (opts.showMa20 && sMa20[i] !== null) parts.push(`<span style="color:${COLORS.ma20}">MA20 ${fmtNum(sMa20[i])}</span>`);
      if (opts.showMa60 && sMa60[i] !== null) parts.push(`<span style="color:${COLORS.ma60}">MA60 ${fmtNum(sMa60[i])}</span>`);
      if (opts.subType === "rsi" && sRsi[i] !== null) parts.push(`<span style="color:${COLORS.rsiLine}">RSI(14) ${sRsi[i].toFixed(1)}</span>`);
      if (opts.subType === "macd") {
        parts.push(`<span style="color:${COLORS.difLine}">DIF ${sDif[i].toFixed(2)}</span>`);
        parts.push(`<span style="color:${COLORS.deaLine}">DEA ${sDea[i].toFixed(2)}</span>`);
      }
      hudEl.innerHTML = parts.join("");
    }

    function draw(hoverIdx = null) {
      ctx.clearRect(0, 0, width, height);

      // 主圖格線與 Y 軸刻度
      const priceTicks = niceTicks(minP, maxP, 5);
      ctx.font = "11px 'JetBrains Mono', Consolas, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      for (const t of priceTicks) {
        if (t < minP || t > maxP) continue;
        const y = yMain(t);
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();

        ctx.fillStyle = COLORS.axisText;
        ctx.fillText(t >= 1000 ? Math.round(t).toLocaleString() : t.toFixed(t >= 100 ? 1 : 2), pad.left + plotW + 6, y);
      }

      // 時間軸 X 格線
      const stepX = Math.max(1, Math.floor(n / 6));
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let i = 0; i < n; i += stepX) {
        const x = xFor(i);
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(x, mainTop);
        ctx.lineTo(x, subTop + subH);
        ctx.stroke();
        ctx.fillStyle = COLORS.axisText;
        ctx.fillText(bars[i].d.slice(5), x, subTop + subH + 6);
      }

      // 副圖邊框與分隔標題
      ctx.strokeStyle = "rgba(56, 189, 248, 0.16)";
      ctx.beginPath();
      ctx.moveTo(pad.left, subTop);
      ctx.lineTo(pad.left + plotW, subTop);
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.font = "10.5px 'Inter', 'Noto Sans TC', sans-serif";
      const subLabel = opts.subType === "volume" ? "成交量 (VOLUME)" : opts.subType === "rsi" ? "RSI (14)" : "MACD (12, 26, 9)";
      ctx.fillText(subLabel, pad.left + 4, subTop - 2);

      // 布林通道填充
      if (opts.showBB) {
        ctx.save();
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          if (sBbU[i] === null) continue;
          const x = xFor(i);
          const y = yMain(sBbU[i]);
          if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
        }
        for (let i = n - 1; i >= 0; i--) {
          if (sBbL[i] === null) continue;
          ctx.lineTo(xFor(i), yMain(sBbL[i]));
        }
        ctx.closePath();
        ctx.fillStyle = COLORS.bbFill;
        ctx.fill();

        const drawLine = (arr, color, dash = []) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.setLineDash(dash);
          ctx.beginPath();
          let st = false;
          for (let i = 0; i < n; i++) {
            if (arr[i] === null) continue;
            const x = xFor(i), y = yMain(arr[i]);
            if (!st) { ctx.moveTo(x, y); st = true; } else { ctx.lineTo(x, y); }
          }
          ctx.stroke();
          ctx.setLineDash([]);
        };
        drawLine(sBbU, COLORS.bbLine, [4, 3]);
        drawLine(sBbL, COLORS.bbLine, [4, 3]);
        ctx.restore();
      }

      // 主圖 K 線或趨勢圖
      if (opts.mode === "candle") {
        const candleW = Math.max(2, Math.min(12, (plotW / n) * 0.66));
        for (let i = 0; i < n; i++) {
          const b = bars[i];
          const x = xFor(i);
          const isUp = b.c >= b.o;
          const color = isUp ? COLORS.up : COLORS.down;

          ctx.strokeStyle = color;
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(x, yMain(b.h));
          ctx.lineTo(x, yMain(b.l));
          ctx.stroke();

          const yO = yMain(b.o);
          const yC = yMain(b.c);
          const topY = Math.min(yO, yC);
          const bodyH = Math.max(1.5, Math.abs(yC - yO));
          ctx.fillStyle = color;
          ctx.fillRect(x - candleW / 2, topY, candleW, bodyH);
        }
      } else {
        // 收盤面積圖
        ctx.save();
        const grad = ctx.createLinearGradient(0, mainTop, 0, mainTop + mainH);
        grad.addColorStop(0, "rgba(56, 189, 248, 0.34)");
        grad.addColorStop(1, "rgba(56, 189, 248, 0.01)");

        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = xFor(i), y = yMain(bars[i].c);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = COLORS.areaLine;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.lineTo(xFor(n - 1), mainTop + mainH);
        ctx.lineTo(xFor(0), mainTop + mainH);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
      }

      // 均線疊加
      const drawMA = (arr, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let st = false;
        for (let i = 0; i < n; i++) {
          if (arr[i] === null) continue;
          const x = xFor(i), y = yMain(arr[i]);
          if (!st) { ctx.moveTo(x, y); st = true; } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
      };
      if (opts.showMa5) drawMA(sMa5, COLORS.ma5);
      if (opts.showMa20) drawMA(sMa20, COLORS.ma20);
      if (opts.showMa60) drawMA(sMa60, COLORS.ma60);

      // 副圖繪製
      ctx.font = "10.5px 'JetBrains Mono', Consolas, monospace";
      if (opts.subType === "volume") {
        let maxV = 0;
        for (let i = 0; i < n; i++) maxV = Math.max(maxV, bars[i].v || 0);
        if (maxV <= 0) maxV = 1;
        const barW = Math.max(1.5, Math.min(11, (plotW / n) * 0.65));
        for (let i = 0; i < n; i++) {
          const b = bars[i];
          const prevC = i > 0 ? bars[i - 1].c : b.o;
          const isUp = b.c >= prevC;
          const h = ((b.v || 0) / maxV) * (subH - 4);
          ctx.fillStyle = isUp ? "rgba(255, 77, 90, 0.72)" : "rgba(0, 208, 132, 0.72)";
          ctx.fillRect(xFor(i) - barW / 2, subTop + subH - h, barW, h);
        }
        ctx.fillStyle = COLORS.axisText;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(fmtVol(maxV), pad.left + plotW + 6, subTop + 8);
      } else if (opts.subType === "rsi") {
        const yRsi = (val) => subTop + (1 - val / 100) * subH;
        // 超買/超賣參考線 70 & 30
        [70, 50, 30].forEach((lvl) => {
          const y = yRsi(lvl);
          ctx.strokeStyle = lvl === 50 ? "rgba(148,163,184,0.16)" : "rgba(244,114,182,0.28)";
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(pad.left + plotW, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = COLORS.axisText;
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(String(lvl), pad.left + plotW + 6, y);
        });
        ctx.strokeStyle = COLORS.rsiLine;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let st = false;
        for (let i = 0; i < n; i++) {
          if (sRsi[i] === null) continue;
          const x = xFor(i), y = yRsi(sRsi[i]);
          if (!st) { ctx.moveTo(x, y); st = true; } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
      } else if (opts.subType === "macd") {
        let maxAbs = 0.01;
        for (let i = 0; i < n; i++) {
          maxAbs = Math.max(maxAbs, Math.abs(sDif[i]), Math.abs(sDea[i]), Math.abs(sHist[i]));
        }
        maxAbs *= 1.12;
        const yMacd = (v) => subTop + (0.5 - v / (2 * maxAbs)) * subH;
        const zeroY = yMacd(0);
        ctx.strokeStyle = "rgba(148,163,184,0.22)";
        ctx.beginPath();
        ctx.moveTo(pad.left, zeroY);
        ctx.lineTo(pad.left + plotW, zeroY);
        ctx.stroke();

        const barW = Math.max(1.5, Math.min(10, (plotW / n) * 0.6));
        for (let i = 0; i < n; i++) {
          const hv = sHist[i];
          const yv = yMacd(hv);
          ctx.fillStyle = hv >= 0 ? "rgba(255, 77, 90, 0.72)" : "rgba(0, 208, 132, 0.72)";
          ctx.fillRect(xFor(i) - barW / 2, Math.min(zeroY, yv), barW, Math.max(1, Math.abs(yv - zeroY)));
        }

        const drawM = (arr, color) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const x = xFor(i), y = yMacd(arr[i]);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        };
        drawM(sDif, COLORS.difLine);
        drawM(sDea, COLORS.deaLine);

        ctx.fillStyle = COLORS.axisText;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(maxAbs.toFixed(1), pad.left + plotW + 6, subTop + 8);
        ctx.fillText("-" + maxAbs.toFixed(1), pad.left + plotW + 6, subTop + subH - 8);
      }

      // 十字游標與右側最新價格標籤
      const activeIdx = hoverIdx !== null ? hoverIdx : n - 1;
      const activeClose = bars[activeIdx].c;
      const yPrice = yMain(activeClose);

      if (hoverIdx !== null) {
        const hx = xFor(hoverIdx);
        ctx.save();
        ctx.strokeStyle = COLORS.crosshair;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx, mainTop);
        ctx.lineTo(hx, subTop + subH);
        ctx.moveTo(pad.left, yPrice);
        ctx.lineTo(pad.left + plotW, yPrice);
        ctx.stroke();
        ctx.restore();
      }

      // 右側價格膠囊
      const pillY = Math.max(mainTop + 8, Math.min(mainTop + mainH - 8, yPrice));
      const pText = activeClose >= 10000 ? Math.round(activeClose).toLocaleString("en-US") : activeClose.toFixed(2);
      ctx.fillStyle = hoverIdx !== null ? "#0284c7" : (bars[n - 1].c >= bars[Math.max(0, n - 2)].c ? COLORS.up : COLORS.down);
      ctx.fillRect(pad.left + plotW + 2, pillY - 9, 76, 18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10.5px 'JetBrains Mono', Consolas, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(pText, pad.left + plotW + 6, pillY);

      updateHud(hoverIdx);
    }

    draw(null);

    const handlePointer = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const rel = (x - pad.left) / plotW;
      if (rel < 0 || rel > 1) {
        draw(null);
        return;
      }
      const idx = Math.max(0, Math.min(n - 1, Math.floor(rel * n)));
      draw(idx);
    };

    canvas.onmousemove = (e) => handlePointer(e.clientX);
    canvas.onmouseleave = () => draw(null);
    canvas.ontouchmove = (e) => {
      if (e.touches && e.touches[0]) handlePointer(e.touches[0].clientX);
    };
    canvas.ontouchend = () => draw(null);
  }

  /**
   * 供應鏈本益比 vs 20日漲跌幅四象限散點圖
   */
  function renderScatterChart(canvas, infoEl, stocks, onSelectStock) {
    if (!canvas) return;
    const valid = stocks.filter(
      (s) =>
        !s.is_index &&
        s.fundamentals &&
        s.fundamentals.pe !== null &&
        s.fundamentals.pe > 0 &&
        s.fundamentals.pe <= 120 &&
        s.metrics &&
        s.metrics.ret_20d !== null
    );

    const { ctx, width, height } = setupHiDPI(canvas, 340);
    ctx.clearRect(0, 0, width, height);

    if (!valid.length) return;

    const pad = { left: 52, right: 24, top: 24, bottom: 42 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const pes = valid.map((s) => s.fundamentals.pe);
    const rets = valid.map((s) => s.metrics.ret_20d);

    const minPe = Math.max(0, Math.floor(Math.min(...pes) * 0.85));
    const maxPe = Math.ceil(Math.max(...pes) * 1.1);
    const minRet = Math.floor(Math.min(-5, Math.min(...rets) - 4));
    const maxRet = Math.ceil(Math.max(5, Math.max(...rets) + 4));

    const avgPe = pes.reduce((a, b) => a + b, 0) / pes.length;
    const xFor = (pe) => pad.left + ((pe - minPe) / (maxPe - minPe)) * plotW;
    const yFor = (r) => pad.top + (1 - (r - minRet) / (maxRet - minRet)) * plotH;

    // 格線
    ctx.font = "11px 'JetBrains Mono', Consolas, monospace";
    for (const t of niceTicks(minRet, maxRet, 5)) {
      if (t < minRet || t > maxRet) continue;
      const y = yFor(t);
      ctx.strokeStyle = Math.abs(t) < 0.01 ? "rgba(148,163,184,0.38)" : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillStyle = COLORS.axisText;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(t.toFixed(0) + "%", pad.left - 8, y);
    }

    for (const t of niceTicks(minPe, maxPe, 5)) {
      if (t < minPe || t > maxPe) continue;
      const x = xFor(t);
      ctx.strokeStyle = COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotH);
      ctx.stroke();
      ctx.fillStyle = COLORS.axisText;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(t.toFixed(0) + "x", x, pad.top + plotH + 8);
    }

    // 平均 PE 垂直基準線
    const avgX = xFor(avgPe);
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(avgX, pad.top);
    ctx.lineTo(avgX, pad.top + plotH);
    ctx.stroke();
    ctx.restore();

    // 四象限提示字樣
    ctx.font = "11px 'Inter', 'Noto Sans TC', sans-serif";
    ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
    ctx.textAlign = "left";
    ctx.fillText("低估高動能區", pad.left + 8, pad.top + 14);
    ctx.textAlign = "right";
    ctx.fillText("高估值強勢區", pad.left + plotW - 8, pad.top + 14);

    // 軸標籤
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText(`本益比 P/E（平均 ${avgPe.toFixed(1)}x，>120x 未納入縮放）`, pad.left + plotW / 2, height - 14);

    const mktColor = { TW: "#38bdf8", US: "#a78bfa", JP: "#f472b6", KR: "#fbbf24" };
    const points = valid.map((s) => ({
      stock: s,
      x: xFor(s.fundamentals.pe),
      y: yFor(s.metrics.ret_20d),
      r: s.market === "TW" ? 7.5 : 8.5,
      color: mktColor[s.market] || "#a78bfa",
    }));

    function drawPoints(activePt = null) {
      points.forEach((pt) => {
        const isHot = activePt && activePt.stock.id === pt.stock.id;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isHot ? pt.r + 3 : pt.r, 0, Math.PI * 2);
        ctx.fillStyle = pt.stock.metrics.ret_20d >= 0 ? "rgba(255, 77, 90, 0.78)" : "rgba(0, 208, 132, 0.78)";
        ctx.fill();
        ctx.lineWidth = isHot ? 2.5 : 1.5;
        ctx.strokeStyle = isHot ? "#ffffff" : pt.color;
        ctx.stroke();

        ctx.fillStyle = isHot ? "#ffffff" : "#cbd5e1";
        ctx.font = (isHot ? "bold " : "") + "11px 'Inter', 'Noto Sans TC', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(pt.stock.name.split(" ")[0], pt.x, pt.y - pt.r - 3);
      });
    }

    drawPoints(null);

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let nearest = null;
      let bestDist = 24;
      for (const pt of points) {
        const d = Math.hypot(pt.x - mx, pt.y - my);
        if (d < bestDist) {
          bestDist = d;
          nearest = pt;
        }
      }
      if (nearest) {
        const s = nearest.stock;
        const retCls = s.metrics.ret_20d >= 0 ? "up" : "down";
        infoEl.innerHTML = `<strong>${s.id} ${s.name}</strong> ｜ P/E <span class="mono">${s.fundamentals.pe}x</span> ｜ P/B <span class="mono">${s.fundamentals.pb ?? "—"}</span> ｜ 20日報酬 <span class="mono ${retCls}">${s.metrics.ret_20d >= 0 ? "+" : ""}${s.metrics.ret_20d}%</span>（點擊跳轉個股技術分析）`;
        canvas.style.cursor = "pointer";
      } else {
        infoEl.textContent = "將滑鼠移至圓點檢視估值明細（青藍＝台股、紫色＝美股、粉紅＝日股、金色＝韓股）";
        canvas.style.cursor = "default";
      }
    };

    canvas.onclick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      for (const pt of points) {
        if (Math.hypot(pt.x - mx, pt.y - my) < 20) {
          onSelectStock(pt.stock.id);
          break;
        }
      }
    };
  }

  /**
   * 多股正規化報酬率 (%) 比較疊圖
   */
  function renderCompareChart(canvas, hudEl, selectedStocks, rangeKey, palette) {
    if (!canvas) return;
    const { ctx, width, height } = setupHiDPI(canvas, 370);
    ctx.clearRect(0, 0, width, height);

    if (!selectedStocks.length) {
      hudEl.innerHTML = `<span style="color:#94a3b8">請至少勾選 1 檔標的進行走勢比較</span>`;
      return;
    }

    const days = { "1M": 22, "3M": 66, "6M": 130, "ALL": 260 }[rangeKey] || 66;

    // 彙整所有日期聯集並取最近 N 日
    const dateSet = new Set();
    selectedStocks.forEach((s) => s.history.forEach((h) => dateSet.add(h.d)));
    const allDates = Array.from(dateSet).sort();
    const dates = allDates.slice(Math.max(0, allDates.length - days));
    if (dates.length < 2) return;

    // 為每檔標的對齊日期並計算累積報酬率 %
    const lines = selectedStocks.map((s, idx) => {
      const map = new Map(s.history.map((h) => [h.d, h.c]));
      let lastKnown = null;
      // 找起始日前最後已知收盤
      for (const h of s.history) {
        if (h.d <= dates[0]) lastKnown = h.c;
      }
      const rawCloses = dates.map((d) => {
        if (map.has(d)) lastKnown = map.get(d);
        return lastKnown;
      });
      const base = rawCloses.find((v) => v !== null && v > 0) || 1;
      const pcts = rawCloses.map((v) => (v !== null ? ((v - base) / base) * 100 : null));
      return {
        stock: s,
        color: palette[idx % palette.length],
        pcts,
      };
    });

    let minR = 0;
    let maxR = 0;
    lines.forEach((ln) => {
      ln.pcts.forEach((v) => {
        if (v !== null) {
          minR = Math.min(minR, v);
          maxR = Math.max(maxR, v);
        }
      });
    });
    const rPad = (maxR - minR) * 0.1 || 5;
    minR -= rPad;
    maxR += rPad;

    const pad = { left: 14, right: 62, top: 16, bottom: 28 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const n = dates.length;

    const xFor = (i) => pad.left + (i / Math.max(1, n - 1)) * plotW;
    const yFor = (v) => pad.top + (1 - (v - minR) / (maxR - minR)) * plotH;

    const updateCompareHud = (idx) => {
      const i = idx !== null ? idx : n - 1;
      const items = lines.map((ln) => {
        const val = ln.pcts[i];
        const txt = val !== null ? `${val >= 0 ? "+" : ""}${val.toFixed(2)}%` : "—";
        return `<span style="color:${ln.color};font-weight:700">${ln.stock.id} ${ln.stock.name.split(" ")[0]} <span class="mono">${txt}</span></span>`;
      });
      hudEl.innerHTML = `<span class="mono" style="color:#e2e8f0;font-weight:700">${dates[i]}</span>` + items.join("");
    };

    const draw = (hoverIdx = null) => {
      ctx.clearRect(0, 0, width, height);

      ctx.font = "11px 'JetBrains Mono', Consolas, monospace";
      for (const t of niceTicks(minR, maxR, 5)) {
        if (t < minR || t > maxR) continue;
        const y = yFor(t);
        ctx.strokeStyle = Math.abs(t) < 0.01 ? "rgba(148,163,184,0.4)" : COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();

        ctx.fillStyle = COLORS.axisText;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText((t >= 0 ? "+" : "") + t.toFixed(0) + "%", pad.left + plotW + 6, y);
      }

      const stepX = Math.max(1, Math.floor(n / 6));
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let i = 0; i < n; i += stepX) {
        const x = xFor(i);
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + plotH);
        ctx.stroke();
        ctx.fillStyle = COLORS.axisText;
        ctx.fillText(dates[i].slice(5), x, pad.top + plotH + 8);
      }

      lines.forEach((ln) => {
        ctx.strokeStyle = ln.color;
        ctx.lineWidth = 2.1;
        ctx.beginPath();
        let st = false;
        for (let i = 0; i < n; i++) {
          if (ln.pcts[i] === null) continue;
          const x = xFor(i), y = yFor(ln.pcts[i]);
          if (!st) { ctx.moveTo(x, y); st = true; } else { ctx.lineTo(x, y); }
        }
        ctx.stroke();
      });

      if (hoverIdx !== null) {
        const hx = xFor(hoverIdx);
        ctx.save();
        ctx.strokeStyle = COLORS.crosshair;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hx, pad.top);
        ctx.lineTo(hx, pad.top + plotH);
        ctx.stroke();
        ctx.restore();

        lines.forEach((ln) => {
          const val = ln.pcts[hoverIdx];
          if (val === null) return;
          ctx.beginPath();
          ctx.arc(hx, yFor(val), 4, 0, Math.PI * 2);
          ctx.fillStyle = ln.color;
          ctx.fill();
        });
      }

      updateCompareHud(hoverIdx);
    };

    draw(null);

    const handleX = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      const rel = (clientX - rect.left - pad.left) / plotW;
      if (rel < 0 || rel > 1) { draw(null); return; }
      const idx = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
      draw(idx);
    };

    canvas.onmousemove = (e) => handleX(e.clientX);
    canvas.onmouseleave = () => draw(null);
    canvas.ontouchmove = (e) => {
      if (e.touches && e.touches[0]) handleX(e.touches[0].clientX);
    };
    canvas.ontouchend = () => draw(null);
  }

  return {
    renderTerminalChart,
    renderScatterChart,
    renderCompareChart,
  };
})();
