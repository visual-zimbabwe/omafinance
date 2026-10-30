const fs = require("fs");
const path = require("path");
const https = require("https");
const Model = require("../src/Model.js");

const CACHE_DIR = path.join(process.env.HOME || "/tmp", ".cache", "omafinance");
const HOLDINGS_CACHE_DIR = path.join(CACHE_DIR, "holdings");
const CUSIP_CACHE_FILE = path.join(CACHE_DIR, "cusip_cache.json");
const MF_TICKERS_CACHE_FILE = path.join(CACHE_DIR, "sec_company_tickers_mf.json");

const HOLDINGS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (N-PORT filings are quarterly)
const MF_TICKERS_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const SPECIALTY_ETFS = {
  "SPY": { cik: "0000884394", name: "SPDR S&P 500 ETF Trust" },
  "DIA": { cik: "0001041130", name: "SPDR Dow Jones Industrial Average ETF Trust" },
  "MDY": { cik: "0001004385", name: "SPDR S&P MidCap 400 ETF Trust" }
};

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
}

function readJsonFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (e) {}
  return null;
}

function writeJsonFile(filePath, data) {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (e) {}
}

function fetchHttps(url, options = {}) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || "GET",
        headers: Object.assign({
          "User-Agent": "Omafinance research@omafinance.org",
          "Accept": "*/*"
        }, options.headers || {}),
        timeout: options.timeout || 12000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          return fetchHttps(redirectUrl, options).then(resolve);
        }
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => resolve({ ok: res.statusCode === 200, statusCode: res.statusCode, data }));
      });
      req.on("error", () => resolve({ ok: false, data: "" }));
      req.on("timeout", () => { req.destroy(); resolve({ ok: false, data: "" }); });
      if (options.body) req.write(options.body);
      req.end();
    } catch (e) {
      resolve({ ok: false, data: "" });
    }
  });
}

async function loadMfTickers() {
  ensureDir(CACHE_DIR);
  let cached = null;
  try {
    if (fs.existsSync(MF_TICKERS_CACHE_FILE)) {
      const stat = fs.statSync(MF_TICKERS_CACHE_FILE);
      if (Date.now() - stat.mtimeMs < MF_TICKERS_TTL_MS) {
        cached = JSON.parse(fs.readFileSync(MF_TICKERS_CACHE_FILE, "utf8"));
      }
    }
  } catch (e) {}

  if (cached && typeof cached === "object") {
    return cached;
  }

  const res = await fetchHttps("https://www.sec.gov/files/company_tickers_mf.json");
  if (res.ok && res.data) {
    try {
      const raw = JSON.parse(res.data);
      const rows = raw.data || [];
      const map = {};
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const sym = String(row[3] || "").trim().toUpperCase();
        if (sym && !map[sym]) {
          map[sym] = {
            cik: String(row[0]).padStart(10, "0"),
            seriesId: String(row[1] || "").trim(),
            classId: String(row[2] || "").trim()
          };
        }
      }
      writeJsonFile(MF_TICKERS_CACHE_FILE, map);
      return map;
    } catch (e) {}
  }

  return cached || {};
}

function loadCusipCache() {
  const cached = readJsonFile(CUSIP_CACHE_FILE);
  return (cached && typeof cached === "object") ? cached : {};
}

function saveCusipCache(map) {
  writeJsonFile(CUSIP_CACHE_FILE, map);
}

async function resolveMissingViaOpenFigi(unresolvedItems, cusipCache) {
  if (!Array.isArray(unresolvedItems) || unresolvedItems.length === 0) return {};
  const queries = [];
  const queryMeta = [];

  for (const item of unresolvedItems) {
    if (item.isin) {
      queries.push({ idType: "ID_ISIN", idValue: item.isin });
      queryMeta.push({ key: item.isin, cusip: item.cusip, name: item.name });
    } else if (item.cusip) {
      queries.push({ idType: "ID_CUSIP", idValue: item.cusip });
      queryMeta.push({ key: item.cusip, cusip: item.cusip, name: item.name });
    }
  }

  if (queries.length === 0) return {};

  const chunks = [];
  for (let i = 0; i < queries.length; i += 100) {
    chunks.push({
      queries: queries.slice(i, i + 100),
      meta: queryMeta.slice(i, i + 100)
    });
  }

  const newlyResolved = {};

  for (const chunk of chunks) {
    const res = await fetchHttps("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chunk.queries)
    });

    if (res.ok && res.data) {
      try {
        const results = JSON.parse(res.data);
        for (let j = 0; j < results.length; j++) {
          const item = results[j];
          const meta = chunk.meta[j];
          if (!meta || !item || !Array.isArray(item.data) || item.data.length === 0) continue;

          const usItems = item.data.filter(d => ["US", "UN", "UQ", "UA", "UW"].includes(d.exchCode));
          const best = usItems.length > 0 ? usItems[0] : item.data[0];
          const ticker = Model.sanitizeTicker(best.ticker || "");
          if (ticker) {
            newlyResolved[meta.key] = ticker;
            if (meta.cusip) newlyResolved[meta.cusip] = ticker;
            cusipCache[meta.key] = ticker;
            if (meta.cusip) cusipCache[meta.cusip] = ticker;
          }
        }
      } catch (e) {}
    }
  }

  if (Object.keys(newlyResolved).length > 0) {
    saveCusipCache(cusipCache);
  }

  return newlyResolved;
}

