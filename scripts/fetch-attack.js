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

  // 2. Chunk symbols into batches of 20 and fetch daily candles (1mo)
  const batches = [];
  for (let i = 0; i < allSyms.length; i += 20) {
    batches.push(allSyms.slice(i, i + 20));
  }

  const dailyMap = {};
  const concurrency = 6;
  let bIdx = 0;

  async function worker() {
    while (bIdx < batches.length) {
      const b = batches[bIdx++];
      const url = Model.sparkCandlesUrl(b, "1d", "1mo");
      if (!url) continue;
      const res = await fetchHttps(url, { "User-Agent": "Mozilla/5.0" });
      if (res.ok && res.data) {
        const parsed = Model.parseSparkCandles(res.data, "1d");
        Object.assign(dailyMap, parsed);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // 3. Compute Attack Metrics per Basket
  const evaluatedBaskets = [];
  const allLaggards = [];

  for (const b of baskets) {
    const data = basketsMap[b.symbol];
    const holdings = data ? data.holdings : [];
    const metrics = Model.computeBasketAttackMetrics(b.symbol, b.name, b.category, holdings, dailyMap);

    // Also check if the ETF itself is printing an attack
    const etfCandles = dailyMap[b.symbol];
    if (etfCandles && etfCandles.length >= 2) {
      metrics.etfAttack = Model.detectStratAttack(etfCandles);
    } else {
      metrics.etfAttack = { attackType: "none", direction: "neutral", state: "none", label: "-" };
    }

    evaluatedBaskets.push(metrics);

    for (const lag of metrics.laggards) {
      allLaggards.push(Object.assign({ parentBasket: b.symbol, basketStatus: metrics.status }, lag));
    }
  }

  const sortedBaskets = Model.sortAttackBaskets(evaluatedBaskets, "attack", false);

  const topBullish = sortedBaskets.filter(b => b.pctAttack2u > 0 || b.pct2u >= 60).slice(0, 5);
  const topBearish = sortedBaskets.filter(b => b.pctAttack2d > 0 || b.pct2d >= 60).slice(0, 5);

  // Sort global laggards by tightest distance to trigger
  allLaggards.sort((a, b) => (a.distToTriggerPct != null ? a.distToTriggerPct : 999) - (b.distToTriggerPct != null ? b.distToTriggerPct : 999));
  const topLaggards = allLaggards.slice(0, 15);

  const output = {
    timestamp: Date.now(),
    baskets: sortedBaskets,
    topBullishAttacks: topBullish,
    topBearishAttacks: topBearish,
    topLaggards: topLaggards
  };

  process.stdout.write(JSON.stringify(output));
}

run().catch((e) => {
  process.stderr.write(String(e && e.message ? e.message : e));
  process.exit(1);
});
