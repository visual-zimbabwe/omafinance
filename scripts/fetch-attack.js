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
  const baskets = Model.allAttackBasketsList();

  // 1. Load or resolve holdings for all baskets in parallel
  const holdingsPromises = baskets.map(async (b) => {
    try {
      const parsed = await resolveEtfHoldings(b.symbol);
      return { symbol: b.symbol, name: b.name, category: b.category, holdings: (parsed && parsed.holdings) ? parsed.holdings : [] };
    } catch (e) {
      return { symbol: b.symbol, name: b.name, category: b.category, holdings: [] };
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

  // Also include the ETF symbols themselves to evaluate ETF-level attacks
  for (const b of baskets) {
    if (!symSeen[b.symbol]) {
      symSeen[b.symbol] = true;
      allSyms.push(b.symbol);
    }
  }

  // 2. Fetch full OHLC daily candles (3mo) per symbol in parallel and derive weekly candles
  const dailyMap = {};
  const weeklyMap = {};
  const concurrency = 20;
  let symIdx = 0;

  async function worker() {
    while (symIdx < allSyms.length) {
      const sym = allSyms[symIdx++];
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=3mo&includePrePost=false`;
      const res = await fetchHttps(url, { "User-Agent": "Mozilla/5.0" });
      if (res.ok && res.data) {
        try {
          const j = JSON.parse(res.data);
          const r = j && j.chart && j.chart.result && j.chart.result[0];
          if (r && r.timestamp && r.indicators) {
            const daily = Model.parseCandles(r.timestamp, r.indicators);
            dailyMap[sym] = daily;
            weeklyMap[sym] = Model.mergePeriodCandles(daily, "1W");
          }
        } catch (e) {}
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // 2b. For Focus Baskets (XLC, SMH), fetch 30m, 60m, and 1M candles
  const focusPairsMap = Model.focusBasketPairs();
  const focusBasketSymbols = ["XLC", "SMH"];
  const focusSymsSet = {};
  for (const fb of focusBasketSymbols) {
    focusSymsSet[fb] = true;
    const bData = basketsMap[fb];
    if (bData && bData.holdings) {
      for (const h of bData.holdings) {
        if (h && h.symbol && !h.delisted) {
          focusSymsSet[h.symbol] = true;
        }
      }
    }
  }
  focusSymsSet["GOOGL"] = true;
  focusSymsSet["META"] = true;
  focusSymsSet["NVDA"] = true;
  focusSymsSet["TSM"] = true;
  const focusSymsList = Object.keys(focusSymsSet);

  const tf30Map = {};
  const tf60Map = {};
  const monthlyMap = {};

  let fIdx = 0;
  async function focusWorker() {
    while (fIdx < focusSymsList.length) {
      const sym = focusSymsList[fIdx++];

      // Fetch 30m (5d)
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

      // Fetch 60m (1mo) or derive from 30m
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

      // Fetch 1M (2y) or derive from daily
      try {
        const u1m = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1mo&range=2y&includePrePost=false`;
        const res1m = await fetchHttps(u1m, { "User-Agent": "Mozilla/5.0" });
        if (res1m.ok && res1m.data) {
          const j1m = JSON.parse(res1m.data);
          const r1m = j1m && j1m.chart && j1m.chart.result && j1m.chart.result[0];
          if (r1m && r1m.timestamp && r1m.indicators) {
            monthlyMap[sym] = Model.parseCandles(r1m.timestamp, r1m.indicators);
          }
        }
      } catch (e) {}
      if (!monthlyMap[sym] && dailyMap[sym]) {
        monthlyMap[sym] = Model.mergePeriodCandles(dailyMap[sym], "1M");
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => focusWorker()));

  // 3. Compute Attack Metrics per Basket for Daily and Weekly timeframes
  const evaluatedDailyBaskets = [];
  const evaluatedWeeklyBaskets = [];
  const allDailyLaggards = [];
  const allWeeklyLaggards = [];

  for (const b of baskets) {
    const data = basketsMap[b.symbol];
    const holdings = data ? data.holdings : [];

    // Daily metrics
    const dailyMetrics = Model.computeBasketAttackMetrics(b.symbol, b.name, b.category, holdings, dailyMap, null, "1D");
    const etfDaily = dailyMap[b.symbol];
    if (etfDaily && etfDaily.length >= 2) {
      dailyMetrics.etfAttack = Model.detectStratAttack(etfDaily);
      dailyMetrics.wtd = Model.extractWtdDailyCandles(etfDaily, null, dailyMetrics.etfAttack.triggerPrice, dailyMetrics.etfAttack.direction, "1D");
    } else {
      dailyMetrics.etfAttack = { attackType: "none", direction: "neutral", state: "none", label: "-" };
      dailyMetrics.wtd = { candles: [], weekHigh: 0, weekLow: 0, triggerPrice: 0, triggerDirection: "neutral" };
    }

    // Weekly metrics
    const weeklyMetrics = Model.computeBasketAttackMetrics(b.symbol, b.name, b.category, holdings, weeklyMap, null, "1W");
    const etfWeekly = weeklyMap[b.symbol];
    if (etfWeekly && etfWeekly.length >= 2) {
      weeklyMetrics.etfAttack = Model.detectStratAttack(etfWeekly);
      weeklyMetrics.wtd = Model.extractWtdDailyCandles(etfWeekly, null, weeklyMetrics.etfAttack.triggerPrice, weeklyMetrics.etfAttack.direction, "1W");
    } else {
      weeklyMetrics.etfAttack = { attackType: "none", direction: "neutral", state: "none", label: "-" };
      weeklyMetrics.wtd = { candles: [], weekHigh: 0, weekLow: 0, triggerPrice: 0, triggerDirection: "neutral" };
    }

    // Cross-link summary indicators
    dailyMetrics.weeklyAttackPct = weeklyMetrics.pctAttack2u > weeklyMetrics.pctAttack2d ? weeklyMetrics.pctAttack2u : -weeklyMetrics.pctAttack2d;
    dailyMetrics.weeklyStatus = weeklyMetrics.status;
    weeklyMetrics.dailyAttackPct = dailyMetrics.pctAttack2u > dailyMetrics.pctAttack2d ? dailyMetrics.pctAttack2u : -dailyMetrics.pctAttack2d;
    weeklyMetrics.dailyStatus = dailyMetrics.status;

    evaluatedDailyBaskets.push(dailyMetrics);
    evaluatedWeeklyBaskets.push(weeklyMetrics);

    for (const lag of dailyMetrics.laggards) {
      allDailyLaggards.push(Object.assign({ parentBasket: b.symbol, basketStatus: dailyMetrics.status }, lag));
    }
    for (const lag of weeklyMetrics.laggards) {
      allWeeklyLaggards.push(Object.assign({ parentBasket: b.symbol, basketStatus: weeklyMetrics.status }, lag));
    }
  }

  const sortedDailyBaskets = Model.sortAttackBaskets(evaluatedDailyBaskets, "attack", false);
  const sortedWeeklyBaskets = Model.sortAttackBaskets(evaluatedWeeklyBaskets, "attack", false);

  const topBullishDaily = sortedDailyBaskets.filter(b => b.pctAttack2u > 0 || b.pct2u >= 60).slice(0, 5);
  const topBearishDaily = sortedDailyBaskets.filter(b => b.pctAttack2d > 0 || b.pct2d >= 60).slice(0, 5);

  const topBullishWeekly = sortedWeeklyBaskets.filter(b => b.pctAttack2u > 0 || b.pct2u >= 60).slice(0, 5);
  const topBearishWeekly = sortedWeeklyBaskets.filter(b => b.pctAttack2d > 0 || b.pct2d >= 60).slice(0, 5);

  allDailyLaggards.sort((a, b) => (a.distToTriggerPct != null ? a.distToTriggerPct : 999) - (b.distToTriggerPct != null ? b.distToTriggerPct : 999));
  const topDailyLaggards = allDailyLaggards.slice(0, 15);

  allWeeklyLaggards.sort((a, b) => (a.distToTriggerPct != null ? a.distToTriggerPct : 999) - (b.distToTriggerPct != null ? b.distToTriggerPct : 999));
  const topWeeklyLaggards = allWeeklyLaggards.slice(0, 15);

  // Compute Focus Pairs Multi-Timeframe metrics (30m, 60m, 1D, 1W, 1M)
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

  // Package Focus Basket Constituent Candle Histories for dynamic Replay
  const focusCandles = {
    "30": {},
    "60": {},
    "1D": {},
    "1W": {},
    "1M": {}
  };
  for (const s of focusSymsList) {
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
    daily: {
      baskets: sortedDailyBaskets,
      topBullishAttacks: topBullishDaily,
      topBearishAttacks: topBearishDaily,
      topLaggards: topDailyLaggards
    },
    weekly: {
      baskets: sortedWeeklyBaskets,
      topBullishAttacks: topBullishWeekly,
      topBearishAttacks: topBearishWeekly,
      topLaggards: topWeeklyLaggards
    },
    focusPairs: focusPairsOutput,
    focusCandles: focusCandles,
    focusHoldings: focusHoldings,
    // Backwards compatibility with existing root properties
    baskets: sortedDailyBaskets,
    topBullishAttacks: topBullishDaily,
    topBearishAttacks: topBearishDaily,
    topLaggards: topDailyLaggards
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
