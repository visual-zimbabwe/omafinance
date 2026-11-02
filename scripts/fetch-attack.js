const fs = require("fs");
const path = require("path");
const https = require("https");
const Model = require("../src/Model.js");
const { resolveEtfHoldings } = require("./fetch-etf-holdings.js");

function fetchHttps(url, headers) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: headers || { "User-Agent": "Mozilla/5.0" },
        timeout: 9000
      }, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => resolve({ ok: res.statusCode === 200, data }));
      });
      req.on("error", () => resolve({ ok: false, data: "" }));
      req.on("timeout", () => { req.destroy(); resolve({ ok: false, data: "" }); });
      req.end();
    } catch (e) {
      resolve({ ok: false, data: "" });
    }
  });
}

async function run() {
  const focusPairsMap = Model.focusBasketPairs();
  const focusBasketSymbols = ["XLC", "SMH"];

  // 1. Resolve holdings for focus baskets (XLC, SMH)
  const holdingsPromises = focusBasketSymbols.map(async (sym) => {
    try {
      const parsed = await resolveEtfHoldings(sym);
      return { symbol: sym, name: sym === "XLC" ? "Communication Services" : "Semiconductors", holdings: (parsed && parsed.holdings) ? parsed.holdings : [] };
    } catch (e) {
      return { symbol: sym, name: sym, holdings: [] };
    }
  });

  const holdingsResults = await Promise.all(holdingsPromises);
  const basketsMap = {};
  const symSeen = {};
  const allSyms = [];

  for (const item of holdingsResults) {
    if (item && item.symbol) {
      basketsMap[item.symbol] = item;
      for (const h of item.holdings) {
        if (h && h.symbol && !symSeen[h.symbol] && !h.delisted) {
          symSeen[h.symbol] = true;
          allSyms.push(h.symbol);
        }
      }
    }
  }

  // Ensure focus tickers and peers are included
  const requiredSymbols = ["GOOGL", "META", "NVDA", "TSM", "XLC", "SMH"];
  for (const s of requiredSymbols) {
    if (!symSeen[s]) {
      symSeen[s] = true;
      allSyms.push(s);
    }
  }

  const dailyMap = {};
  const weeklyMap = {};
  const tf30Map = {};
  const tf60Map = {};
  const monthlyMap = {};
  const concurrency = 15;

  // 2. Fetch Daily candles (3mo) and derive Weekly & Monthly
  let dIdx = 0;
  async function dailyWorker() {
    while (dIdx < allSyms.length) {
      const sym = allSyms[dIdx++];
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo&includePrePost=false`;
        const res = await fetchHttps(url, { "User-Agent": "Mozilla/5.0" });
        if (res.ok && res.data) {
          const j = JSON.parse(res.data);
          const r = j && j.chart && j.chart.result && j.chart.result[0];
          if (r && r.timestamp && r.indicators) {
            const daily = Model.parseCandles(r.timestamp, r.indicators);
            dailyMap[sym] = daily;
            weeklyMap[sym] = Model.mergePeriodCandles(daily, "1W");
            monthlyMap[sym] = Model.mergePeriodCandles(daily, "1M");
          }
        }
      } catch (e) {}
    }
  }

  // 3. Fetch 30m candles (5d) and 60m candles (1mo)
  let iIdx = 0;
  async function intradayWorker() {
    while (iIdx < allSyms.length) {
      const sym = allSyms[iIdx++];

      // 30m
      try {
        const u30 = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=30m&range=5d&includePrePost=false`;
        const res30 = await fetchHttps(u30, { "User-Agent": "Mozilla/5.0" });
        if (res30.ok && res30.data) {
          const j30 = JSON.parse(res30.data);
          const r30 = j30 && j30.chart && j30.chart.result && j30.chart.result[0];
          if (r30 && r30.timestamp && r30.indicators) {
            tf30Map[sym] = Model.parseCandles(r30.timestamp, r30.indicators);
          }
        }
      } catch (e) {}

      // 60m (or derive from 30m)
      try {
        const u60 = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=60m&range=1mo&includePrePost=false`;
        const res60 = await fetchHttps(u60, { "User-Agent": "Mozilla/5.0" });
        if (res60.ok && res60.data) {
          const j60 = JSON.parse(res60.data);
          const r60 = j60 && j60.chart && j60.chart.result && j60.chart.result[0];
          if (r60 && r60.timestamp && r60.indicators) {
            tf60Map[sym] = Model.parseCandles(r60.timestamp, r60.indicators);
          }
        }
      } catch (e) {}
      if (!tf60Map[sym] && tf30Map[sym]) {
        tf60Map[sym] = Model.mergePeriodCandles(tf30Map[sym], "60");
      }
    }
  }

  await Promise.all([
    ...Array.from({ length: concurrency }, () => dailyWorker()),
    ...Array.from({ length: concurrency }, () => intradayWorker())
  ]);

  // 4. Compute Focus Pairs Multi-Timeframe metrics (30m, 60m, 1D, 1W, 1M)
  const focusTfs = ["30", "60", "1D", "1W", "1M"];
  const tfMaps = {
    "30": tf30Map,
    "60": tf60Map,
    "1D": dailyMap,
    "1W": weeklyMap,
    "1M": monthlyMap
  };

  const focusPairsOutput = {};
  for (const sym of Object.keys(focusPairsMap)) {
    const pair = focusPairsMap[sym];
    const bData = basketsMap[pair.basket];
    const holdings = bData ? bData.holdings : [];
    const tfDetails = {};

    for (const tf of focusTfs) {
      const cMap = tfMaps[tf] || {};
      const bMetrics = Model.computeBasketAttackMetrics(pair.basket, bData ? bData.name : pair.basket, "Sector", holdings, cMap, null, tf);

      // Key peer scenario & price
      const peerCandles = cMap[pair.peer];
      let peerInfo = { symbol: pair.peer, scenario: "-", color: "-", price: null, inForce: "-" };
      if (peerCandles && peerCandles.length >= 2) {
        const pLast = peerCandles[peerCandles.length - 1];
        const pPrev = peerCandles[peerCandles.length - 2];
        const sc = Model.stratScenario(pLast, pPrev);
        const col = Number(pLast.close) >= Number(pLast.open) ? "G" : "R";
        let inf = "-";
        if (sc === "2u") inf = Number(pLast.close) >= Number(pPrev.high) ? "In-Force" : "Triggered";
        else if (sc === "2d") inf = Number(pLast.close) <= Number(pPrev.low) ? "In-Force" : "Triggered";
        else if (sc === "1") inf = "Inside Bar";
        peerInfo = {
          symbol: pair.peer,
          scenario: sc,
          color: col,
          price: Number(pLast.close),
          inForce: inf
        };
      }

      tfDetails[tf] = {
        basket: pair.basket,
        timeframe: tf,
        status: bMetrics.status,
        pct2u: bMetrics.pct2u,
        pct2d: bMetrics.pct2d,
        pctAttack2u: bMetrics.pctAttack2u,
        pctAttack2d: bMetrics.pctAttack2d,
        count2u: bMetrics.count2u,
        count2d: bMetrics.count2d,
        totalHoldings: bMetrics.totalHoldings,
        peer: peerInfo
      };
    }

    focusPairsOutput[sym] = {
      symbol: sym,
      basket: pair.basket,
      peer: pair.peer,
      timeframes: tfDetails
    };
  }

  // 5. Package Focus Basket Constituent Candle Histories for dynamic Replay
  const focusCandles = {
    "30": {},
    "60": {},
    "1D": {},
    "1W": {},
    "1M": {}
  };
  for (const s of allSyms) {
    if (tf30Map[s]) focusCandles["30"][s] = tf30Map[s];
    if (tf60Map[s]) focusCandles["60"][s] = tf60Map[s];
    if (dailyMap[s]) focusCandles["1D"][s] = dailyMap[s];
    if (weeklyMap[s]) focusCandles["1W"][s] = weeklyMap[s];
    if (monthlyMap[s]) focusCandles["1M"][s] = monthlyMap[s];
  }

  const focusHoldings = {};
  for (const fb of focusBasketSymbols) {
    const bData = basketsMap[fb];
    focusHoldings[fb] = (bData && bData.holdings) ? bData.holdings : [];
  }

  const output = {
    timestamp: Date.now(),
    focusPairs: focusPairsOutput,
    focusCandles: focusCandles,
    focusHoldings: focusHoldings
  };

  try {
    const cacheDir = path.join(process.env.HOME || "/home/juwimana", ".cache", "omafinance");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "attack.json"), JSON.stringify(output), "utf8");
  } catch (e) {}

  process.stdout.write(JSON.stringify(output));
}

run().catch((e) => {
  process.stderr.write(String(e && e.message ? e.message : e));
  process.exit(1);
});
