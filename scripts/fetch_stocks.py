#!/usr/bin/env python3
"""
SEMI·PULSE 半導體股票資料擷取與技術指標計算腳本
資料來源:
  - 臺灣證券交易所 (TWSE): BWIBBU_ALL (本益比/殖利率/股價淨值比), STOCK_DAY (備援行情)
  - 櫃買中心 (TPEx): tpex_mainboard_peratio_analysis (上櫃估值)
  - Yahoo Finance: v8/finance/chart (台美股 1 年日 K 線 OHLCV), v7/finance/quote (美股估值)

輸出:
  - data/stocks.json
  - data/stocks.js (供本機 file:// 開啟時免 CORS 讀取)
"""

from __future__ import annotations

import datetime
import http.cookiejar
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT_DIR / "config" / "stocks_config.json"
DATA_DIR = ROOT_DIR / "data"
JSON_OUT_PATH = DATA_DIR / "stocks.json"
JS_OUT_PATH = DATA_DIR / "stocks.js"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def parse_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        if math.isnan(val) or math.isinf(val):
            return None
        return float(val)
    s = str(val).replace(",", "").replace("%", "").replace("+", "").strip()
    if not s or s in {"-", "--", "N/A", "null", "None", "X"}:
        return None
    try:
        num = float(s)
        if math.isnan(num) or math.isinf(num):
            return None
        return num
    except ValueError:
        return None


