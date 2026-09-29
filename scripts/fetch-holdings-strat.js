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
  const targetSymbol = Model.normalizeSymbol(process.argv[2] || "XLC");
  if (!targetSymbol) {
    process.stdout.write(JSON.stringify({ error: "Missing symbol" }));
    return;
  }

  // 1. Fetch holdings if SPDR sector
  const hUrl = Model.holdingsUrl(targetSymbol);
  if (!hUrl) {
    process.stdout.write(JSON.stringify({ error: "Invalid holdings URL for " + targetSymbol }));
    return;
  }

  const hRes = await fetchHttps(hUrl, { "User-Agent": "Omafinance research@omafinance.org" });
  if (!hRes.ok || !hRes.data) {
    process.stdout.write(JSON.stringify({ error: "Failed to fetch holdings for " + targetSymbol }));
    return;
  }

  const parsed = Model.parseNportXml(hRes.data, targetSymbol);
  if (!parsed || !parsed.holdings || parsed.holdings.length === 0) {
    process.stdout.write(JSON.stringify({ symbol: targetSymbol, holdings: [], stratMap: {} }));
    return;
  }

  const holdings = parsed.holdings;
  const symSeen = {};
  const allSyms = [];
  for (const h of holdings) {
    if (h.symbol && !symSeen[h.symbol] && !h.delisted) {
      symSeen[h.symbol] = true;
      allSyms.push(h.symbol);
    }
  }

  // 2. Fetch full OHLC daily (2y) and hourly 60m (1mo) candles per symbol
  const dailyMap = {};
  const hourlyMap = {};
  const concurrency = 8;

  let symIdx = 0;
  async function worker() {
    while (symIdx < allSyms.length) {
      const sym = allSyms[symIdx++];
      const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2y`;
      const hourlyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=60m&range=1mo`;

      const [dRes, hRes] = await Promise.all([
        fetchHttps(dailyUrl, { "User-Agent": "Mozilla/5.0" }),
        fetchHttps(hourlyUrl, { "User-Agent": "Mozilla/5.0" })
      ]);

      if (dRes.ok && dRes.data) {
        try {
          const dj = JSON.parse(dRes.data);
          const r = dj && dj.chart && dj.chart.result && dj.chart.result[0];
          if (r && r.timestamp && r.indicators) {
            dailyMap[sym] = Model.parseCandles(r.timestamp, r.indicators);
          }
        } catch (e) {}
      }

      if (hRes.ok && hRes.data) {
        try {
          const hj = JSON.parse(hRes.data);
          const r = hj && hj.chart && hj.chart.result && hj.chart.result[0];
          if (r && r.timestamp && r.indicators) {
            const rawCandles = Model.parseCandles(r.timestamp, r.indicators);
            hourlyMap[sym] = Model.mergePeriodCandles(rawCandles, "60");
          }
        } catch (e) {}
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const stratMap = Model.computeHoldingsStratMap(holdings, hourlyMap, dailyMap);

  const output = {
    symbol: targetSymbol,
    reportDate: parsed.reportDate,
    holdings: holdings,
    stratMap: stratMap
  };

  process.stdout.write(JSON.stringify(output));
}

run().catch((e) => {
  process.stderr.write(String(e && e.message ? e.message : e));
  process.exit(1);
});
