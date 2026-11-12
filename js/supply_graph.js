/**
 * SEMI·PULSE 半導體供應鏈互動關係圖引擎 (SVG Topology Graph)
 * 呈現：設備材料/記憶體 -> 晶圓代工核心 <-> IC設計/AI大廠 -> 封裝測試與費半連動
 */
window.SemiSupplyGraph = (function () {
  const NODES = {
    // Col 1: 設備、矽晶圓與 HBM 記憶體 (x = 28)
    ASML:   { x: 28,  y: 72,  w: 174, h: 66, col: 1, role: "EUV 微影曝光機獨家設備" },
    "6488": { x: 28,  y: 202, w: 174, h: 66, col: 1, role: "12吋半導體矽晶圓材料" },
    "3131": { x: 28,  y: 332, w: 174, h: 66, col: 1, role: "CoWoS 濕製程先進封裝設備" },
    MU:     { x: 28,  y: 462, w: 174, h: 66, col: 1, role: "HBM3E 高頻寬記憶體" },

    // Col 2: 晶圓代工中樞與 ADR 連動 (x = 328)
    TSM:    { x: 332, y: 72,  w: 176, h: 66, col: 2, role: "台積電美股 ADR 定價指標" },
    "2330": { x: 322, y: 248, w: 196, h: 86, col: 2, role: "全球先進製程與 CoWoS 核心中樞", hub: true },
    "2303": { x: 332, y: 462, w: 176, h: 66, col: 2, role: "成熟與特殊製程晶圓代工" },

    // Col 3: 美台 IC 設計與 AI 晶片大廠 (x = 646)
    NVDA:   { x: 646, y: 26,  w: 176, h: 64, col: 3, role: "AI GPU 與加速運算龍頭" },
    AMD:    { x: 646, y: 108, w: 176, h: 64, col: 3, role: "資料中心 CPU / Instinct GPU" },
    AVGO:   { x: 646, y: 190, w: 176, h: 64, col: 3, role: "AI ASIC 與高速網通晶片" },
    "3661": { x: 646, y: 272, w: 176, h: 64, col: 3, role: "雲端 AI ASIC 客製設計服務" },
    "3443": { x: 646, y: 354, w: 176, h: 64, col: 3, role: "台積電轉投資 ASIC / IP" },
    "2454": { x: 646, y: 436, w: 176, h: 64, col: 3, role: "旗艦手機 SoC 與邊緣 AI" },
    "2379": { x: 646, y: 518, w: 176, h: 64, col: 3, role: "高速網通與 Wi-Fi 7 IC" },

    // Col 4: 封裝測試與全球風向 (x = 972)
    "^SOX": { x: 972, y: 72,  w: 188, h: 66, col: 4, role: "費城半導體景氣總指標" },
    "3711": { x: 972, y: 256, w: 188, h: 72, col: 4, role: "全球第一大封測與 CoWoS 外溢" },
    "2449": { x: 972, y: 428, w: 188, h: 72, col: 4, role: "AI GPU / ASIC 高階測試核心" },
  };

  // type: 'supply' (設備材料/HBM供應), 'mfg' (投片代工/封測流), 'sync' (台美資本連動)
  const EDGES = [
    // 設備與材料 -> 代工 / 封測
    { from: "ASML", to: "2330", type: "supply", label: "供應 EUV 極紫外光微影設備（3nm/2nm 關鍵）" },
    { from: "6488", to: "2330", type: "supply", label: "供應 12 吋拋光與磊晶矽晶圓" },
    { from: "6488", to: "2303", type: "supply", label: "供應成熟與特殊製程矽晶圓" },
    { from: "3131", to: "2330", type: "supply", label: "供應 CoWoS 先進封裝濕製程清洗設備" },
    { from: "3131", to: "3711", type: "supply", label: "供應高階封測濕製程設備", arcY: 608 },
    { from: "MU",   to: "2330", type: "supply", label: "HBM3E 記憶體堆疊進入台積電 CoWoS 封裝" },
    { from: "MU",   to: "NVDA", type: "supply", label: "為 AI GPU 提供高頻寬記憶體 HBM", arcY: 16 },

    // IC 設計 -> 晶圓代工 (委外製造)
    { from: "NVDA", to: "2330", type: "mfg", label: "4nm/3nm AI GPU 晶圓代工與 CoWoS 先進封裝主力客戶" },
    { from: "AMD",  to: "2330", type: "mfg", label: "EPYC / Instinct 晶片先進製程代工" },
    { from: "AVGO", to: "2330", type: "mfg", label: "客製化 AI ASIC 與網通晶片投片代工" },
    { from: "3661", to: "2330", type: "mfg", label: "北美雲端大廠 AI ASIC 先進製程與 CoWoS 投片" },
    { from: "3443", to: "2330", type: "mfg", label: "台積電轉投資，深化 HBM/CoWoS ASIC 設計服務" },
    { from: "2454", to: "2330", type: "mfg", label: "天璣旗艦手機晶片 3nm/4nm 投片代工" },
    { from: "2379", to: "2330", type: "mfg", label: "高階網通與高速傳輸控制晶片投片" },
    { from: "2379", to: "2303", type: "mfg", label: "成熟製程網通與週邊晶片晶圓代工" },

    // 晶圓代工 / IC 設計 -> 封裝測試
    { from: "2330", to: "3711", type: "mfg", label: "CoWoS 先進封裝產能外溢與 oS 端封裝合作", arcY: 205 },
    { from: "NVDA", to: "2449", type: "mfg", label: "AI GPU 晶圓測試與成品測試核心夥伴" },
    { from: "AMD",  to: "3711", type: "mfg", label: "高階運算晶片委外封裝測試" },
    { from: "AVGO", to: "3711", type: "mfg", label: "網通與客製化晶片高階封測" },
    { from: "3661", to: "2449", type: "mfg", label: "AI ASIC 晶片高階晶圓/成品測試" },
    { from: "3443", to: "3711", type: "mfg", label: "ASIC 與系統級封裝測試夥伴" },
    { from: "2454", to: "3711", type: "mfg", label: "手機 SoC 主力封裝測試合作廠" },
    { from: "2454", to: "2449", type: "mfg", label: "手機與 AI 晶片測試夥伴" },
    { from: "2379", to: "3711", type: "mfg", label: "網通 IC 封裝測試合作" },

    // 台美市場與指數連動
    { from: "2330", to: "TSM",  type: "sync", label: "台股現貨與美國 ADR (1 ADR = 5 股) 溢折價即時連動" },
    { from: "TSM",  to: "^SOX", type: "sync", label: "台積電 ADR 為費城半導體指數關鍵權值成分", arcY: 36 },
    { from: "NVDA", to: "^SOX", type: "sync", label: "AI GPU 龍頭帶動費半指數多空走勢" },
  ];

  const PRESETS = {
    all: { label: "全產業鏈全景", ids: null },
    ai: {
      label: "AI 伺服器晶片鏈",
      ids: new Set(["NVDA", "AVGO", "3661", "3443", "2330", "TSM", "MU", "3131", "ASML", "2449", "3711"]),
    },
    mobile: {
      label: "手機與網通 IC 鏈",
      ids: new Set(["2454", "2379", "2330", "2303", "6488", "3711", "2449"]),
    },
    equip: {
      label: "設備與矽晶圓鏈",
      ids: new Set(["ASML", "6488", "3131", "2330", "2303", "3711"]),
    },
    sync: {
      label: "台美股價與費半連動",
      ids: new Set(["^SOX", "TSM", "2330", "NVDA", "AMD", "AVGO", "ASML", "MU"]),
    },
  };

  let activeFocusId = null;
  let activePreset = "all";

  function fmtPct(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const n = Number(v);
    return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  }

  function fmtPrice(v, s) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const n = Number(v);
    if (s.currency === "TWD") {
      return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toFixed(n % 1 === 0 ? 1 : 2);
    }
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function buildPath(e) {
    const a = NODES[e.from];
    const b = NODES[e.to];
    if (!a || !b) return "";

    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;

    if (e.arcY !== undefined) {
      const startX = a.col < b.col ? a.x + a.w : ax;
      const startY = ay;
      const endX = a.col < b.col ? b.x : bx;
      const endY = by;
      const midX = (startX + endX) / 2;
      return `M ${startX} ${startY} Q ${midX} ${e.arcY}, ${endX} ${endY}`;
    }

    // 同欄上下連接
    if (a.col === b.col) {
      const x = ax;
      const y1 = ay > by ? a.y : a.y + a.h;
      const y2 = ay > by ? b.y + b.h : b.y;
      return `M ${x} ${y1} L ${x} ${y2}`;
    }

    // 跨欄水平貝茲曲線
    let x1, x2;
    if (a.col < b.col) {
      x1 = a.x + a.w;
      x2 = b.x;
    } else {
      x1 = a.x;
      x2 = b.x + b.w;
    }
    const dx = Math.abs(x2 - x1) * 0.45;
    const cx1 = a.col < b.col ? x1 + dx : x1 - dx;
    const cx2 = a.col < b.col ? x2 - dx : x2 + dx;
    return `M ${x1} ${ay} C ${cx1} ${ay}, ${cx2} ${by}, ${x2} ${by}`;
  }

  function render(containerEl, inspectorEl, stocksById, onSelectStock) {
    if (!containerEl) return;

    const presetSet = PRESETS[activePreset]?.ids || null;

    const isNodeHighlighted = (id) => {
      if (activeFocusId) {
        if (id === activeFocusId) return true;
        return EDGES.some((e) => (e.from === activeFocusId && e.to === id) || (e.to === activeFocusId && e.from === id));
      }
      if (presetSet) return presetSet.has(id);
      return true;
    };

    const isEdgeHighlighted = (e) => {
      if (activeFocusId) return e.from === activeFocusId || e.to === activeFocusId;
      if (presetSet) return presetSet.has(e.from) && presetSet.has(e.to);
      return true;
    };

    const colHeaders = [
      { x: 115, title: "① 設備材料 / 記憶體", sub: "ASML · 矽晶圓 · CoWoS設備 · HBM" },
      { x: 420, title: "② 晶圓代工中樞", sub: "先進製程 · 成熟製程 · ADR" },
      { x: 734, title: "③ IC 設計與 AI 晶片", sub: "Fabless · ASIC · 委外投片" },
      { x: 1066, title: "④ 封裝測試與費半", sub: "先進封裝 · 高階測試 · SOX" },
    ];

    const edgeColors = {
      supply: "#fbbf24",
      mfg: "#38bdf8",
      sync: "#a78bfa",
    };

    let svg = `
      <svg class="supply-svg" viewBox="0 0 1190 618" role="img" aria-label="半導體供應鏈關係圖">
        <defs>
          <marker id="arrow-supply" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#fbbf24" />
          </marker>
          <marker id="arrow-mfg" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#38bdf8" />
          </marker>
          <marker id="arrow-sync" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#a78bfa" />
          </marker>
          <filter id="hub-glow" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <!-- 欄位背景分隔與標題 -->
        <rect x="12"  y="10" width="206" height="596" rx="14" fill="rgba(15,23,42,0.42)" stroke="rgba(251,191,36,0.14)" />
        <rect x="302" y="10" width="236" height="596" rx="14" fill="rgba(15,23,42,0.5)" stroke="rgba(56,189,248,0.22)" />
        <rect x="626" y="10" width="216" height="596" rx="14" fill="rgba(15,23,42,0.42)" stroke="rgba(56,189,248,0.14)" />
        <rect x="952" y="10" width="226" height="596" rx="14" fill="rgba(15,23,42,0.42)" stroke="rgba(167,139,250,0.16)" />
    `;

    colHeaders.forEach((h) => {
      svg += `
        <text x="${h.x}" y="596" text-anchor="middle" fill="#94a3b8" font-size="11.5" font-weight="700" font-family="Inter, Noto Sans TC, sans-serif">${h.title}</text>
      `;
    });

    // 先繪製未選中連線，再繪製高亮相鄰連線
    const orderedEdges = [
      ...EDGES.filter((e) => !isEdgeHighlighted(e)),
      ...EDGES.filter((e) => isEdgeHighlighted(e)),
    ];

    orderedEdges.forEach((e) => {
      const hi = isEdgeHighlighted(e);
      const color = edgeColors[e.type];
      const dash = e.type === "sync" ? 'stroke-dasharray="5,4"' : e.type === "supply" ? 'stroke-dasharray="7,3"' : "";
      const opacity = hi ? (activeFocusId ? 0.95 : 0.62) : 0.09;
      const width = hi && activeFocusId ? 2.4 : 1.55;
      const markerEnd = e.type === "sync" ? `marker-end="url(#arrow-sync)" marker-start="url(#arrow-sync)"` : `marker-end="url(#arrow-${e.type})"`;
      const pathD = buildPath(e);
      svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" ${dash} ${hi ? markerEnd : ""} />`;
    });

    // 繪製個股節點
    Object.entries(NODES).forEach(([id, pos]) => {
      const s = stocksById.get(id);
      if (!s) return;
      const hi = isNodeHighlighted(id);
      const isFocused = activeFocusId === id;
      const pct = s.latest.change_pct;
      const isUp = pct > 0;
      const isDown = pct < 0;
      const pctColor = isUp ? "#ff4d5a" : isDown ? "#00d084" : "#94a3b8";
      const borderStroke = isFocused
        ? "#ffffff"
        : pos.hub
        ? "#38bdf8"
        : isUp
        ? "rgba(255,77,90,0.55)"
        : isDown
        ? "rgba(0,208,132,0.55)"
        : "rgba(56,189,248,0.3)";
      const fillBg = isFocused
        ? "rgba(30, 58, 138, 0.92)"
        : pos.hub
        ? "rgba(12, 34, 64, 0.95)"
        : "rgba(11, 18, 34, 0.94)";

      const shortName = s.name.split(" ")[0];
      const priceTxt = `${fmtPrice(s.latest.close, s)} ${s.currency === "TWD" ? "" : s.currency}`.trim();

      svg += `
        <g class="sg-node" data-node-id="${id}" style="cursor:pointer;opacity:${hi ? 1 : 0.22};transition:opacity 0.2s">
          <rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="${pos.hub ? 14 : 10}"
                fill="${fillBg}" stroke="${borderStroke}" stroke-width="${isFocused ? 2.5 : pos.hub ? 2 : 1.3}" />
          <text x="${pos.x + 12}" y="${pos.y + 21}" fill="#f8fafc" font-size="${pos.hub ? 14 : 13}" font-weight="800" font-family="Inter, Noto Sans TC, sans-serif">
            ${shortName} <tspan fill="#38bdf8" font-size="11.5" font-family="JetBrains Mono, Consolas, monospace">${id}</tspan>
          </text>
          <text x="${pos.x + 12}" y="${pos.y + 39}" fill="#94a3b8" font-size="10.2" font-family="Inter, Noto Sans TC, sans-serif">
            ${pos.role}
          </text>
          <text x="${pos.x + 12}" y="${pos.y + pos.h - 10}" fill="#cbd5e1" font-size="11.5" font-weight="700" font-family="JetBrains Mono, Consolas, monospace">
            ${priceTxt}
          </text>
          <text x="${pos.x + pos.w - 11}" y="${pos.y + pos.h - 10}" text-anchor="end" fill="${pctColor}" font-size="11.5" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">
            ${fmtPct(pct)}
          </text>
        </g>
      `;
    });

    svg += `</svg>`;

    const presetButtons = Object.entries(PRESETS)
      .map(
        ([k, v]) =>
          `<button class="seg-pill ${!activeFocusId && activePreset === k ? "active" : ""}" data-sg-preset="${k}">${v.label}</button>`
      )
      .join("");

    containerEl.innerHTML = `
      <div class="sg-toolbar">
        <div class="sg-presets">${presetButtons}
          ${activeFocusId ? `<button class="seg-pill" id="sgClearFocusBtn" style="border-color:var(--amber);color:var(--amber)">✕ 清除鎖定 (${activeFocusId})</button>` : ""}
        </div>
        <div class="sg-legend">
          <span><i class="lg-line" style="background:#38bdf8"></i> 委外投片 / 封測流</span>
          <span><i class="lg-line lg-dash" style="border-color:#fbbf24"></i> 設備 / 矽晶圓 / HBM 供應</span>
          <span><i class="lg-line lg-dot" style="border-color:#a78bfa"></i> 台美雙向連動</span>
        </div>
      </div>
      <div class="sg-canvas-scroll">${svg}</div>
    `;

    // 綁定預設視角按鈕
    containerEl.querySelectorAll("[data-sg-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFocusId = null;
        activePreset = btn.dataset.sgPreset;
        render(containerEl, inspectorEl, stocksById, onSelectStock);
      });
    });

    const clrBtn = containerEl.querySelector("#sgClearFocusBtn");
    if (clrBtn) {
      clrBtn.addEventListener("click", () => {
        activeFocusId = null;
        render(containerEl, inspectorEl, stocksById, onSelectStock);
      });
    }

    // 綁定節點點擊鎖定與雙擊跳轉
    containerEl.querySelectorAll(".sg-node").forEach((g) => {
      g.addEventListener("click", () => {
        const nid = g.dataset.nodeId;
        activeFocusId = activeFocusId === nid ? null : nid;
        render(containerEl, inspectorEl, stocksById, onSelectStock);
      });
      g.addEventListener("dblclick", () => {
        onSelectStock(g.dataset.nodeId);
      });
    });

    // 更新下方關係解說列
    if (inspectorEl) {
      if (!activeFocusId) {
        inspectorEl.innerHTML = `
          <span style="color:var(--text-muted)">💡 <strong>互動操作提示：</strong>點擊圖中任一公司方框即可鎖定並亮顯其上下游供應鏈關係；雙擊或點擊右側按鈕可跳轉至個股 K 線分析。</span>
        `;
      } else {
        const s = stocksById.get(activeFocusId);
        const rels = EDGES.filter((e) => e.from === activeFocusId || e.to === activeFocusId);
        const itemsHtml = rels
          .map((e) => {
            const partnerId = e.from === activeFocusId ? e.to : e.from;
            const partner = stocksById.get(partnerId);
            const arrow = e.type === "sync" ? "⇄" : e.from === activeFocusId ? "→" : "←";
            const partnerName = partner ? `${partner.name.split(" ")[0]} (${partnerId})` : partnerId;
            return `<div class="sg-rel-item"><span class="mono" style="color:var(--cyan);font-weight:700">${arrow} ${partnerName}</span>：${e.label}</div>`;
          })
          .join("");

        inspectorEl.innerHTML = `
          <div class="sg-inspector-head">
            <div>
              <strong style="font-size:0.95rem">${s.name} (${s.id})</strong>
              <span style="color:var(--text-muted);font-size:0.8rem;margin-left:8px">${NODES[activeFocusId].role}</span>
            </div>
            <button class="btn btn-primary" id="sgJumpStockBtn" style="padding:5px 12px;font-size:0.78rem">查看 ${s.id} K 線與技術指標 →</button>
          </div>
          <div class="sg-rel-grid">${itemsHtml}</div>
        `;
        const jumpBtn = inspectorEl.querySelector("#sgJumpStockBtn");
        if (jumpBtn) jumpBtn.addEventListener("click", () => onSelectStock(activeFocusId));
      }
    }
  }

  return { render };
})();
