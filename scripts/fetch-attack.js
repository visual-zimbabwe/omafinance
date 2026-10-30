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
    // Backwards compatibility with existing root properties
    baskets: sortedDailyBaskets,
    topBullishAttacks: topBullishDaily,
    topBearishAttacks: topBearishDaily,
    topLaggards: topDailyLaggards
  };

  process.stdout.write(JSON.stringify(output));
}

run().catch((e) => {
  process.stderr.write(String(e && e.message ? e.message : e));
  process.exit(1);
});