function scanUnresolvedHoldings(xml, customMap) {
  const invstRegex = /<(?:\w+:)?invstOrSec>([\s\S]*?)<\/(?:\w+:)?invstOrSec>/gi;
  let match;
  const unmapped = [];
  const seenKeys = {};

  while ((match = invstRegex.exec(xml)) !== null) {
    const block = match[1];

    const assetCatMatch = block.match(/<(?:\w+:)?assetCat>([^<]+)<\/(?:\w+:)?assetCat>/i);
    const assetCat = assetCatMatch ? assetCatMatch[1].trim().toUpperCase() : "";
    if (assetCat !== "EC") continue;

    const nameMatch = block.match(/<(?:\w+:)?name>([^<]+)<\/(?:\w+:)?name>/i);
    const name = nameMatch ? nameMatch[1].trim() : "";

    const cusipMatch = block.match(/<(?:\w+:)?cusip>([^<]+)<\/(?:\w+:)?cusip>/i);
    let cusip = cusipMatch ? cusipMatch[1].trim().toUpperCase() : "";

    const isinMatch = block.match(/<(?:\w+:)?isin(?:\s+value="([^"]+)"|>([^<]+)<\/(?:\w+:)?isin>)/i);
    const isin = isinMatch ? (isinMatch[1] || isinMatch[2] || "").trim().toUpperCase() : "";

    if ((!cusip || /^0+$/.test(cusip)) && isin && isin.startsWith("US") && isin.length >= 11) {
      cusip = isin.slice(2, 11);
    }

    let symbol = Model.resolveCusipToTicker(cusip, name, customMap);
    if (!symbol && isin) {
      symbol = Model.resolveCusipToTicker(isin, name, customMap);
    }

    if (!symbol) {
      const tickerTagMatch = block.match(/<(?:\w+:)?ticker(?:\s+value="([^"]+)"|>([^<]+)<\/(?:\w+:)?ticker>)/i);
      if (tickerTagMatch) {
        symbol = (tickerTagMatch[1] || tickerTagMatch[2] || "").trim().toUpperCase();
      }
    }

    if (!symbol) {
      const key = isin || cusip;
      if (key && !seenKeys[key] && !/^0+$/.test(key)) {
        seenKeys[key] = true;
        unmapped.push({ cusip: cusip && !/^0+$/.test(cusip) ? cusip : null, isin: isin || null, name: name });
      }
    }
  }

  return unmapped;
}