def http_get_json(url: str, opener: Optional[urllib.request.OpenerDirector] = None, timeout: int = 20) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )
    if opener is not None:
        with opener.open(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    else:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def fetch_twse_valuations() -> Dict[str, Dict[str, Optional[float]]]:
    """從 TWSE BWIBBU_ALL 取得上市個股本益比、殖利率、股價淨值比"""
    url = "https://www.twse.com.tw/exchangeReport/BWIBBU_ALL?response=json"
    result: Dict[str, Dict[str, Optional[float]]] = {}
    try:
        data = http_get_json(url)
        val_date = str(data.get("date", ""))
        if len(val_date) == 8:
            val_date = f"{val_date[:4]}-{val_date[4:6]}-{val_date[6:]}"
        for row in data.get("data", []):
            if len(row) >= 5:
                code = str(row[0]).strip()
                result[code] = {
                    "pe": parse_float(row[2]),
                    "dividend_yield": parse_float(row[3]),
                    "pb": parse_float(row[4]),
                    "valuation_date": val_date or None,
                }
        print(f"[OK] TWSE BWIBBU_ALL 載入 {len(result)} 檔估值資料")
    except Exception as e:
        print(f"[WARN] TWSE BWIBBU_ALL 讀取失敗: {e}")
    return result


def fetch_tpex_valuations() -> Dict[str, Dict[str, Optional[float]]]:
    """從 TPEx OpenAPI 取得上櫃個股本益比、殖利率、股價淨值比"""
    url = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis"
    result: Dict[str, Dict[str, Optional[float]]] = {}
    try:
        rows = http_get_json(url)
        for row in rows:
            code = str(row.get("SecuritiesCompanyCode", "")).strip()
            if not code:
                continue
            raw_date = str(row.get("Date", "")).strip()
            val_date = None
            if len(raw_date) == 7 and raw_date.isdigit():
                ad_year = int(raw_date[:3]) + 1911
                val_date = f"{ad_year}-{raw_date[3:5]}-{raw_date[5:7]}"
            result[code] = {
                "pe": parse_float(row.get("PriceEarningRatio")),
                "dividend_yield": parse_float(row.get("YieldRatio")),
                "pb": parse_float(row.get("PriceBookRatio")),
                "valuation_date": val_date,
            }
        print(f"[OK] TPEx PER API 載入 {len(result)} 檔估值資料")
    except Exception as e:
        print(f"[WARN] TPEx PER API 讀取失敗: {e}")
    return result


def create_yahoo_session() -> Tuple[urllib.request.OpenerDirector, Optional[str]]:
    """建立帶有 cookie 與 crumb 的 Yahoo Finance session"""
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    opener.addheaders = [("User-Agent", USER_AGENT)]
    try:
        try:
            opener.open("https://fc.yahoo.com", timeout=10).read()
        except Exception:
            pass
        with opener.open("https://query1.finance.yahoo.com/v1/test/getcrumb", timeout=10) as resp:
            crumb = resp.read().decode("utf-8").strip()
            if crumb:
                print(f"[OK] Yahoo Finance crumb 取得成功")
                return opener, crumb
    except Exception as e:
        print(f"[WARN] Yahoo Finance crumb 取得失敗: {e}")
    return opener, None


def fetch_yahoo_quotes(
    symbols: List[str], opener: urllib.request.OpenerDirector, crumb: Optional[str]
) -> Dict[str, Dict[str, Any]]:
    """批次從 Yahoo v7/finance/quote 取得估值與市值"""
    if not crumb or not symbols:
        return {}
    encoded_syms = urllib.parse.quote(",".join(symbols), safe=",")
    encoded_crumb = urllib.parse.quote(crumb, safe="")
    url = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={encoded_syms}&crumb={encoded_crumb}"
    result: Dict[str, Dict[str, Any]] = {}
    try:
        payload = http_get_json(url, opener=opener)
        for item in payload.get("quoteResponse", {}).get("result", []):
            sym = item.get("symbol")
            if not sym:
                continue
            currency = item.get("currency")
            fin_currency = item.get("financialCurrency")
            pb = parse_float(item.get("priceToBook"))
            # 針對 ADR 或異幣別財報（如 ASML 歐元財報 / TSM 台幣財報），Yahoo priceToBook 可能出現幣別錯配失真
            if pb is not None and fin_currency and currency and fin_currency != currency and pb > 60:
                pb = None

            div_yield_raw = parse_float(item.get("trailingAnnualDividendYield"))
            div_yield_pct = round(div_yield_raw * 100, 2) if div_yield_raw is not None else None

            result[sym] = {
                "pe": round(parse_float(item.get("trailingPE")), 2) if parse_float(item.get("trailingPE")) else None,
                "forward_pe": round(parse_float(item.get("forwardPE")), 2) if parse_float(item.get("forwardPE")) else None,
                "pb": round(pb, 2) if pb is not None else None,
                "dividend_yield": div_yield_pct,
                "market_cap": parse_float(item.get("marketCap")),
                "currency": currency,
                "fifty_two_week_high": parse_float(item.get("fiftyTwoWeekHigh")),
                "fifty_two_week_low": parse_float(item.get("fiftyTwoWeekLow")),
            }
        print(f"[OK] Yahoo v7 quote 載入 {len(result)} 檔報價與估值")
    except Exception as e:
        print(f"[WARN] Yahoo v7 quote 讀取失敗: {e}")
    return result


def fetch_yahoo_history(
    symbol: str, market: str, opener: urllib.request.OpenerDirector
) -> List[Dict[str, Any]]:
    """從 Yahoo Finance v8/finance/chart 取得 1 年日 K 線資料"""
    encoded_sym = urllib.parse.quote(symbol, safe="")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded_sym}?range=1y&interval=1d"
    payload = http_get_json(url, opener=opener)
    res_list = payload.get("chart", {}).get("result")
    if not res_list:
        raise ValueError(f"{symbol} 無 chart 資料")

    res = res_list[0]
    timestamps = res.get("timestamp") or []
    quote = (res.get("indicators", {}).get("quote") or [{}])[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []

    tz_hours = 8 if market == "TW" else (9 if market in ("JP", "KR") else -5)
    tz_offset = datetime.timedelta(hours=tz_hours)
    tz = datetime.timezone(tz_offset)

    by_date: Dict[str, Dict[str, Any]] = {}
    for i, ts in enumerate(timestamps):
        c = parse_float(closes[i] if i < len(closes) else None)
        if c is None or c <= 0:
            continue
        o = parse_float(opens[i] if i < len(opens) else None) or c
        h = parse_float(highs[i] if i < len(highs) else None) or max(o, c)
        l = parse_float(lows[i] if i < len(lows) else None) or min(o, c)
        v = parse_float(volumes[i] if i < len(volumes) else None) or 0.0

        dt = datetime.datetime.fromtimestamp(ts, tz=tz).strftime("%Y-%m-%d")
        by_date[dt] = {
            "d": dt,
            "o": round(o, 2),
            "h": round(h, 2),
            "l": round(l, 2),
            "c": round(c, 2),
            "v": int(round(v)),
        }

    history = [by_date[k] for k in sorted(by_date.keys())]
    return history


def compute_sma(values: List[float], period: int) -> List[Optional[float]]:
    out: List[Optional[float]] = []
    running = 0.0
    for i, val in enumerate(values):
        running += val
        if i >= period:
            running -= values[i - period]
        if i >= period - 1:
            out.append(running / period)
        else:
            out.append(None)
    return out


def compute_ema(values: List[float], period: int) -> List[float]:
    if not values:
        return []
    k = 2.0 / (period + 1)
    out = [values[0]]
    for val in values[1:]:
        out.append(val * k + out[-1] * (1.0 - k))
    return out


def compute_rsi(closes: List[float], period: int = 14) -> List[Optional[float]]:
    if len(closes) <= period:
        return [None] * len(closes)
    out: List[Optional[float]] = [None] * len(closes)
    gains = []
    losses = []
    for i in range(1, period + 1):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0.0))
        losses.append(max(-diff, 0.0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period

    def to_rsi(ag: float, al: float) -> float:
        if al == 0:
            return 100.0 if ag > 0 else 50.0
        rs = ag / al
        return 100.0 - (100.0 / (1.0 + rs))

    out[period] = to_rsi(avg_gain, avg_loss)
    for i in range(period + 1, len(closes)):
        diff = closes[i] - closes[i - 1]
        gain = max(diff, 0.0)
        loss = max(-diff, 0.0)
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        out[i] = to_rsi(avg_gain, avg_loss)
    return out


def pct_return(closes: List[float], lookback: int) -> Optional[float]:
    if len(closes) <= lookback:
        return None
    prev = closes[-1 - lookback]
    if not prev:
        return None
    return round(((closes[-1] - prev) / prev) * 100.0, 2)


def analyze_stock(history: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Dict[str, str]]]:
    closes = [row["c"] for row in history]
    volumes = [row["v"] for row in history]

    ma5 = compute_sma(closes, 5)
    ma20 = compute_sma(closes, 20)
    ma60 = compute_sma(closes, 60)
    rsi14 = compute_rsi(closes, 14)

    ema12 = compute_ema(closes, 12)
    ema26 = compute_ema(closes, 26)
    dif = [a - b for a, b in zip(ema12, ema26)]
    dea = compute_ema(dif, 9)
    hist = [d - s for d, s in zip(dif, dea)]

    # 近 6 個月 (約 126 個交易日) 高低與最大回撤
    window_6m = history[-126:] if len(history) >= 126 else history
    high_6m = max(r["h"] for r in window_6m)
    low_6m = min(r["l"] for r in window_6m)

    peak = window_6m[0]["c"]
    max_dd = 0.0
    for r in window_6m:
        if r["c"] > peak:
            peak = r["c"]
        dd = (r["c"] - peak) / peak * 100.0
        if dd < max_dd:
            max_dd = dd

    # 近 20 日年化波動率
    vol_20d = None
    if len(closes) >= 21:
        rets = [(closes[i] / closes[i - 1] - 1.0) for i in range(len(closes) - 20, len(closes)) if closes[i - 1] > 0]
        if len(rets) > 1:
            mean_r = sum(rets) / len(rets)
            var_r = sum((r - mean_r) ** 2 for r in rets) / (len(rets) - 1)
            vol_20d = round(math.sqrt(var_r) * math.sqrt(252) * 100.0, 2)

    recent_vols = [v for v in volumes[-20:] if v > 0]
    avg_vol_20d = int(round(sum(recent_vols) / len(recent_vols))) if recent_vols else 0

    latest_c = closes[-1]
    latest_ma5 = round(ma5[-1], 2) if ma5[-1] is not None else None
    latest_ma20 = round(ma20[-1], 2) if ma20[-1] is not None else None
    latest_ma60 = round(ma60[-1], 2) if ma60[-1] is not None else None
    latest_rsi = round(rsi14[-1], 2) if rsi14[-1] is not None else None
    latest_dif = round(dif[-1], 3) if dif else None
    latest_dea = round(dea[-1], 3) if dea else None
    latest_hist = round(hist[-1], 3) if hist else None

    bias_ma20 = round(((latest_c - latest_ma20) / latest_ma20) * 100.0, 2) if latest_ma20 else None
    bias_ma60 = round(((latest_c - latest_ma60) / latest_ma60) * 100.0, 2) if latest_ma60 else None

    metrics = {
        "ret_1d": pct_return(closes, 1),
        "ret_5d": pct_return(closes, 5),
        "ret_20d": pct_return(closes, 20),
        "ret_60d": pct_return(closes, 60),
        "ret_6m": pct_return(closes, min(125, len(closes) - 1)),
        "high_6m": round(high_6m, 2),
        "low_6m": round(low_6m, 2),
        "max_drawdown_6m": round(max_dd, 2),
        "volatility_20d": vol_20d,
        "avg_volume_20d": avg_vol_20d,
        "ma5": latest_ma5,
        "ma20": latest_ma20,
        "ma60": latest_ma60,
        "bias_ma20": bias_ma20,
        "bias_ma60": bias_ma60,
        "rsi14": latest_rsi,
        "macd_dif": latest_dif,
        "macd_dea": latest_dea,
        "macd_hist": latest_hist,
    }

    # 自動生成客觀技術面訊號
    signals: List[Dict[str, str]] = []
    if latest_ma5 and latest_ma20 and latest_ma60:
        if latest_c > latest_ma5 > latest_ma20 > latest_ma60:
            signals.append({"type": "bull", "label": "均線多頭排列 (價 > MA5 > MA20 > MA60)"})
        elif latest_c < latest_ma5 < latest_ma20 < latest_ma60:
            signals.append({"type": "bear", "label": "均線空頭排列 (價 < MA5 < MA20 < MA60)"})
        elif latest_c >= latest_ma20 and latest_c >= latest_ma60:
            signals.append({"type": "bull", "label": "股價站穩月線 MA20 與季線 MA60 之上"})
        elif latest_c < latest_ma20 and latest_c < latest_ma60:
            signals.append({"type": "bear", "label": "股價位於月線 MA20 與季線 MA60 之下"})
        else:
            signals.append({"type": "neutral", "label": "均線糾結震盪整理中"})

    if len(ma5) >= 2 and len(ma20) >= 2 and ma5[-1] and ma20[-1] and ma5[-2] and ma20[-2]:
        if ma5[-2] <= ma20[-2] and ma5[-1] > ma20[-1]:
            signals.append({"type": "bull", "label": "MA5 向上突破 MA20（短中期黃金交叉）"})
        elif ma5[-2] >= ma20[-2] and ma5[-1] < ma20[-1]:
            signals.append({"type": "bear", "label": "MA5 向下跌破 MA20（短中期死亡交叉）"})

    if latest_rsi is not None:
        if latest_rsi >= 70:
            signals.append({"type": "warn", "label": f"RSI(14) = {latest_rsi:.1f} 進入超買強勢區"})
        elif latest_rsi <= 30:
            signals.append({"type": "warn", "label": f"RSI(14) = {latest_rsi:.1f} 進入超賣反彈觀察區"})
        elif latest_rsi >= 55:
            signals.append({"type": "bull", "label": f"RSI(14) = {latest_rsi:.1f} 動能偏多"})
        elif latest_rsi <= 45:
            signals.append({"type": "bear", "label": f"RSI(14) = {latest_rsi:.1f} 動能偏弱"})
        else:
            signals.append({"type": "neutral", "label": f"RSI(14) = {latest_rsi:.1f} 處於中性區間"})

    if len(hist) >= 2:
        if hist[-2] <= 0 < hist[-1]:
            signals.append({"type": "bull", "label": "MACD 柱狀體翻紅（多方動能轉強）"})
        elif hist[-2] >= 0 > hist[-1]:
            signals.append({"type": "bear", "label": "MACD 柱狀體翻綠（空方動能增強）"})
        elif hist[-1] > 0:
            signals.append({"type": "bull", "label": "MACD DIF 位於訊號線上方"})
        else:
            signals.append({"type": "bear", "label": "MACD DIF 位於訊號線下方"})

    return metrics, signals


def main() -> int:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        config = json.load(f)

    twse_vals = fetch_twse_valuations()
    tpex_vals = fetch_tpex_valuations()
    opener, crumb = create_yahoo_session()

    yahoo_symbols = [s["yahoo_symbol"] for s in config["stocks"]]
    yahoo_quotes = fetch_yahoo_quotes(yahoo_symbols, opener, crumb)

    segment_map = {seg["id"]: seg["label"] for seg in config["segments"]}
    stocks_out: List[Dict[str, Any]] = []

    tw_dates = []
    us_dates = []
    jp_dates = []
    kr_dates = []

    for item in config["stocks"]:
        stock_id = item["id"]
        ysym = item["yahoo_symbol"]
        market = item["market"]
        print(f"-> 擷取 {stock_id} ({item['name']}) [{ysym}] ...")

        try:
            history = fetch_yahoo_history(ysym, market, opener)
            if len(history) < 2:
                print(f"  [WARN] {stock_id} 歷史資料不足 ({len(history)} 筆)，跳過")
                continue

            latest_bar = history[-1]
            prev_bar = history[-2]
            prev_close = prev_bar["c"]
            change = round(latest_bar["c"] - prev_close, 2)
            change_pct = round((change / prev_close) * 100.0, 2) if prev_close else 0.0

            metrics, signals = analyze_stock(history)

            # 結合官方估值資料
            yq = yahoo_quotes.get(ysym, {})
            if market == "TW":
                if item.get("exchange") == "TPEx":
                    official = tpex_vals.get(stock_id, {})
                else:
                    official = twse_vals.get(stock_id, {})
                fundamentals = {
                    "pe": official.get("pe") if official.get("pe") is not None else yq.get("pe"),
                    "forward_pe": yq.get("forward_pe"),
                    "pb": official.get("pb") if official.get("pb") is not None else yq.get("pb"),
                    "dividend_yield": (
                        official.get("dividend_yield")
                        if official.get("dividend_yield") is not None
                        else yq.get("dividend_yield")
                    ),
                    "market_cap": yq.get("market_cap"),
                    "valuation_date": official.get("valuation_date"),
                }
                tw_dates.append(latest_bar["d"])
            else:
                fundamentals = {
                    "pe": yq.get("pe"),
                    "forward_pe": yq.get("forward_pe"),
                    "pb": yq.get("pb"),
                    "dividend_yield": yq.get("dividend_yield"),
                    "market_cap": yq.get("market_cap"),
                    "valuation_date": latest_bar["d"],
                }
                if market == "JP":
                    jp_dates.append(latest_bar["d"])
                elif market == "KR":
                    kr_dates.append(latest_bar["d"])
                else:
                    us_dates.append(latest_bar["d"])

            stocks_out.append(
                {
                    "id": stock_id,
                    "yahoo_symbol": ysym,
                    "name": item["name"],
                    "en_name": item["en_name"],
                    "market": market,
                    "exchange": item["exchange"],
                    "currency": item["currency"],
                    "segment": item["segment"],
                    "segment_label": segment_map.get(item["segment"], item["segment"]),
                    "tagline": item["tagline"],
                    "featured": bool(item.get("featured", False)),
                    "is_index": bool(item.get("is_index", False)),
                    "latest": {
                        "date": latest_bar["d"],
                        "open": latest_bar["o"],
                        "high": latest_bar["h"],
                        "low": latest_bar["l"],
                        "close": latest_bar["c"],
                        "prev_close": prev_close,
                        "change": change,
                        "change_pct": change_pct,
                        "volume": latest_bar["v"],
                    },
                    "metrics": metrics,
                    "fundamentals": fundamentals,
                    "signals": signals,
                    "history": history,
                }
            )
            print(
                f"  [OK] {latest_bar['d']} 收盤 {latest_bar['c']} ({change_pct:+.2f}%) | "
                f"PE={fundamentals['pe']} PB={fundamentals['pb']} RSI={metrics['rsi14']}"
            )
        except Exception as e:
            print(f"  [ERROR] 擷取 {stock_id} 失敗: {e}")

        time.sleep(0.25)

    if not stocks_out:
        print("[FAIL] 未能成功取得任何股票資料", file=sys.stderr)
        return 1

    tz_tw = datetime.timezone(datetime.timedelta(hours=8))
    payload = {
        "generated_at": datetime.datetime.now(tz=tz_tw).isoformat(timespec="seconds"),
        "data_date_tw": max(tw_dates) if tw_dates else None,
        "data_date_us": max(us_dates) if us_dates else None,
        "data_date_jp": max(jp_dates) if jp_dates else None,
        "data_date_kr": max(kr_dates) if kr_dates else None,
        "segments": config["segments"],
        "stocks": stocks_out,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(JSON_OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    with open(JS_OUT_PATH, "w", encoding="utf-8") as f:
        f.write("window.__SEMI_STOCKS_DATA__ = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    print(f"\n[DONE] 已輸出 {len(stocks_out)} 檔標的至 {JSON_OUT_PATH} 與 {JS_OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
