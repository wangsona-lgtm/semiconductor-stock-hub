/**
 * SEMI·PULSE 台美日韓半導體供應鏈互動關係圖引擎 (SVG Topology Graph)
 * 呈現：歐美日台設備材料 & 韓美 HBM -> 台美韓晶圓代工核心 <-> 美台 IC 設計 -> 台日封裝測試與費半連動
 */
window.SemiSupplyGraph = (function () {
  const NODES = {
    // Col 1: 設備、矽晶圓、化學材料與 HBM 記憶體 (x = 24, w = 196)
    ASML:        { x: 24,  y: 28,  w: 196, h: 62, col: 1, role: "EUV 微影曝光機獨家設備" },
    "8035.T":    { x: 24,  y: 104, w: 196, h: 62, col: 1, role: "塗佈顯影 / 蝕刻設備龍頭" },
    "6146.T":    { x: 24,  y: 180, w: 196, h: 62, col: 1, role: "CoWoS / HBM 晶圓切割研磨" },
    "3131":      { x: 24,  y: 256, w: 196, h: 62, col: 1, role: "CoWoS 濕製程先進封裝設備" },
    "4063.T":    { x: 24,  y: 332, w: 196, h: 62, col: 1, role: "12吋矽晶圓與 EUV 光阻龍頭" },
    "6488":      { x: 24,  y: 408, w: 196, h: 62, col: 1, role: "12吋半導體矽晶圓材料" },
    "000660.KS": { x: 24,  y: 484, w: 196, h: 62, col: 1, role: "全球 HBM3E 市占第一霸主" },
    MU:          { x: 24,  y: 560, w: 196, h: 62, col: 1, role: "HBM3E 與 DRAM 指標廠" },

    // Col 2: 晶圓代工中樞、三星 IDM 與 Intel (x = 344)
    TSM:         { x: 344, y: 44,  w: 192, h: 64, col: 2, role: "台積電美股 ADR 定價指標" },
    "2330":      { x: 334, y: 160, w: 212, h: 88, col: 2, role: "全球先進製程與 CoWoS 核心中樞", hub: true },
    "005930.KS": { x: 344, y: 304, w: 192, h: 68, col: 2, role: "DRAM/HBM 與 GAA 先進代工" },
    INTC:        { x: 344, y: 420, w: 192, h: 68, col: 2, role: "x86 處理器與 IDM 晶圓代工" },
    "2303":      { x: 344, y: 536, w: 192, h: 66, col: 2, role: "成熟與特殊製程晶圓代工" },

    // Col 3: 美台 IC 設計與 AI 晶片大廠 (x = 674)
    NVDA:        { x: 674, y: 32,  w: 188, h: 64, col: 3, role: "AI GPU 與加速運算龍頭" },
    AMD:         { x: 674, y: 114, w: 188, h: 64, col: 3, role: "資料中心 CPU / Instinct GPU" },
    AVGO:        { x: 674, y: 196, w: 188, h: 64, col: 3, role: "AI ASIC 與高速網通晶片" },
    "3661":      { x: 674, y: 278, w: 188, h: 64, col: 3, role: "雲端 AI ASIC 客製設計服務" },
    "3443":      { x: 674, y: 360, w: 188, h: 64, col: 3, role: "台積電轉投資 ASIC / IP" },
    "2454":      { x: 674, y: 442, w: 188, h: 64, col: 3, role: "旗艦手機 SoC 與邊緣 AI" },
    "2379":      { x: 674, y: 524, w: 188, h: 64, col: 3, role: "高速網通與 Wi-Fi 7 IC" },

    // Col 4: 封裝 / 測試設備 / 測試代工與費半 (x = 998)
    "^SOX":      { x: 998, y: 54,  w: 210, h: 68, col: 4, role: "費城半導體景氣總指標" },
    "3711":      { x: 998, y: 198, w: 210, h: 74, col: 4, role: "全球最大封測與 CoWoS 外溢" },
    "6857.T":    { x: 998, y: 344, w: 210, h: 74, col: 4, role: "AI GPU / HBM 自動測試機台" },
    "2449":      { x: 998, y: 490, w: 210, h: 74, col: 4, role: "AI GPU / ASIC 高階測試核心" },
  };

  // type: 'supply' (設備材料/HBM/測試機供應), 'mfg' (投片代工/封測流), 'sync' (資本連動與競爭)
  const EDGES = [
    // 歐美日台設備與材料 -> 晶圓製造 / 封測
    { from: "ASML",      to: "2330",      type: "supply", label: "供應 EUV 極紫外光微影設備（3nm/2nm 關鍵）" },
    { from: "ASML",      to: "005930.KS", type: "supply", label: "供應先進製程 EUV 微影曝光設備" },
    { from: "ASML",      to: "INTC",      type: "supply", label: "供應 High-NA EUV 新世代微影曝光設備（18A/14A）" },
    { from: "8035.T",    to: "2330",      type: "supply", label: "日本東京威力科創供應塗佈顯影（Coater/Developer）與蝕刻機台" },
    { from: "8035.T",    to: "005930.KS", type: "supply", label: "供應先進製程與高階 DRAM 蝕刻與成膜設備" },
    { from: "8035.T",    to: "INTC",      type: "supply", label: "供應先進晶圓製造關鍵前段設備" },
    { from: "6146.T",    to: "2330",      type: "supply", label: "日本 DISCO 供應 CoWoS / 3D IC 晶圓薄化與切割機台" },
    { from: "6146.T",    to: "000660.KS", type: "supply", label: "供應 HBM 堆疊晶圓超薄研磨與切割設備" },
    { from: "6146.T",    to: "3711",      type: "supply", label: "供應高階封測晶圓切割研磨機台", arcY: 16 },
    { from: "3131",      to: "2330",      type: "supply", label: "供應 CoWoS 先進封裝濕製程清洗設備" },
    { from: "3131",      to: "3711",      type: "supply", label: "供應高階封測濕製程設備", arcY: 646 },
    { from: "4063.T",    to: "2330",      type: "supply", label: "日本信越化學供應 12 吋晶圓與 EUV 先進光阻劑" },
    { from: "4063.T",    to: "005930.KS", type: "supply", label: "供應先進製程光阻劑與 12 吋矽晶圓" },
    { from: "6488",      to: "2330",      type: "supply", label: "供應 12 吋拋光與磊晶矽晶圓" },
    { from: "6488",      to: "INTC",      type: "supply", label: "供應 12 吋晶圓製造用半導體矽晶圓" },
    { from: "6488",      to: "2303",      type: "supply", label: "供應成熟與特殊製程矽晶圓" },

    // 韓美 HBM 記憶體 -> CoWoS & AI GPU
    { from: "000660.KS", to: "2330",      type: "supply", label: "HBM3E 記憶體交由台積電 CoWoS 先進封裝整合" },
    { from: "000660.KS", to: "NVDA",      type: "supply", label: "NVIDIA AI GPU 頭號 HBM3 / HBM3E 供應商", arcY: 12 },
    { from: "MU",        to: "2330",      type: "supply", label: "HBM3E 記憶體堆疊進入台積電 CoWoS 封裝" },
    { from: "MU",        to: "NVDA",      type: "supply", label: "供應 HBM3E 高頻寬記憶體至 AI GPU 平台", arcY: 662 },

    // IC 設計 -> 晶圓代工 (委外製造)
    { from: "NVDA",      to: "2330",      type: "mfg",    label: "4nm/3nm AI GPU 晶圓代工與 CoWoS 先進封裝主力客戶" },
    { from: "AMD",       to: "2330",      type: "mfg",    label: "EPYC / Instinct 晶片先進製程代工" },
    { from: "AVGO",      to: "2330",      type: "mfg",    label: "客製化 AI ASIC 與網通晶片投片代工" },
    { from: "3661",      to: "2330",      type: "mfg",    label: "北美雲端大廠 AI ASIC 先進製程與 CoWoS 投片" },
    { from: "3443",      to: "2330",      type: "mfg",    label: "台積電轉投資，深化 HBM/CoWoS ASIC 設計服務" },
    { from: "2454",      to: "2330",      type: "mfg",    label: "天璣旗艦手機晶片 3nm/4nm 投片代工" },
    { from: "2379",      to: "2330",      type: "mfg",    label: "高階網通與高速傳輸控制晶片投片" },
    { from: "2379",      to: "2303",      type: "mfg",    label: "成熟製程網通與週邊晶片晶圓代工" },

    // 晶圓代工 / IC 設計 / 日本測試設備 -> 封裝測試
    { from: "2330",      to: "3711",      type: "mfg",    label: "CoWoS 先進封裝產能外溢與 oS 端封裝合作", arcY: 146 },
    { from: "6857.T",    to: "2449",      type: "supply", label: "日本愛德萬提供 AI GPU/ASIC 自動測試機台（SoC Tester）" },
    { from: "6857.T",    to: "3711",      type: "supply", label: "提供高階封測與系統級測試設備" },
    { from: "NVDA",      to: "6857.T",    type: "mfg",    label: "Blackwell / Rubin 高複雜度 GPU 拉動測試機台需求" },
    { from: "NVDA",      to: "2449",      type: "mfg",    label: "AI GPU 晶圓測試與成品測試核心夥伴" },
    { from: "AMD",       to: "3711",      type: "mfg",    label: "高階運算晶片委外封裝測試" },
    { from: "AVGO",      to: "3711",      type: "mfg",    label: "網通與客製化晶片高階封測" },
    { from: "3661",      to: "2449",      type: "mfg",    label: "AI ASIC 晶片高階晶圓/成品測試" },
    { from: "3443",      to: "3711",      type: "mfg",    label: "ASIC 與系統級封裝測試夥伴" },
    { from: "2454",      to: "3711",      type: "mfg",    label: "手機 SoC 主力封裝測試合作廠" },
    { from: "2454",      to: "2449",      type: "mfg",    label: "手機與 AI 晶片測試夥伴" },
    { from: "2379",      to: "3711",      type: "mfg",    label: "網通 IC 封裝測試合作" },

    // 台美韓日市場連動 / 競爭關係
    { from: "INTC",      to: "2330",      type: "mfg",    label: "部分高階運算 Tile 委由台積電代工，並與台積電於晶圓代工競爭" },
    { from: "005930.KS", to: "2330",      type: "sync",   label: "先進製程晶圓代工（2nm/3nm GAA vs N2/N3）直接競爭對手" },
    { from: "005930.KS", to: "000660.KS", type: "sync",   label: "韓國記憶體雙雄，共同主導全球 HBM 與 DRAM 報價週期" },
    { from: "INTC",      to: "AMD",       type: "sync",   label: "x86 伺服器與桌機處理器直接競爭，市占消長連動股價" },
    { from: "2330",      to: "TSM",       type: "sync",   label: "台股現貨與美國 ADR (1 ADR = 5 股) 溢折價即時連動" },
    { from: "TSM",       to: "^SOX",      type: "sync",   label: "台積電 ADR 為費城半導體指數關鍵權值成分", arcY: 22 },
    { from: "NVDA",      to: "^SOX",      type: "sync",   label: "AI GPU 龍頭帶動費半指數多空走勢" },
  ];

  const PRESETS = {
    all: { label: "台美日韓全景", ids: null },
    ai: {
      label: "AI 伺服器與 HBM 鏈",
      ids: new Set(["NVDA", "AVGO", "3661", "3443", "2330", "TSM", "000660.KS", "MU", "8035.T", "6857.T", "6146.T", "3131", "ASML", "2449", "3711"]),
    },
    jp_kr: {
      label: "日韓設備與記憶體鏈",
      ids: new Set(["8035.T", "6857.T", "4063.T", "6146.T", "005930.KS", "000660.KS", "2330", "6488", "2449", "3711", "NVDA"]),
    },
    mobile: {
      label: "手機與網通 IC 鏈",
      ids: new Set(["2454", "2379", "2330", "2303", "6488", "4063.T", "3711", "2449"]),
    },
    sync: {
      label: "全球半導體龍頭對比",
      ids: new Set(["^SOX", "TSM", "2330", "NVDA", "AMD", "INTC", "AVGO", "ASML", "8035.T", "6857.T", "005930.KS", "000660.KS", "MU"]),
    },
  };

  const MKT_BADGE = {
    TW: { text: "TW", bg: "rgba(56,189,248,0.18)", fg: "#38bdf8" },
    US: { text: "US", bg: "rgba(167,139,250,0.18)", fg: "#c4b5fd" },
    JP: { text: "JP", bg: "rgba(244,114,182,0.18)", fg: "#f9a8d4" },
    KR: { text: "KR", bg: "rgba(251,191,36,0.18)", fg: "#fde047" },
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
    if (s.currency === "JPY" || s.currency === "KRW") {
      return Math.round(n).toLocaleString("en-US");
    }
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

    if (a.col === b.col) {
      const x = ax;
      const y1 = ay > by ? a.y : a.y + a.h;
      const y2 = ay > by ? b.y + b.h : b.y;
      return `M ${x} ${y1} L ${x} ${y2}`;
    }

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
      { x: 122, title: "① 設備・材料・HBM (荷/日/台/韓/美)" },
      { x: 440, title: "② 晶圓代工中樞與 IDM (台/韓/美)" },
      { x: 768, title: "③ IC 設計與 AI 晶片 (美/台)" },
      { x: 1103, title: "④ 封測・測試設備與費半 (台/日/美)" },
    ];

    const edgeColors = {
      supply: "#fbbf24",
      mfg: "#38bdf8",
      sync: "#a78bfa",
    };

    let svg = `
      <svg class="supply-svg" viewBox="0 0 1236 686" role="img" aria-label="台美日韓半導體供應鏈關係圖">
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
        </defs>

        <rect x="10"  y="10" width="224" height="664" rx="14" fill="rgba(15,23,42,0.42)" stroke="rgba(251,191,36,0.14)" />
        <rect x="318" y="10" width="244" height="664" rx="14" fill="rgba(15,23,42,0.5)" stroke="rgba(56,189,248,0.22)" />
        <rect x="654" y="10" width="228" height="664" rx="14" fill="rgba(15,23,42,0.42)" stroke="rgba(56,189,248,0.14)" />
        <rect x="978" y="10" width="248" height="664" rx="14" fill="rgba(15,23,42,0.42)" stroke="rgba(167,139,250,0.16)" />
    `;

    colHeaders.forEach((h) => {
      svg += `<text x="${h.x}" y="660" text-anchor="middle" fill="#94a3b8" font-size="11.5" font-weight="700" font-family="Inter, Noto Sans TC, sans-serif">${h.title}</text>`;
    });

    const orderedEdges = [
      ...EDGES.filter((e) => !isEdgeHighlighted(e)),
      ...EDGES.filter((e) => isEdgeHighlighted(e)),
    ];

    orderedEdges.forEach((e) => {
      const hi = isEdgeHighlighted(e);
      const color = edgeColors[e.type];
      const dash = e.type === "sync" ? 'stroke-dasharray="5,4"' : e.type === "supply" ? 'stroke-dasharray="7,3"' : "";
      const opacity = hi ? (activeFocusId ? 0.95 : 0.6) : 0.08;
      const width = hi && activeFocusId ? 2.3 : 1.5;
      const markerEnd = e.type === "sync" ? `marker-end="url(#arrow-sync)" marker-start="url(#arrow-sync)"` : `marker-end="url(#arrow-${e.type})"`;
      const pathD = buildPath(e);
      svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" ${dash} ${hi ? markerEnd : ""} />`;
    });

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
        ? "rgba(30, 58, 138, 0.94)"
        : pos.hub
        ? "rgba(12, 34, 64, 0.96)"
        : "rgba(11, 18, 34, 0.94)";

      const shortName = s.name.split(" ")[0];
      const priceTxt = `${fmtPrice(s.latest.close, s)} ${s.currency === "TWD" ? "" : s.currency}`.trim();
      const mb = MKT_BADGE[s.market] || MKT_BADGE.US;

      svg += `
        <g class="sg-node" data-node-id="${id}" style="cursor:pointer;opacity:${hi ? 1 : 0.2};transition:opacity 0.2s">
          <rect x="${pos.x}" y="${pos.y}" width="${pos.w}" height="${pos.h}" rx="${pos.hub ? 14 : 10}"
                fill="${fillBg}" stroke="${borderStroke}" stroke-width="${isFocused ? 2.5 : pos.hub ? 2 : 1.3}" />
          <rect x="${pos.x + pos.w - 32}" y="${pos.y + 8}" width="24" height="15" rx="4" fill="${mb.bg}" />
          <text x="${pos.x + pos.w - 20}" y="${pos.y + 18.5}" text-anchor="middle" fill="${mb.fg}" font-size="9" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">${mb.text}</text>
          <text x="${pos.x + 11}" y="${pos.y + 20}" fill="#f8fafc" font-size="${pos.hub ? 14 : 12.5}" font-weight="800" font-family="Inter, Noto Sans TC, sans-serif">
            ${shortName} <tspan fill="#38bdf8" font-size="10.5" font-family="JetBrains Mono, Consolas, monospace">${id}</tspan>
          </text>
          <text x="${pos.x + 11}" y="${pos.y + 37}" fill="#94a3b8" font-size="10" font-family="Inter, Noto Sans TC, sans-serif">
            ${pos.role}
          </text>
          <text x="${pos.x + 11}" y="${pos.y + pos.h - 9}" fill="#cbd5e1" font-size="11" font-weight="700" font-family="JetBrains Mono, Consolas, monospace">
            ${priceTxt}
          </text>
          <text x="${pos.x + pos.w - 10}" y="${pos.y + pos.h - 9}" text-anchor="end" fill="${pctColor}" font-size="11" font-weight="800" font-family="JetBrains Mono, Consolas, monospace">
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
          <span><i class="lg-line lg-dash" style="border-color:#fbbf24"></i> 設備 / 矽晶圓 / HBM / 測試機供應</span>
          <span><i class="lg-line lg-dot" style="border-color:#a78bfa"></i> 市場連動 / 競爭對手</span>
        </div>
      </div>
      <div class="sg-canvas-scroll">${svg}</div>
    `;

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

    if (inspectorEl) {
      if (!activeFocusId) {
        inspectorEl.innerHTML = `
          <span style="color:var(--text-muted)">💡 <strong>台美日韓互動關係圖：</strong>點擊任一公司方框即可亮顯其上下游供應鏈與競爭連動關係（如點擊 <strong class="mono" style="color:#fde047">000660.KS 海力士</strong>、<strong class="mono" style="color:#f9a8d4">8035.T 東京威力科創</strong> 或 <strong class="mono" style="color:#38bdf8">2330 台積電</strong>）；雙擊可跳轉個股 K 線。</span>
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