async function resolveEtfHoldings(targetSymbol) {
  const normSym = Model.normalizeSymbol(targetSymbol);
  if (!normSym || Model.isCryptoSymbol(normSym)) {
    return { symbol: normSym, reportDate: "", holdings: [] };
  }

  // 1. Check local disk cache
  const cacheFile = path.join(HOLDINGS_CACHE_DIR, normSym + ".json");
  try {
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < HOLDINGS_CACHE_TTL_MS) {
        const cachedData = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        if (cachedData && cachedData.holdings && cachedData.holdings.length > 0) {
          return cachedData;
        }
      }
    }
  } catch (e) {}

  // 2. Resolve CIK & Series ID
  let cik = "";
  let seriesId = "";

  if (SPECIALTY_ETFS[normSym]) {
    cik = SPECIALTY_ETFS[normSym].cik;
    seriesId = SPECIALTY_ETFS[normSym].seriesId || "";
  } else if (Model.isSpdrSector(normSym)) {
    const info = Model.spdrSectorInfo(normSym);
    if (info) {
      cik = info.cik;
      seriesId = info.seriesId || "";
    }
  }

  if (!seriesId && !cik) {
    const mfTickers = await loadMfTickers();
    if (mfTickers && mfTickers[normSym]) {
      cik = mfTickers[normSym].cik;
      seriesId = mfTickers[normSym].seriesId;
    }
  }

  // 3. Fallback to static URL for SPDR if nothing else resolved
  let docUrl = null;
  if (seriesId) {
    const searchUrl = "https://efts.sec.gov/LATEST/search-index?q=" + encodeURIComponent(seriesId) + "&forms=NPORT-P";
    const sRes = await fetchHttps(searchUrl);
    if (sRes.ok && sRes.data) {
      try {
        const sJson = JSON.parse(sRes.data);
        const hits = (sJson.hits && sJson.hits.hits) ? sJson.hits.hits : [];
        if (hits.length > 0) {
          hits.sort((a, b) => ((b._source && b._source.file_date) || "").localeCompare((a._source && a._source.file_date) || ""));
          const latest = hits[0];
          const acc = String(latest._id || "").split(":")[0];
          const cleanAcc = acc.replace(/-/g, "");
          const cikStr = String((latest._source && latest._source.ciks && latest._source.ciks[0]) || cik || "");
          if (cleanAcc && cikStr) {
            docUrl = "https://www.sec.gov/Archives/edgar/data/" + parseInt(cikStr, 10) + "/" + cleanAcc + "/primary_doc.xml";
          }
        }
      } catch (e) {}
    }
  } else if (cik) {
    const searchUrl = "https://efts.sec.gov/LATEST/search-index?ciks=" + encodeURIComponent(cik) + "&forms=NPORT-P";
    const sRes = await fetchHttps(searchUrl);
    if (sRes.ok && sRes.data) {
      try {
        const sJson = JSON.parse(sRes.data);
        const hits = (sJson.hits && sJson.hits.hits) ? sJson.hits.hits : [];
        if (hits.length > 0) {
          hits.sort((a, b) => ((b._source && b._source.file_date) || "").localeCompare((a._source && a._source.file_date) || ""));
          const latest = hits[0];
          const acc = String(latest._id || "").split(":")[0];
          const cleanAcc = acc.replace(/-/g, "");
          const cikStr = String((latest._source && latest._source.ciks && latest._source.ciks[0]) || cik || "");
          if (cleanAcc && cikStr) {
            docUrl = "https://www.sec.gov/Archives/edgar/data/" + parseInt(cikStr, 10) + "/" + cleanAcc + "/primary_doc.xml";
          }
        }
      } catch (e) {}
    }
  }

  if (!docUrl && Model.isSpdrSector(normSym)) {
    docUrl = Model.holdingsUrl(normSym);
  }

  if (!docUrl) {
    return { symbol: normSym, reportDate: "", holdings: [] };
  }

  // 4. Fetch N-PORT XML
  const xmlRes = await fetchHttps(docUrl);
  if (!xmlRes.ok || !xmlRes.data) {
    return { symbol: normSym, reportDate: "", holdings: [] };
  }

  const xml = xmlRes.data;

  // 5. Build CUSIP / Ticker map and resolve unmapped holdings via OpenFIGI if needed
  const cusipCache = loadCusipCache();
  const unmapped = scanUnresolvedHoldings(xml, cusipCache);
  if (unmapped.length > 0) {
    const newlyResolved = await resolveMissingViaOpenFigi(unmapped, cusipCache);
    Object.assign(cusipCache, newlyResolved);
  }

  const parsed = Model.parseNportXml(xml, normSym, cusipCache);
  if (parsed && parsed.holdings && parsed.holdings.length > 0) {
    writeJsonFile(cacheFile, parsed);
    return parsed;
  }

  return { symbol: normSym, reportDate: "", holdings: [] };
}

async function run() {
  const targetSymbol = process.argv[2] || "SMH";
  const result = await resolveEtfHoldings(targetSymbol);
  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) {
  run().catch((e) => {
    process.stdout.write(JSON.stringify({ symbol: process.argv[2] || "", holdings: [], error: String(e && e.message ? e.message : e) }));
  });
}

module.exports = {
  resolveEtfHoldings,
  loadMfTickers,
  loadCusipCache,
  scanUnresolvedHoldings,
  resolveMissingViaOpenFigi
};
