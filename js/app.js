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
    searchQuery: "",
    watchlist: new Set(),
    chartOpts: {
      mode: "candle",
      range: "3M",
      subType: "volume",
      showMa5: true,
      showMa20: true,
      showMa60: true,
      showBB: false,
    },
    tableSort: { key: "ret_20d", dir: "desc" },
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
    if (tabId === "compare") renderCompareTab();
    if (tabId === "pipeline") renderPipelineTab();
  }

  function renderHeaderMeta() {
    const el = document.getElementById("dataDateLabel");
    if (!el || !state.data) return;
    const twD = state.data.data_date_tw || "—";
    const usD = state.data.data_date_us || "—";
    let genTime = "";
    if (state.data.generated_at) {
      const m = String(state.data.generated_at).match(/T(\d{2}:\d{2})/);
      if (m) genTime = ` ｜ 更新 ${m[1]}`;
    }
    el.textContent = `台股 ${twD} ｜ 美股 ${usD}${genTime}`;
  }

  function renderTickerStrip() {
    const el = document.getElementById("tickerStrip");
    if (!el) return;
    const featuredIds = ["^SOX", "2330", "NVDA", "TSM", "INTC", "2454", "3661", "3711", "ASML", "AVGO", "6488"];
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

    const low6 = s.metrics.low_6m ?? s.latest.low;
    const high6 = s.metrics.high_6m ?? s.latest.high;
    const posPct = high6 > low6 ? Math.max(2, Math.min(98, ((s.latest.close - low6) / (high6 - low6)) * 100)) : 50;

    document.getElementById("stockHeroWrap").innerHTML = `
      <div class="stock-hero">
        <div>
          <div class="stock-hero-title">
            <h2>${s.name} <span class="mono" style="color:var(--cyan);font-size:1.2rem">${s.id}</span></h2>
            <span class="tag-chip">${s.segment_label}</span>
            <span class="tag-chip tag-exchange mono">${s.exchange} · ${s.currency}</span>
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
          <div class="mini-stat-label">本益比 (P/E)</div>
          <div class="mini-stat-val mono">${s.fundamentals.pe ? s.fundamentals.pe + "x" : "—"}${s.fundamentals.forward_pe ? ` <span style="font-size:0.7rem;color:var(--text-dim)">(預估 ${s.fundamentals.forward_pe}x)</span>` : ""}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">股價淨值比 (P/B)</div>
          <div class="mini-stat-val mono">${s.fundamentals.pb ? s.fundamentals.pb + "x" : "—"}</div>
        </div>
        <div class="mini-stat">
          <div class="mini-stat-label">${s.market === "US" && s.fundamentals.market_cap ? "殖利率 / 市值" : "殖利率 (Yield)"}</div>
          <div class="mini-stat-val mono">${s.fundamentals.dividend_yield !== null && s.fundamentals.dividend_yield !== undefined ? s.fundamentals.dividend_yield + "%" : "—"}${s.market === "US" && s.fundamentals.market_cap ? ` · ${fmtMcap(s.fundamentals.market_cap, s)}` : ""}</div>
        </div>
      </div>

      <div class="range-bar-wrap">
        <span class="mono" style="font-size:0.75rem;color:var(--text-muted)">近 6 月低點 <strong class="down">${fmtPrice(low6, s)}</strong></span>
        <div class="range-track" title="目前股價位於近半年區間 ${posPct.toFixed(0)}% 位置">
          <div class="range-thumb" style="left:${posPct.toFixed(1)}%"></div>
        </div>
        <span class="mono" style="font-size:0.75rem;color:var(--text-muted)">近 6 月高點 <strong class="up">${fmtPrice(high6, s)}</strong>（區間位置 ${posPct.toFixed(0)}%）</span>
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
    const retItems = [
      { label: "近 5 日報酬", val: fmtPct(m.ret_5d), cls: chgClass(m.ret_5d) },
      { label: "近 20 日報酬", val: fmtPct(m.ret_20d), cls: chgClass(m.ret_20d) },
      { label: "近 60 日報酬", val: fmtPct(m.ret_60d), cls: chgClass(m.ret_60d) },
      { label: "近 6 月最大回撤", val: m.max_drawdown_6m !== null ? m.max_drawdown_6m.toFixed(2) + "%" : "—", cls: "down" },
      { label: "月線乖離 (vs MA20)", val: fmtPct(m.bias_ma20), cls: chgClass(m.bias_ma20) },
      { label: "季線乖離 (vs MA60)", val: fmtPct(m.bias_ma60), cls: chgClass(m.bias_ma60) },
      { label: "20 日年化波動率", val: m.volatility_20d !== null ? m.volatility_20d.toFixed(1) + "%" : "—", cls: "" },
      { label: "20 日均量", val: fmtVol(m.avg_volume_20d, s), cls: "" },
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
          台股最新交易日：<span class="mono">${state.data.data_date_tw || "—"}</span> ｜ 美股最新交易日：<span class="mono">${state.data.data_date_us || "—"}</span> ｜ 追蹤標的：<span class="mono">${state.data.stocks.length} 檔</span>
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
      "最新日期", "收盤價", "漲跌", "單日漲跌幅(%)", "5日報酬(%)", "20日報酬(%)", "60日報酬(%)",
      "本益比(PE)", "股價淨值比(PB)", "殖利率(%)", "MA5", "MA20", "MA60", "RSI(14)", "季線乖離(%)"
    ];
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = state.data.stocks.map((s) => [
      s.id, s.name, s.en_name, s.market, s.exchange, s.segment_label, s.currency,
      s.latest.date, s.latest.close, s.latest.change, s.latest.change_pct,
      s.metrics.ret_5d, s.metrics.ret_20d, s.metrics.ret_60d,
      s.fundamentals.pe, s.fundamentals.pb, s.fundamentals.dividend_yield,
      s.metrics.ma5, s.metrics.ma20, s.metrics.ma60, s.metrics.rsi14, s.metrics.bias_ma60
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
    bindChk("chkBB", "showBB");

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
          ai_asic: ["2454", "3661", "3443", "AVGO"],
          foundry_equip: ["2330", "2303", "ASML", "6488", "3131"],
          us_sox: ["^SOX", "NVDA", "AMD", "AVGO", "MU"],
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
    if (state.activeTab === "compare") renderCompareTab();
    if (state.activeTab === "pipeline") renderPipelineTab();
  }

  async function init() {
    loadWatchlist();
    bindEvents();
    try {
      await loadData();
      const hashTab = window.location.hash.replace("#", "").trim();
      if (["terminal", "supply", "compare", "pipeline"].includes(hashTab)) {
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
