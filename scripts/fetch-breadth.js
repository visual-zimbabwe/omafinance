const https = require("https");
const path = require("path");
const Model = require("../src/Model.js");

function fetchHttps(url, headers) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: headers || { "User-Agent": "Mozilla/5.0" },
        timeout: 8000
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
  const sectors = Model.allSpdrSectorsList();
  
  // 1. Fetch all sector holdings in parallel
  const holdingsPromises = sectors.map(async (s) => {
    const url = Model.holdingsUrl(s.symbol);
    if (!url) return { symbol: s.symbol, parsed: null };
    const res = await fetchHttps(url, { "User-Agent": "Omafinance research@omafinance.org" });
    if (!res.ok || !res.data) return { symbol: s.symbol, parsed: null };
    const parsed = Model.parseNportXml(res.data, s.symbol);
    return { symbol: s.symbol, parsed };
  });

  const holdingsResults = await Promise.all(holdingsPromises);
  const holdingsMap = {};
  const symSeen = {};
  const allSyms = [];

  for (const item of holdingsResults) {
    if (item && item.symbol && item.parsed) {
      holdingsMap[item.symbol] = item.parsed;
      for (const h of (item.parsed.holdings || [])) {
        if (!symSeen[h.symbol] && !h.delisted) {
          symSeen[h.symbol] = true;
          allSyms.push(h.symbol);
        }
      }
    }
  }

  // 2. Chunk symbols into batches of 20
  const batches = [];
  for (let i = 0; i < allSyms.length; i += 20) {
    batches.push(allSyms.slice(i, i + 20));
  }

  const dailyMap = {};
  const hourlyMap = {};
  const concurrency = 4;

  let dIdx = 0;
  async function dailyWorker() {
    while (dIdx < batches.length) {
      const b = batches[dIdx++];
      const url = Model.sparkCandlesUrl(b, "1d", "2y");
      if (!url) continue;
      const res = await fetchHttps(url, { "User-Agent": "Mozilla/5.0" });
      if (res.ok && res.data) {
        const parsed = Model.parseSparkCandles(res.data, "1d");
        Object.assign(dailyMap, parsed);
      }
    }
  }

  let hIdx = 0;
  async function hourlyWorker() {
    while (hIdx < batches.length) {
      const b = batches[hIdx++];
      const url = Model.sparkCandlesUrl(b, "60m", "1mo");
      if (!url) continue;
      const res = await fetchHttps(url, { "User-Agent": "Mozilla/5.0" });
      if (res.ok && res.data) {
        const parsed = Model.parseSparkCandles(res.data, "60m");
        Object.assign(hourlyMap, parsed);
      }
    }
  }

  await Promise.all([
    ...Array.from({ length: concurrency }, () => dailyWorker()),
    ...Array.from({ length: concurrency }, () => hourlyWorker())
  ]);

  // Precompute breadth metrics in background node process to keep QML UI thread completely non-blocking
  const equalMetrics = Model.computeAllSectorsBreadth(holdingsMap, hourlyMap, dailyMap, "equal");
  const capMetrics = Model.computeAllSectorsBreadth(holdingsMap, hourlyMap, dailyMap, "cap");

  const output = {
    timestamp: Date.now(),
    equalMetrics: equalMetrics,
    capMetrics: capMetrics,
    sectorsHoldings: holdingsMap
  };

  process.stdout.write(JSON.stringify(output));
}

run().catch((e) => {
  process.stderr.write(String(e && e.message ? e.message : e));
  process.exit(1);
});
