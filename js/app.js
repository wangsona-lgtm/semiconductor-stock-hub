/**
 * SEMI·PULSE 半導體股票分析終端主程式
 */
(function () {
  const WATCHLIST_KEY = "semi_pulse_watchlist_v1";
  const COMPARE_PALETTE = ["#38bdf8", "#ff4d5a", "#fbbf24", "#00d084", "#a78bfa", "#fb7185"];

  const state = {
    data: null,
    stocksById: new Map(),
    seriesCache: new Map(),
    activeTab: "terminal",
    selectedId: "2330",
    sidebarSegment: "all",
    tableSegment: "all",
    peerSegment: "all",
    searchQuery: "",
    watchlist: new Set(),
    chartOpts: {
      mode: "candle",
      range: "3M",
      subType: "volume",
      showMa5: true,
      showMa20: true,
      showMa60: true,
      showMa200: true,
      showBB: false,
    },
    tableSort: { key: "ret_20d", dir: "desc" },
    peerSort: { key: "gm", dir: "desc" },
    compareIds: ["2330", "TSM", "NVDA", "2454"],
    compareRange: "3M",
  };

  function loadWatchlist() {
    try {
      const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "null");
      if (Array.isArray(saved) && saved.length) {
        state.watchlist = new Set(saved);
        return;
      }
    } catch (_) {}
    state.watchlist = new Set(["2330", "2454", "3661", "3711", "NVDA", "TSM"]);
  }

  function saveWatchlist() {
    try {
      localStorage.setItem(WATCHLIST_KEY, JSON.stringify(Array.from(state.watchlist)));
    } catch (_) {}
  }

  function toggleWatchlist(id, e) {
    if (e) e.stopPropagation();
    if (state.watchlist.has(id)) state.watchlist.delete(id);
    else state.watchlist.add(id);
    saveWatchlist();
    renderAll();
  }

  function fmtPrice(v, stock) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const num = Number(v);
    if (stock && (stock.currency === "JPY" || stock.currency === "KRW")) {
      return Math.round(num).toLocaleString("en-US");
    }
    if (stock && stock.currency === "TWD") {
      return num >= 1000 ? num.toLocaleString("en-US", { maximumFractionDigits: 2 }) : num.toFixed(num % 1 === 0 ? 1 : 2);
    }
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtPct(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const n = Number(v);
    return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  }

  function chgClass(v) {
    if (v === null || v === undefined) return "flat";
    if (v > 0) return "up";
    if (v < 0) return "down";
    return "flat";
  }

  function badgeClass(v) {
    if (v === null || v === undefined) return "badge-flat";
    if (v > 0) return "badge-up";
    if (v < 0) return "badge-down";
    return "badge-flat";
  }

  function fmtVol(v, stock) {
    if (!v) return "—";
    if (stock && stock.market === "TW") {
      const lots = Math.round(v / 1000);
      return lots.toLocaleString("en-US") + " 張";
    }
    if (v >= 1e8) return (v / 1e8).toFixed(2) + "億";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(v);
  }

  function fmtMcap(v, stock) {
    if (!v) return "—";
    if (stock && stock.currency === "USD") {
      if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
      return "$" + (v / 1e9).toFixed(1) + "B";
    }
    if (stock && stock.currency === "JPY") {
      return "¥" + (v / 1e12).toFixed(2) + "兆";
    }
    if (stock && stock.currency === "KRW") {
      return "₩" + (v / 1e12).toFixed(1) + "兆";
    }
    if (v >= 1e12) return (v / 1e12).toFixed(2) + "兆";
    return (v / 1e8).toFixed(0) + "億";
  }

  function getSeries(stock) {
    if (!state.seriesCache.has(stock.id)) {
      state.seriesCache.set(stock.id, window.SemiIndicators.computeSeries(stock.history || []));
    }
    return state.seriesCache.get(stock.id);
  }

  async function loadData() {
    let payload = null;
    try {
      const resp = await fetch("./data/stocks.json?t=" + Date.now(), { cache: "no-store" });
      if (resp.ok) payload = await resp.json();
    } catch (_) {}

    if (!payload && window.__SEMI_STOCKS_DATA__) {
      payload = window.__SEMI_STOCKS_DATA__;
    }
    if (!payload || !Array.isArray(payload.stocks) || !payload.stocks.length) {
      throw new Error("找不到股票行情資料 (data/stocks.json)");
    }

    state.data = payload;
    state.stocksById = new Map(payload.stocks.map((s) => [s.id, s]));
    if (!state.stocksById.has(state.selectedId)) {
      state.selectedId = payload.stocks[0].id;
    }
  }

  function selectStock(id, switchToTerminal = false) {
    if (!state.stocksById.has(id)) return;
    state.selectedId = id;
    if (switchToTerminal) {
      switchTab("terminal");
    } else {
      renderTickerStrip();
      renderSidebar();
      renderTerminal();
    }
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === "tab-" + tabId);
    });

    if (tabId === "terminal") renderTerminal();
    if (tabId === "supply") renderSupplyTab();
    if (tabId === "financials") renderFinancialsTab();
    if (tabId === "compare") renderCompareTab();
    if (tabId === "pipeline") renderPipelineTab();
  }

  function renderHeaderMeta() {
    const el = document.getElementById("dataDateLabel");
    if (!el || !state.data) return;
    const twD = state.data.data_date_tw || "—";
    const usD = state.data.data_date_us || "—";
    const jkD = state.data.data_date_jp || state.data.data_date_kr || "";
    let genTime = "";
    if (state.data.generated_at) {
      const m = String(state.data.generated_at).match(/T(\d{2}:\d{2})/);
      if (m) genTime = ` ｜ 更新 ${m[1]}`;
    }
    el.textContent = `台 ${twD} ｜ 美 ${usD}${jkD ? ` ｜ 日韓 ${jkD}` : ""}${genTime}`;
  }

  function renderTickerStrip() {
    const el = document.getElementById("tickerStrip");
    if (!el) return;
    const featuredIds = ["^SOX", "2330", "NVDA", "TSM", "INTC", "8035.T", "6857.T", "005930.KS", "000660.KS", "2454", "3661", "3711", "ASML", "AVGO"];
    const items = featuredIds.map((id) => state.stocksById.get(id)).filter(Boolean);
    el.innerHTML = items
      .map((s) => {
        const active = s.id === state.selectedId ? "active" : "";
        const pct = s.latest.change_pct;
        return `
          <div class="ticker-chip ${active}" data-id="${s.id}">
            <div>
              <div class="ticker-chip-name">${s.name.split(" ")[0]}</div>
              <div class="ticker-chip-id mono">${s.id}</div>
            </div>
            <div class="ticker-chip-price mono">${fmtPrice(s.latest.close, s)}</div>
            <div class="ticker-chip-pct mono ${badgeClass(pct)}">${fmtPct(pct)}</div>
          </div>
        `;
      })
      .join("");

    el.querySelectorAll(".ticker-chip").forEach((chip) => {
      chip.addEventListener("click", () => selectStock(chip.dataset.id, true));
    });
  }

  function renderKpis() {
    const el = document.getElementById("kpiGrid");
    if (!el || !state.data) return;
    const stocks = state.data.stocks.filter((s) => !s.is_index);
    const twStocks = stocks.filter((s) => s.market === "TW");
    const sox = state.stocksById.get("^SOX");
    const tsmc = state.stocksById.get("2330");

    const upCount = stocks.filter((s) => s.latest.change_pct > 0).length;
    const bullMaCount = stocks.filter((s) => s.metrics.ma20 && s.latest.close >= s.metrics.ma20).length;
    const best20d = [...stocks]
      .filter((s) => s.metrics.ret_20d !== null)
      .sort((a, b) => b.metrics.ret_20d - a.metrics.ret_20d)[0];

    const twValidPe = twStocks.filter((s) => s.fundamentals.pe && s.fundamentals.pe < 120);
    const avgTwPe = twValidPe.length
      ? (twValidPe.reduce((acc, s) => acc + s.fundamentals.pe, 0) / twValidPe.length).toFixed(1)
      : "—";

    el.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label"><span>台積電 (2330) 領航指標</span><span class="mono">TWSE</span></div>
        <div class="kpi-value mono ${tsmc ? chgClass(tsmc.latest.change_pct) : ""}">
          ${tsmc ? fmtPrice(tsmc.latest.close, tsmc) + " TWD" : "—"}
        </div>
        <div class="kpi-sub">單日 <span class="mono ${tsmc ? chgClass(tsmc.latest.change_pct) : ""}">${tsmc ? fmtPct(tsmc.latest.change_pct) : "—"}</span> ｜ P/E <span class="mono">${tsmc?.fundamentals.pe ?? "—"}x</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>費城半導體指數 (^SOX)</span><span class="mono">US INDEX</span></div>
        <div class="kpi-value mono ${sox ? chgClass(sox.latest.change_pct) : ""}">
          ${sox ? fmtPrice(sox.latest.close, sox) : "—"}
        </div>
        <div class="kpi-sub">單日 <span class="mono ${sox ? chgClass(sox.latest.change_pct) : ""}">${sox ? fmtPct(sox.latest.change_pct) : "—"}</span> ｜ 20日 <span class="mono ${sox ? chgClass(sox.metrics.ret_20d) : ""}">${sox ? fmtPct(sox.metrics.ret_20d) : "—"}</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>半導體族群多空溫度計</span><span class="mono">${stocks.length} 檔個股</span></div>
        <div class="kpi-value mono">${upCount} 漲 / ${stocks.length - upCount} 跌</div>
        <div class="kpi-sub">站上月線 MA20：<span class="mono" style="color:var(--cyan)">${bullMaCount} / ${stocks.length} 檔</span></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label"><span>近 20 日最強勢領漲股</span><span class="mono">台股平均 PE ${avgTwPe}x</span></div>
        <div class="kpi-value ${best20d ? chgClass(best20d.metrics.ret_20d) : ""}">
          ${best20d ? `${best20d.name.split(" ")[0]} <span class="mono">${fmtPct(best20d.metrics.ret_20d)}</span>` : "—"}
        </div>
        <div class="kpi-sub">${best20d ? `${best20d.id} ｜ ${best20d.segment_label}` : "—"}</div>
      </div>
    `;
  }

  function renderSidebarFilters() {
    const el = document.getElementById("sidebarFilters");
    if (!el || !state.data) return;
    const pills = [
      { id: "all", label: "全部" },
      { id: "watchlist", label: "★ 自選" },
      ...state.data.segments.map((s) => ({ id: s.id, label: s.label })),
    ];
    el.innerHTML = pills
      .map(
        (p) =>
          `<button class="seg-pill ${state.sidebarSegment === p.id ? "active" : ""}" data-seg="${p.id}">${p.label}</button>`
      )
      .join("");
    el.querySelectorAll(".seg-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.sidebarSegment = btn.dataset.seg;
        renderSidebarFilters();
        renderSidebar();
      });
    });
  }

  function matchesSearch(stock) {
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      stock.id.toLowerCase().includes(q) ||
      stock.name.toLowerCase().includes(q) ||
      stock.en_name.toLowerCase().includes(q) ||
      stock.segment_label.toLowerCase().includes(q)
    );
  }

  function renderSidebar() {
    const el = document.getElementById("stockSidebarList");
    if (!el || !state.data) return;

    const filtered = state.data.stocks.filter((s) => {
      if (!matchesSearch(s)) return false;
      if (state.sidebarSegment === "watchlist") return state.watchlist.has(s.id);
      if (state.sidebarSegment !== "all") return s.segment === state.sidebarSegment;
      return true;
    });

    if (!filtered.length) {
      el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:0.82rem;">查無符合條件的半導體標的</div>`;
      return;
    }

    const groups = new Map();
    state.data.segments.forEach((seg) => groups.set(seg.id, { label: seg.label, items: [] }));
    filtered.forEach((s) => {
      if (groups.has(s.segment)) groups.get(s.segment).items.push(s);
    });

    let html = "";
    groups.forEach((grp) => {
      if (!grp.items.length) return;
      html += `<div class="sidebar-group-title"><span>${grp.label}</span><span>${grp.items.length}</span></div>`;
      grp.items.forEach((s) => {
        const active = s.id === state.selectedId ? "active" : "";
        const starred = state.watchlist.has(s.id) ? "starred" : "";
        const chgCls = chgClass(s.latest.change_pct);
        html += `
          <div class="stock-list-item ${active}" data-id="${s.id}">
            <div class="stock-item-left">
              <button class="star-btn ${starred}" data-star="${s.id}" title="加入/移除自選">★</button>
              <div style="min-width:0">
                <div class="stock-item-name">${s.name}</div>
                <div class="stock-item-sub mono">${s.id} · ${s.exchange}</div>
              </div>
            </div>
            <div class="stock-item-right">
              <div class="stock-item-price mono">${fmtPrice(s.latest.close, s)}</div>
              <div class="stock-item-chg mono ${chgCls}">${fmtPct(s.latest.change_pct)}</div>
            </div>
          </div>
        `;
      });
    });

    el.innerHTML = html;
    el.querySelectorAll(".stock-list-item").forEach((row) => {
      row.addEventListener("click", () => selectStock(row.dataset.id, false));
    });
    el.querySelectorAll("[data-star]").forEach((btn) => {
      btn.addEventListener("click", (e) => toggleWatchlist(btn.dataset.star, e));
    });
  }

  function renderTerminal() {
    const s = state.stocksById.get(state.selectedId);
    if (!s) return;

    const series = getSeries(s);
    const chg = s.latest.change;
    const pct = s.latest.change_pct;
    const cls = chgClass(pct);
    const sign = chg > 0 ? "+" : "";
    const starred = state.watchlist.has(s.id);

    const lowRange = s.metrics.low_52w ?? s.metrics.low_6m ?? s.latest.low;
    const highRange = s.metrics.high_52w ?? s.metrics.high_6m ?? s.latest.high;
    const rangeTitle = s.metrics.high_52w ? "52 週" : "近 6 月";
    const posPct = highRange > lowRange ? Math.max(2, Math.min(98, ((s.latest.close - lowRange) / (highRange - lowRange)) * 100)) : 50;
    const dist52 = s.metrics.dist_52w_high !== null && s.metrics.dist_52w_high !== undefined ? ` ｜ 距高點 ${s.metrics.dist_52w_high.toFixed(1)}%` : "";

    document.getElementById("stockHeroWrap").innerHTML = `
      <div class="stock-hero">
        <div>
          <div class="stock-hero-title">
            <h2>${s.name} <span class="mono" style="color:var(--cyan);font-size:1.2rem">${s.id}</span></h2>
            <span class="tag-chip">${s.segment_label}</span>
            <span class="tag-chip tag-exchange mono">${s.exchange} · ${s.currency}</span>
            ${s.fundamentals.earnings_date ? `<span class="tag-chip" style="background:rgba(251,191,36,0.12);border-color:rgba(251,191,36,0.3);color:#fde047">📅 財報 ${s.fundamentals.earnings_date}</span>` : ""}
            <button class="btn" id="heroStarBtn" style="padding:4px 10px;font-size:0.76rem">
              <span style="color:${starred ? "var(--amber)" : "var(--text-dim)"}">★</span> ${starred ? "已加自選" : "加入自選"}
            </button>
          </div>
          <div class="stock-tagline">${s.en_name} — ${s.tagline}</div>
        </div>
        <div class="stock-price-block">
          <div class="big-price mono ${cls}">${fmtPrice(s.latest.close, s)}</div>
          <div class="big-change mono ${cls}">
            ${chg > 0 ? "▲" : chg < 0 ? "▼" : "—"} ${sign}${fmtPrice(chg, s)} (${fmtPct(pct)})
          </div>
          <div class="price-date mono">最新交易日：${s.latest.date}</div>
        </div>
      </div>

      <div class="quote-metrics-row">
        <div class="mini-stat">
          <div class="mini-stat-label">開盤 / 昨收</div>
          <div class="mini-stat-val mono">${fmtPrice(s.latest.open, s)} / ${fmtPrice(s.latest.prev_close, s)}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">當日高低</div>
          <div class="mini-stat-val mono"><span class="up">${fmtPrice(s.latest.high, s)}</span> / <span class="down">${fmtPrice(s.latest.low, s)}</span></div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">成交量</div>
          <div class="mini-stat-val mono">${fmtVol(s.latest.volume, s)}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">本益比 P/E (預估)</div>
          <div class="mini-stat-val mono">${s.fundamentals.pe ? s.fundamentals.pe + "x" : "—"}${s.fundamentals.forward_pe ? ` <span style="font-size:0.72rem;color:var(--cyan)">(${s.fundamentals.forward_pe}x)</span>` : ""}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">毛利率 / 營益率</div>
          <div class="mini-stat-val mono">${s.fundamentals.gross_margin !== null && s.fundamentals.gross_margin !== undefined ? s.fundamentals.gross_margin.toFixed(1) + "%" : "—"} / ${s.fundamentals.operating_margin !== null && s.fundamentals.operating_margin !== undefined ? s.fundamentals.operating_margin.toFixed(1) + "%" : "—"}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">${s.market !== "TW" && s.fundamentals.market_cap ? "殖利率 / 市值" : "淨值比 P/B · 殖利率"}</div>
          <div class="mini-stat-val mono">${s.market !== "TW" && s.fundamentals.market_cap ? `${s.fundamentals.dividend_yield !== null && s.fundamentals.dividend_yield !== undefined ? s.fundamentals.dividend_yield + "%" : "—"} · ${fmtMcap(s.fundamentals.market_cap, s)}` : `${s.fundamentals.pb ? s.fundamentals.pb + "x" : "—"} · ${s.fundamentals.dividend_yield !== null && s.fundamentals.dividend_yield !== undefined ? s.fundamentals.dividend_yield + "%" : "—"}`}</div>
        </div>
      </div>

      <div class="range-bar-wrap">
        <span class="mono" style="font-size:0.75rem;color:var(--text-muted)">${rangeTitle}低點 <strong class="down">${fmtPrice(lowRange, s)}</strong></span>
        <div class="range-track" title="目前股價位於${rangeTitle}區間 ${posPct.toFixed(0)}% 位置">
          <div class="range-thumb" style="left:${posPct.toFixed(1)}%"></div>
        </div>
        <span class="mono" style="font-size:0.75rem;color:var(--text-muted)">${rangeTitle}高點 <strong class="up">${fmtPrice(highRange, s)}</strong>（區間 ${posPct.toFixed(0)}%${dist52}）</span>
      </div>
    `;

    document.getElementById("heroStarBtn").addEventListener("click", (e) => toggleWatchlist(s.id, e));

    // 主圖與副圖渲染
    window.SemiCharts.renderTerminalChart(
      document.getElementById("terminalCanvas"),
      document.getElementById("terminalHud"),
      s,
      series,
      state.chartOpts
    );

    // 技術面自動診斷
    const diagnostics = window.SemiIndicators.generateDiagnostics(s, series);
    document.getElementById("signalList").innerHTML = diagnostics
      .map((sig) => {
        const icon = sig.type === "bull" ? "▲" : sig.type === "bear" ? "▼" : sig.type === "warn" ? "⚡" : "●";
        return `<div class="signal-item signal-${sig.type}"><span>${icon}</span><span>${sig.label}</span></div>`;
      })
      .join("");

    // 報酬率與風險指標卡
    const m = s.metrics;
    const fmtPp = (v) => (v !== null && v !== undefined ? `${v > 0 ? "+" : ""}${v.toFixed(1)} pp` : "—");
    const retItems = [
      { label: "近 5 日 / 20 日報酬", val: `${fmtPct(m.ret_5d)} / ${fmtPct(m.ret_20d)}`, cls: chgClass(m.ret_20d) },
      { label: "近 60 日 / YTD 報酬", val: `${fmtPct(m.ret_60d)} / ${fmtPct(m.ret_ytd)}`, cls: chgClass(m.ret_ytd) },
      { label: "2025 至今報酬", val: fmtPct(m.ret_from_2025), cls: chgClass(m.ret_from_2025) },
      { label: "相對 SOX (1M / 3M)", val: `${fmtPp(m.vs_sox_1m)} / ${fmtPp(m.vs_sox_3m)}`, cls: chgClass(m.vs_sox_3m) },
      { label: "月線乖離 (MA20)", val: fmtPct(m.bias_ma20), cls: chgClass(m.bias_ma20) },
      { label: "季線乖離 (MA60)", val: fmtPct(m.bias_ma60), cls: chgClass(m.bias_ma60) },
      { label: "年線乖離 (MA200)", val: fmtPct(m.bias_ma200), cls: chgClass(m.bias_ma200) },
      { label: "20日波動率 / 6月回撤", val: `${m.volatility_20d !== null ? m.volatility_20d.toFixed(1) + "%" : "—"} / ${m.max_drawdown_6m !== null ? m.max_drawdown_6m.toFixed(1) + "%" : "—"}`, cls: "down" },
    ];
    document.getElementById("returnStatsGrid").innerHTML = retItems
      .map(
        (it) => `
        <div class="ret-box">
          <div class="ret-box-label">${it.label}</div>
          <div class="ret-box-val mono ${it.cls}">${it.val}</div>
        </div>
      `
      )
      .join("");

    // 個股營收來源與新聞卡片
    renderRevenueMix(s, document.getElementById("revenueMixCard"), document.getElementById("revMixBasis"));
    renderStockNews(s, document.getElementById("stockNewsCard"));
  }

  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderRevenueMix(stock, containerEl, basisEl) {
    if (!containerEl) return;
    const mix = stock.revenue_mix;
    if (basisEl) basisEl.textContent = mix && mix.basis ? mix.basis : "";
    if (!mix || !Array.isArray(mix.items) || !mix.items.length) {
      containerEl.innerHTML = `<div style="color:var(--text-dim);font-size:0.82rem;padding:10px">暫無營收結構資料</div>`;
      return;
    }

    const palette = ["#38bdf8", "#818cf8", "#fbbf24", "#f472b6", "#00d084"];
    const hasPct = mix.items.some((it) => typeof it.pct === "number");
    let barHtml = "";
    if (hasPct) {
      barHtml = `<div class="mix-bar">${mix.items
        .filter((it) => typeof it.pct === "number" && it.pct > 0)
        .map((it, idx) => `<div class="mix-seg" style="width:${it.pct}%;background:${palette[idx % palette.length]}" title="${escHtml(it.name)}: ${it.pct}%"></div>`)
        .join("")}</div>`;
    }

    const listHtml = `<div class="mix-list">${mix.items
      .map((it, idx) => {
        const color = palette[idx % palette.length];
        const rightVal = typeof it.pct === "number" ? `${it.pct}%` : (it.tag || "核心業務");
        return `
          <div class="mix-item">
            <div class="mix-item-left">
              <span class="mix-dot" style="background:${color}"></span>
              <div>
                <div class="mix-name">${escHtml(it.name)}</div>
                <div class="mix-desc">${escHtml(it.desc)}</div>
              </div>
            </div>
            <div class="mix-pct mono">${escHtml(rightVal)}</div>
          </div>
        `;
      })
      .join("")}</div>`;

    const noteHtml = mix.note ? `<div class="mix-note">📌 ${escHtml(mix.note)}</div>` : "";
    containerEl.innerHTML = barHtml + listHtml + noteHtml;
  }

  function renderStockNews(stock, containerEl) {
    if (!containerEl) return;
    const list = stock.news || [];
    if (!list.length) {
      containerEl.innerHTML = `<div style="color:var(--text-dim);font-size:0.82rem;padding:10px">目前無近期焦點新聞（待下次排程更新）</div>`;
      return;
    }
    containerEl.innerHTML = list
      .map(
        (n) => `
        <a class="news-item" href="${escHtml(n.url)}" target="_blank" rel="noopener noreferrer">
          <div class="news-title">${escHtml(n.title)}</div>
          <div class="news-meta">
            <span class="news-pub">${escHtml(n.publisher)}</span>
            <span class="mono">${escHtml(n.date || "")}</span>
          </div>
        </a>
      `
      )
      .join("");
  }

  function renderSupplyTab() {
    if (!state.data) return;

    // 0. 互動式供應鏈關係圖
    if (window.SemiSupplyGraph) {
      window.SemiSupplyGraph.render(
        document.getElementById("supplyGraphWrap"),
        document.getElementById("supplyGraphInspector"),
        state.stocksById,
        (id) => selectStock(id, true)
      );
    }

    // 1. 供應鏈全景卡片
    const flowEl = document.getElementById("pipelineFlow");
    flowEl.innerHTML = state.data.segments
      .map((seg) => {
        const members = state.data.stocks.filter((s) => s.segment === seg.id);
        const nonIdx = members.filter((s) => !s.is_index);
        const avg1d = nonIdx.length
          ? nonIdx.reduce((a, s) => a + (s.latest.change_pct || 0), 0) / nonIdx.length
          : 0;
        const validPe = nonIdx.filter((s) => s.fundamentals.pe && s.fundamentals.pe < 120);
        const avgPe = validPe.length
          ? (validPe.reduce((a, s) => a + s.fundamentals.pe, 0) / validPe.length).toFixed(1) + "x"
          : "—";

        return `
          <div class="stage-card">
            <div class="stage-step">STAGE 0${seg.order} · ${seg.en_label}</div>
            <div class="stage-title">${seg.label}</div>
            <div class="stage-desc">${seg.description}</div>
            <div class="stage-stats">
              <span>族群均漲跌：<strong class="mono ${chgClass(avg1d)}">${fmtPct(avg1d)}</strong></span>
              <span>均 PE：<strong class="mono">${avgPe}</strong></span>
            </div>
            <div class="stage-chips">
              ${members
                .map(
                  (s) => `
                  <button class="stage-stock-btn" data-id="${s.id}">
                    <span><strong>${s.name.split(" ")[0]}</strong> <span class="mono" style="color:var(--text-dim);font-size:0.72rem">${s.id}</span></span>
                    <span class="mono ${chgClass(s.latest.change_pct)}" style="font-weight:700">${fmtPct(s.latest.change_pct)}</span>
                  </button>
                `
                )
                .join("")}
            </div>
          </div>
        `;
      })
      .join("");

    flowEl.querySelectorAll(".stage-stock-btn").forEach((btn) => {
      btn.addEventListener("click", () => selectStock(btn.dataset.id, true));
    });

    // 2. 四象限散點圖
    window.SemiCharts.renderScatterChart(
      document.getElementById("scatterCanvas"),
      document.getElementById("scatterInfo"),
      state.data.stocks,
      (id) => selectStock(id, true)
    );

    // 3. 基本面矩陣篩選列與表格
    const filterEl = document.getElementById("tableSegmentFilters");
    const pills = [{ id: "all", label: "全部標的" }, ...state.data.segments.map((s) => ({ id: s.id, label: s.label }))];
    filterEl.innerHTML = pills
      .map(
        (p) =>
          `<button class="seg-pill ${state.tableSegment === p.id ? "active" : ""}" data-tseg="${p.id}">${p.label}</button>`
      )
      .join("");
    filterEl.querySelectorAll(".seg-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tableSegment = btn.dataset.tseg;
        renderSupplyTab();
      });
    });

    renderFundamentalsTable();
  }

  function renderFundamentalsTable() {
    const tbody = document.getElementById("fundamentalsTbody");
    if (!tbody || !state.data) return;

    const rows = state.data.stocks.filter((s) => {
      if (!matchesSearch(s)) return false;
      if (state.tableSegment !== "all" && s.segment !== state.tableSegment) return false;
      return true;
    });

    const getVal = (s, key) => {
      switch (key) {
        case "id": return s.id;
        case "close": return s.latest.close;
        case "ret_1d": return s.latest.change_pct;
        case "ret_5d": return s.metrics.ret_5d;
        case "ret_20d": return s.metrics.ret_20d;
        case "ret_60d": return s.metrics.ret_60d;
        case "pe": return s.fundamentals.pe;
        case "pb": return s.fundamentals.pb;
        case "yield": return s.fundamentals.dividend_yield;
        case "rsi14": return s.metrics.rsi14;
        case "bias_ma60": return s.metrics.bias_ma60;
        default: return s.metrics.ret_20d;
      }
    };

    const { key, dir } = state.tableSort;
    rows.sort((a, b) => {
      const va = getVal(a, key);
      const vb = getVal(b, key);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return dir === "asc" ? va - vb : vb - va;
    });

    tbody.innerHTML = rows
      .map(
        (s) => `
        <tr data-id="${s.id}">
          <td>
            <div style="font-weight:700">${s.name}</div>
            <div class="mono" style="font-size:0.72rem;color:var(--text-dim)">${s.id} · ${s.exchange}</div>
          </td>
          <td><span class="tag-chip">${s.segment_label}</span></td>
          <td class="mono" style="font-weight:700">${fmtPrice(s.latest.close, s)} <span style="font-size:0.7rem;color:var(--text-dim)">${s.currency}</span></td>
          <td class="mono ${chgClass(s.latest.change_pct)}" style="font-weight:700">${fmtPct(s.latest.change_pct)}</td>
          <td class="mono ${chgClass(s.metrics.ret_5d)}">${fmtPct(s.metrics.ret_5d)}</td>
          <td class="mono ${chgClass(s.metrics.ret_20d)}">${fmtPct(s.metrics.ret_20d)}</td>
          <td class="mono ${chgClass(s.metrics.ret_60d)}">${fmtPct(s.metrics.ret_60d)}</td>
          <td class="mono">${s.fundamentals.pe ? s.fundamentals.pe.toFixed(2) + "x" : "—"}</td>
          <td class="mono">${s.fundamentals.pb ? s.fundamentals.pb.toFixed(2) + "x" : "—"}</td>
          <td class="mono">${s.fundamentals.dividend_yield !== null && s.fundamentals.dividend_yield !== undefined ? s.fundamentals.dividend_yield.toFixed(2) + "%" : "—"}</td>
          <td class="mono">${s.metrics.rsi14 !== null ? s.metrics.rsi14.toFixed(1) : "—"}</td>
          <td class="mono ${chgClass(s.metrics.bias_ma60)}">${fmtPct(s.metrics.bias_ma60)}</td>
        </tr>
      `
      )
      .join("");

    tbody.querySelectorAll("tr").forEach((tr) => {
      tr.addEventListener("click", () => selectStock(tr.dataset.id, true));
    });
  }

  function fmtFinMoney(val, finCurrency) {
    if (val === null || val === undefined || Number.isNaN(val)) return "—";
    const sign = val < 0 ? "-" : "";
    const abs = Math.abs(val);
    if (finCurrency === "USD" || finCurrency === "EUR") {
      const sym = finCurrency === "EUR" ? "€" : "$";
      if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(2)}B`;
      if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(1)}M`;
      return `${sign}${sym}${abs.toFixed(0)}`;
    }
    const sym = finCurrency === "JPY" ? "¥" : finCurrency === "KRW" ? "₩" : "NT$";
    if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}兆`;
    if (abs >= 1e8) return `${sign}${sym}${(abs / 1e8).toFixed(1)}億`;
    return `${sign}${sym}${abs.toFixed(0)}`;
  }

  function renderFinancialsTab() {
    if (!state.data) return;

    const companies = state.data.stocks.filter((s) => !s.is_index);
    if (!companies.length) return;

    let active = state.stocksById.get(state.selectedId);
    if (!active || active.is_index) {
      active = companies[0];
      state.selectedId = active.id;
    }

    const selEl = document.getElementById("finStockSelector");
    if (selEl) {
      selEl.innerHTML = companies
        .map((s) => {
          const isAct = s.id === active.id ? "active" : "";
          return `<button class="compare-chip ${isAct}" data-fin-id="${s.id}"><span class="mono" style="color:var(--cyan)">${s.id}</span> ${s.name.split(" ")[0]}</button>`;
        })
        .join("");

      selEl.querySelectorAll("[data-fin-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.selectedId = btn.dataset.finId;
          renderTickerStrip();
          renderSidebar();
          renderFinancialsTab();
        });
      });
    }

    const fin = active.financials || { currency: active.currency, quarters: [] };
    const quarters = fin.quarters || [];
    const finCur = fin.currency || active.currency;
    const latestQ = quarters.length ? quarters[quarters.length - 1] : null;
    const prevQ = quarters.length >= 2 ? quarters[quarters.length - 2] : null;

    const heroEl = document.getElementById("finHeroWrap");
    if (heroEl) {
      const gmTrend = latestQ && prevQ && latestQ.gm_pct !== null && prevQ.gm_pct !== null
        ? (latestQ.gm_pct - prevQ.gm_pct)
        : null;
      const gmTrendTxt = gmTrend !== null
        ? `<span class="${gmTrend >= 0 ? "up" : "down"}" style="font-size:0.74rem">(${gmTrend >= 0 ? "+" : ""}${gmTrend.toFixed(1)} ppt vs 上季)</span>`
        : "";
      const revYoy = active.fundamentals.revenue_growth;

      heroEl.innerHTML = `
        <div class="fin-kpi-row">
          <div class="mini-stat">
            <div class="mini-stat-label">${active.name} · 最新財報季度</div>
            <div class="mini-stat-val mono" style="color:var(--cyan)">${latestQ ? `${latestQ.label} (${latestQ.d})` : "—"}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">單季營收 (${finCur})</div>
            <div class="mini-stat-val mono">${latestQ ? fmtFinMoney(latestQ.rev, finCur) : "—"} ${revYoy !== null && revYoy !== undefined ? `<span class="${chgClass(revYoy)}" style="font-size:0.74rem">(${revYoy >= 0 ? "+" : ""}${revYoy.toFixed(1)}% YoY)</span>` : ""}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">毛利率 (Gross Margin)</div>
            <div class="mini-stat-val mono">${latestQ && latestQ.gm_pct != null ? latestQ.gm_pct.toFixed(1) + "%" : (active.fundamentals.gross_margin != null ? active.fundamentals.gross_margin.toFixed(1) + "%" : "—")} ${gmTrendTxt}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">營業利益率 / 淨利率</div>
            <div class="mini-stat-val mono">${latestQ && latestQ.om_pct != null ? latestQ.om_pct.toFixed(1) + "%" : "—"} / ${latestQ && latestQ.nm_pct != null ? latestQ.nm_pct.toFixed(1) + "%" : "—"}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">資本支出 / 自由現金流</div>
            <div class="mini-stat-val mono">${latestQ ? fmtFinMoney(latestQ.capex, finCur) : "—"} / <span class="${latestQ && latestQ.fcf < 0 ? "up" : "down"}">${latestQ ? fmtFinMoney(latestQ.fcf, finCur) : "—"}</span></div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">預估本益比 / 下次財報</div>
            <div class="mini-stat-val mono">${active.fundamentals.forward_pe ? active.fundamentals.forward_pe + "x" : "—"} · ${active.fundamentals.earnings_date || "—"}</div>
          </div>
        </div>
      `;
    }

    const finMixBox = document.getElementById("finRevenueMixBox");
    if (finMixBox) {
      renderRevenueMix(active, finMixBox, null);
    }

    window.SemiCharts.renderFinRevenueChart(
      document.getElementById("finRevCanvas"),
      document.getElementById("finRevHud"),
      quarters,
      finCur
    );
    window.SemiCharts.renderFinMarginChart(
      document.getElementById("finMarginCanvas"),
      document.getElementById("finMarginHud"),
      quarters
    );
    window.SemiCharts.renderFinCashflowChart(
      document.getElementById("finCfCanvas"),
      document.getElementById("finCfHud"),
      quarters,
      finCur
    );

    const titleEl = document.getElementById("finTableTitle");
    if (titleEl) titleEl.textContent = `📋 ${active.name} (${active.id}) 2025 至今季度財報明細`;
    const noteEl = document.getElementById("finCurrencyNote");
    if (noteEl) noteEl.textContent = `財報幣別：${finCur}（隨 GitHub Actions 定期更新並自動保留歷史季度）`;

    const qTbody = document.getElementById("finQuartersTbody");
    if (qTbody) {
      if (!quarters.length) {
        qTbody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:var(--text-dim);padding:20px">尚無可用季度財報數據</td></tr>`;
      } else {
        qTbody.innerHTML = [...quarters]
          .reverse()
          .map((q) => {
            const qoqCls = chgClass(q.qoq_rev_pct);
            const fcfCls = q.fcf !== null && q.fcf !== undefined ? (q.fcf >= 0 ? "down" : "up") : "";
            return `
              <tr>
                <td class="mono" style="font-weight:700;color:var(--cyan)">${q.label}</td>
                <td class="mono">${q.d}</td>
                <td class="mono" style="font-weight:700">${fmtFinMoney(q.rev, finCur)}</td>
                <td class="mono ${qoqCls}">${fmtPct(q.qoq_rev_pct)}</td>
                <td class="mono">${fmtFinMoney(q.gp, finCur)}</td>
                <td class="mono" style="color:#fbbf24;font-weight:700">${q.gm_pct !== null && q.gm_pct !== undefined ? q.gm_pct.toFixed(1) + "%" : "—"}</td>
                <td class="mono">${fmtFinMoney(q.op, finCur)}</td>
                <td class="mono">${q.om_pct !== null && q.om_pct !== undefined ? q.om_pct.toFixed(1) + "%" : "—"}</td>
                <td class="mono">${fmtFinMoney(q.ni, finCur)}</td>
                <td class="mono">${q.eps !== null && q.eps !== undefined ? q.eps.toFixed(2) : "—"}</td>
                <td class="mono">${fmtFinMoney(q.capex, finCur)}</td>
                <td class="mono ${fcfCls}" style="font-weight:700">${fmtFinMoney(q.fcf, finCur)}</td>
                <td class="mono">${q.capex_pct !== null && q.capex_pct !== undefined ? q.capex_pct.toFixed(1) + "%" : "—"}</td>
              </tr>
            `;
          })
          .join("");
      }
    }

    // 同業估值與獲利品質矩陣篩選
    const pFiltEl = document.getElementById("peerSegmentFilters");
    if (pFiltEl) {
      const pills = [{ id: "all", label: "全部市場" }, ...state.data.segments.map((s) => ({ id: s.id, label: s.label }))];
      pFiltEl.innerHTML = pills
        .map((p) => `<button class="seg-pill ${state.peerSegment === p.id ? "active" : ""}" data-pseg="${p.id}">${p.label}</button>`)
        .join("");
      pFiltEl.querySelectorAll("[data-pseg]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.peerSegment = btn.dataset.pseg;
          renderFinancialsTab();
        });
      });
    }

    renderPeerMatrixTable();
  }

  function renderPeerMatrixTable() {
    const tbody = document.getElementById("peerMatrixTbody");
    if (!tbody || !state.data) return;

    const rows = state.data.stocks.filter((s) => {
      if (s.is_index) return false;
      if (!matchesSearch(s)) return false;
      if (state.peerSegment !== "all" && s.segment !== state.peerSegment) return false;
      return true;
    });

    const getVal = (s, k) => {
      switch (k) {
        case "id": return s.id;
        case "mcap": return s.fundamentals.market_cap;
        case "pe": return s.fundamentals.pe;
        case "fpe": return s.fundamentals.forward_pe;
        case "ev_ebitda": return s.fundamentals.ev_ebitda;
        case "ps": return s.fundamentals.ps;
        case "gm": return s.fundamentals.gross_margin;
        case "om": return s.fundamentals.operating_margin;
        case "rev_g": return s.fundamentals.revenue_growth;
        case "vs_sox_3m": return s.metrics.vs_sox_3m;
        case "earnings_date": return s.fundamentals.earnings_date;
        default: return s.fundamentals.gross_margin;
      }
    };

    const { key, dir } = state.peerSort;
    rows.sort((a, b) => {
      const va = getVal(a, key);
      const vb = getVal(b, key);
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return dir === "asc" ? va - vb : vb - va;
    });

    tbody.innerHTML = rows
      .map((s) => {
        const f = s.fundamentals;
        const m = s.metrics;
        const vs3 = m.vs_sox_3m;
        const isSel = s.id === state.selectedId ? 'style="background:rgba(56,189,248,0.12)"' : "";
        return `
          <tr data-peer-id="${s.id}" ${isSel}>
            <td>
              <div style="font-weight:700">${s.name}</div>
              <div class="mono" style="font-size:0.72rem;color:var(--text-dim)">${s.id} · ${s.market}</div>
            </td>
            <td class="mono">${fmtMcap(f.market_cap, s)}</td>
            <td class="mono">${f.pe ? f.pe.toFixed(1) + "x" : "—"}</td>
            <td class="mono" style="color:var(--cyan);font-weight:700">${f.forward_pe ? f.forward_pe.toFixed(1) + "x" : "—"}</td>
            <td class="mono">${f.ev_ebitda ? f.ev_ebitda.toFixed(1) + "x" : "—"}</td>
            <td class="mono">${f.ps ? f.ps.toFixed(2) + "x" : "—"}</td>
            <td class="mono" style="color:#fbbf24;font-weight:700">${f.gross_margin !== null && f.gross_margin !== undefined ? f.gross_margin.toFixed(1) + "%" : "—"}</td>
            <td class="mono">${f.operating_margin !== null && f.operating_margin !== undefined ? f.operating_margin.toFixed(1) + "%" : "—"}</td>
            <td class="mono ${chgClass(f.revenue_growth)}">${f.revenue_growth !== null && f.revenue_growth !== undefined ? fmtPct(f.revenue_growth) : "—"}</td>
            <td class="mono ${chgClass(vs3)}">${vs3 !== null && vs3 !== undefined ? `${vs3 >= 0 ? "+" : ""}${vs3.toFixed(1)} pp` : "—"}</td>
            <td class="mono" style="color:#fde047">${f.earnings_date || "—"}</td>
          </tr>
        `;
      })
      .join("");

    tbody.querySelectorAll("tr").forEach((tr) => {
      tr.addEventListener("click", () => {
        state.selectedId = tr.dataset.peerId;
        renderTickerStrip();
        renderSidebar();
        renderFinancialsTab();
        document.getElementById("tab-financials").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function renderCompareTab() {
    if (!state.data) return;

    const chipsEl = document.getElementById("compareChips");
    chipsEl.innerHTML = state.data.stocks
      .map((s) => {
        const idx = state.compareIds.indexOf(s.id);
        const active = idx !== -1;
        const dotColor = active ? COMPARE_PALETTE[idx % COMPARE_PALETTE.length] : "#475569";
        return `
          <button class="compare-chip ${active ? "active" : ""}" data-cid="${s.id}">
            <span class="swatch" style="background:${dotColor}"></span>
            <span>${s.id} ${s.name.split(" ")[0]}</span>
          </button>
        `;
      })
      .join("");

    chipsEl.querySelectorAll(".compare-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.cid;
        const pos = state.compareIds.indexOf(id);
        if (pos !== -1) {
          state.compareIds.splice(pos, 1);
        } else {
          if (state.compareIds.length >= 6) state.compareIds.shift();
          state.compareIds.push(id);
        }
        renderCompareTab();
      });
    });

    const selectedStocks = state.compareIds.map((id) => state.stocksById.get(id)).filter(Boolean);
    window.SemiCharts.renderCompareChart(
      document.getElementById("compareCanvas"),
      document.getElementById("compareHud"),
      selectedStocks,
      state.compareRange,
      COMPARE_PALETTE
    );

    // 強弱勢排行卡片
    const lbEl = document.getElementById("leaderboardGrid");
    const stocks = state.data.stocks.filter((s) => !s.is_index);
    const periods = [
      { title: "單日強弱排行 (1D)", fn: (s) => s.latest.change_pct },
      { title: "近一週排行 (5D)", fn: (s) => s.metrics.ret_5d },
      { title: "近一月排行 (20D)", fn: (s) => s.metrics.ret_20d },
      { title: "近一季排行 (60D)", fn: (s) => s.metrics.ret_60d },
    ];

    lbEl.innerHTML = periods
      .map((p) => {
        const sorted = [...stocks]
          .filter((s) => p.fn(s) !== null && p.fn(s) !== undefined)
          .sort((a, b) => p.fn(b) - p.fn(a));
        const top = sorted.slice(0, 5);
        return `
          <div class="card" style="padding:14px">
            <div style="font-size:0.86rem;font-weight:700;margin-bottom:10px;color:var(--cyan)">${p.title}</div>
            ${top
              .map((s, idx) => {
                const v = p.fn(s);
                return `
                  <div class="lb-row" data-id="${s.id}">
                    <span><strong class="mono" style="color:var(--text-dim)">#${idx + 1}</strong> ${s.name.split(" ")[0]} <span class="mono" style="color:var(--text-dim);font-size:0.72rem">${s.id}</span></span>
                    <span class="mono ${chgClass(v)}" style="font-weight:700">${fmtPct(v)}</span>
                  </div>
                `;
              })
              .join("")}
          </div>
        `;
      })
      .join("");

    lbEl.querySelectorAll(".lb-row").forEach((row) => {
      row.addEventListener("click", () => selectStock(row.dataset.id, true));
    });
  }

  function renderPipelineTab() {
    if (!state.data) return;
    const wlEl = document.getElementById("watchlistCards");
    const starredStocks = state.data.stocks.filter((s) => state.watchlist.has(s.id));

    if (!starredStocks.length) {
      wlEl.innerHTML = `<div style="color:var(--text-dim);font-size:0.85rem">尚未加入任何自選股，可在左側標的列表點擊 ★ 收藏。</div>`;
    } else {
      wlEl.innerHTML = starredStocks
        .map(
          (s) => `
          <div class="lb-row" data-id="${s.id}" style="padding:10px 12px">
            <div>
              <strong>${s.name}</strong> <span class="mono" style="color:var(--cyan);font-size:0.76rem">${s.id}</span>
              <div style="font-size:0.72rem;color:var(--text-dim)">${s.segment_label} ｜ PE ${s.fundamentals.pe ?? "—"}x ｜ RSI ${s.metrics.rsi14 ?? "—"}</div>
            </div>
            <div style="text-align:right">
              <div class="mono" style="font-weight:700">${fmtPrice(s.latest.close, s)} ${s.currency}</div>
              <div class="mono ${chgClass(s.latest.change_pct)}" style="font-size:0.76rem;font-weight:700">${fmtPct(s.latest.change_pct)}</div>
            </div>
          </div>
        `
        )
        .join("");

      wlEl.querySelectorAll(".lb-row").forEach((row) => {
        row.addEventListener("click", () => selectStock(row.dataset.id, true));
      });
    }

    const statusEl = document.getElementById("updateStatusBox");
    if (statusEl) {
      const genText = state.data.generated_at ? state.data.generated_at.replace("T", " ").slice(0, 19) : "—";
      statusEl.innerHTML = `
        <div><strong>上次排程產生時間：</strong><span class="mono" style="color:var(--cyan)">${genText} (UTC+8)</span></div>
        <div style="margin-top:4px;color:var(--text-muted)">
          台股：<span class="mono">${state.data.data_date_tw || "—"}</span> ｜ 美股：<span class="mono">${state.data.data_date_us || "—"}</span> ｜ 日股：<span class="mono">${state.data.data_date_jp || "—"}</span> ｜ 韓股：<span class="mono">${state.data.data_date_kr || "—"}</span> ｜ 追蹤標的：<span class="mono">${state.data.stocks.length} 檔</span>
        </div>
      `;
    }

    const cfgEl = document.getElementById("configPreview");
    const summaryList = state.data.stocks.map((s) => `${s.id.padEnd(6, " ")} | ${s.segment_label.padEnd(6, " ")} | ${s.name} (${s.yahoo_symbol})`).join("\n");
    cfgEl.textContent = summaryList;
  }

  function exportCsv() {
    if (!state.data) return;
    const headers = [
      "代號", "名稱", "英文名", "市場", "交易所", "供應鏈定位", "幣別",
      "最新日期", "收盤價", "漲跌", "單日漲跌幅(%)", "5日報酬(%)", "20日報酬(%)", "60日報酬(%)", "2025至今(%)",
      "本益比(PE)", "預估本益比(Fwd PE)", "EV/EBITDA", "P/S", "股價淨值比(PB)", "殖利率(%)",
      "毛利率(%)", "營益率(%)", "營收年增(%)", "MA20", "MA60", "MA200", "RSI(14)", "相對SOX 3M(pp)", "下次財報日"
    ];
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = state.data.stocks.map((s) => [
      s.id, s.name, s.en_name, s.market, s.exchange, s.segment_label, s.currency,
      s.latest.date, s.latest.close, s.latest.change, s.latest.change_pct,
      s.metrics.ret_5d, s.metrics.ret_20d, s.metrics.ret_60d, s.metrics.ret_from_2025,
      s.fundamentals.pe, s.fundamentals.forward_pe, s.fundamentals.ev_ebitda, s.fundamentals.ps, s.fundamentals.pb, s.fundamentals.dividend_yield,
      s.fundamentals.gross_margin, s.fundamentals.operating_margin, s.fundamentals.revenue_growth,
      s.metrics.ma20, s.metrics.ma60, s.metrics.ma200, s.metrics.rsi14, s.metrics.vs_sox_3m, s.fundamentals.earnings_date
    ].map(esc).join(","));

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `semiconductor_stocks_${state.data.data_date_tw || "latest"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    document.querySelectorAll(".nav-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    const searchInput = document.getElementById("globalSearch");
    searchInput.addEventListener("input", () => {
      state.searchQuery = searchInput.value;
      renderSidebar();
      if (state.activeTab === "supply") renderFundamentalsTable();
      if (state.activeTab === "financials") renderPeerMatrixTable();
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && state.data) {
        const hit = state.data.stocks.find((s) => matchesSearch(s));
        if (hit) selectStock(hit.id, true);
      }
    });

    document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);

    const handleRefresh = async (btn) => {
      if (!btn) return;
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "更新中...";
      try {
        state.seriesCache.clear();
        await loadData();
        renderAll();
        btn.textContent = "✓ 已同步最新";
      } catch (_) {
        btn.textContent = "載入失敗";
      } finally {
        setTimeout(() => {
          btn.textContent = origText;
          btn.disabled = false;
        }, 1600);
      }
    };
    const refreshBtn = document.getElementById("refreshDataBtn");
    if (refreshBtn) refreshBtn.addEventListener("click", () => handleRefresh(refreshBtn));
    const pipeRefreshBtn = document.getElementById("pipelineRefreshBtn");
    if (pipeRefreshBtn) pipeRefreshBtn.addEventListener("click", () => handleRefresh(pipeRefreshBtn));

    document.querySelectorAll(".chart-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.chartOpts.mode = btn.dataset.mode;
        document.querySelectorAll(".chart-mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderTerminal();
      });
    });

    document.querySelectorAll(".chart-range-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.chartOpts.range = btn.dataset.range;
        document.querySelectorAll(".chart-range-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderTerminal();
      });
    });

    document.querySelectorAll(".sub-type-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.chartOpts.subType = btn.dataset.sub;
        document.querySelectorAll(".sub-type-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderTerminal();
      });
    });

    const bindChk = (id, prop) => {
      const el = document.getElementById(id);
      el.checked = state.chartOpts[prop];
      el.parentElement.classList.toggle("checked", el.checked);
      el.addEventListener("change", () => {
        state.chartOpts[prop] = el.checked;
        el.parentElement.classList.toggle("checked", el.checked);
        renderTerminal();
      });
    };
    bindChk("chkMa5", "showMa5");
    bindChk("chkMa20", "showMa20");
    bindChk("chkMa60", "showMa60");
    bindChk("chkMa200", "showMa200");
    bindChk("chkBB", "showBB");

    document.querySelectorAll("#peerMatrixTable th[data-psort]").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.dataset.psort;
        if (state.peerSort.key === k) {
          state.peerSort.dir = state.peerSort.dir === "desc" ? "asc" : "desc";
        } else {
          state.peerSort.key = k;
          state.peerSort.dir = k === "id" || k === "earnings_date" ? "asc" : "desc";
        }
        renderPeerMatrixTable();
      });
    });

    document.querySelectorAll("#fundamentalsTable th[data-sort]").forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.dataset.sort;
        if (state.tableSort.key === k) {
          state.tableSort.dir = state.tableSort.dir === "desc" ? "asc" : "desc";
        } else {
          state.tableSort.key = k;
          state.tableSort.dir = k === "id" ? "asc" : "desc";
        }
        renderFundamentalsTable();
      });
    });

    document.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const map = {
          tsmc: ["2330", "TSM", "NVDA", "^SOX"],
          hbm_memory: ["000660.KS", "005930.KS", "MU", "2330"],
          jp_kr_semi: ["8035.T", "6857.T", "4063.T", "6146.T", "005930.KS", "000660.KS"],
          ai_asic: ["2454", "3661", "3443", "AVGO"],
          foundry_equip: ["2330", "8035.T", "ASML", "4063.T", "6488", "3131"],
          us_sox: ["^SOX", "NVDA", "AMD", "INTC", "AVGO", "MU"],
        };
        state.compareIds = (map[btn.dataset.preset] || ["2330", "NVDA"]).filter((id) => state.stocksById.has(id));
        renderCompareTab();
      });
    });

    document.querySelectorAll(".cmp-range-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.compareRange = btn.dataset.range;
        document.querySelectorAll(".cmp-range-btn").forEach((b) => b.classList.toggle("active", b === btn));
        renderCompareTab();
      });
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.activeTab === "terminal") renderTerminal();
        if (state.activeTab === "supply") renderSupplyTab();
        if (state.activeTab === "financials") renderFinancialsTab();
        if (state.activeTab === "compare") renderCompareTab();
      }, 140);
    });
  }

  function renderAll() {
    renderHeaderMeta();
    renderTickerStrip();
    renderKpis();
    renderSidebarFilters();
    renderSidebar();
    if (state.activeTab === "terminal") renderTerminal();
    if (state.activeTab === "supply") renderSupplyTab();
    if (state.activeTab === "financials") renderFinancialsTab();
    if (state.activeTab === "compare") renderCompareTab();
    if (state.activeTab === "pipeline") renderPipelineTab();
  }

  async function init() {
    loadWatchlist();
    bindEvents();
    try {
      await loadData();
      const hashTab = window.location.hash.replace("#", "").trim();
      if (["terminal", "supply", "financials", "compare", "pipeline"].includes(hashTab)) {
        switchTab(hashTab);
      }
      renderAll();
    } catch (err) {
      document.getElementById("stockHeroWrap").innerHTML = `
        <div style="padding:24px;color:var(--up);font-weight:700">
          資料載入失敗：${err.message}
        </div>
      `;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
